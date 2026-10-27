"""Ask the assistant 20 questions per role and compare the answers with the database.

Round 2, 2.4. For each role (one active user of each role in the municipality,
or the users named with --user) the questions are built from that user's own
records: deadlines, plan status and progress of real cases, counts the
dashboards show, and a case that does not exist. Every answer goes through the
same validator the assistant uses, and count questions are compared with the
analytics figures. Mismatches are printed; the exit status is 1 if any.

    python manage.py ai_eval                 # needs AI_API_KEY
    python manage.py ai_eval --dry-run       # the questions and expected answers only
    python manage.py ai_eval --role audit --language en
"""
from __future__ import annotations

import re

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.ai.exceptions import AIUnavailable
from apps.ai.services.assistant.runner import clear_conversation, run_assistant
from apps.ai.services.assistant.tools import _issued, _qs
from apps.ai.services.assistant.validation import case_facts, validate_answer
from apps.core.analytics import cached_analytics
from apps.core.refs import record_code

ROLES = ("audit", "department_head", "employee", "council")


def questions_for(user, language):
    en = language == "en"
    cases = list(_issued(user).order_by("-id")[:5])
    totals = cached_analytics(user)["totals"]
    asked = []

    def add(text, expect=None, count=None):
        asked.append({"question": text, "expect": expect, "count": count})

    for rec in cases:
        facts = case_facts(rec, user)
        ref = record_code(rec.id)
        add(f"What is the binding deadline of {ref}?" if en else f"ما الموعد الملزم للتوصية {ref}؟", facts["deadline"])
        add(
            f"Does {ref} have an action plan, and how far along is it?" if en else f"هل للتوصية {ref} خطة عمل، وما نسبة إنجازها؟",
            f"plan {facts['plan_status']} {facts['plan_progress']}%" if facts["has_plan"] else "no plan",
        )
        add(f"What is the status of {ref}?" if en else f"ما حالة التوصية {ref}؟", facts["status"])
    for key, en_q, ar_q in (
        ("overdue", "How many recommendations are overdue?", "كم توصية متأخرة؟"),
        ("open", "How many recommendations are open?", "كم توصية مفتوحة؟"),
        ("high_risk_open", "How many high-risk recommendations are open?", "كم توصية عالية الخطورة مفتوحة؟"),
    ):
        add(en_q if en else ar_q, totals.get(key), count=totals.get(key))
    add("What is the deadline of REC-999999?" if en else "ما موعد التوصية REC-999999؟", "not found")
    while len(asked) < 20:
        add("Which of my recommendations need attention first?" if en else "ما التوصيات التي تحتاج اهتماماً أولاً؟")
    return asked[:20]


class Command(BaseCommand):
    help = "Evaluate the AI assistant against the database (20 questions per role)."

    def add_arguments(self, parser):
        parser.add_argument("--role", choices=ROLES, action="append")
        parser.add_argument("--user", action="append", help="username to evaluate (repeatable)")
        parser.add_argument("--language", choices=("ar", "en"), default="ar")
        parser.add_argument("--dry-run", action="store_true", help="print the questions and expected answers only")

    def handle(self, *args, **options):
        if options["user"]:
            users = list(User.objects.filter(username__in=options["user"], is_active=True))
        else:
            users = [
                user for user in (
                    User.objects.filter(role=role, is_active=True).order_by("id").first()
                    for role in (options["role"] or ROLES)
                ) if user
            ]
        if not users:
            raise CommandError("No users to evaluate.")
        language = options["language"]
        mismatches = 0
        for user in users:
            self.stdout.write(self.style.MIGRATE_HEADING(f"{user.role} ({user.username})"))
            for item in questions_for(user, language):
                if options["dry_run"]:
                    self.stdout.write(f"  Q: {item['question']}\n     expected: {item['expect']}")
                    continue
                clear_conversation(user)
                try:
                    result = run_assistant(user, item["question"], language)
                except AIUnavailable as exc:
                    raise CommandError(f"The assistant is unavailable: {exc}") from exc
                problems, _ = validate_answer(user, result["answer"])
                issues = [f"{p.kind} {p.ref}: {p.detail}" for p in problems]
                if result.get("validation") != "passed":
                    issues.append(f"answer needed {result.get('validation')}")
                if item["count"] is not None:
                    numbers = [int(n) for n in re.findall(r"\d+", result["answer"])]
                    if item["count"] not in numbers:
                        issues.append(f"expected the count {item['count']}, answer has {numbers[:5]}")
                if issues:
                    mismatches += 1
                    self.stdout.write(self.style.ERROR(f"  MISMATCH  {item['question']}"))
                    for issue in issues:
                        self.stdout.write(f"     - {issue}")
                    self.stdout.write(f"     answer: {result['answer'][:300]!r}")
                else:
                    self.stdout.write(f"  ok        {item['question']}")
        if options["dry_run"]:
            return
        self.stdout.write(f"{mismatches} mismatch(es)")
        if mismatches:
            raise SystemExit(1)
