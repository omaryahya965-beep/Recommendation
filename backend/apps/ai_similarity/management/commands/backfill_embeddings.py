"""Offline repair of recommendation embeddings.

`find_similar` repairs a bounded number of stale rows per request so a read
never becomes an unbounded write storm. This command does the rest, and is
what you run after changing SIMILARITY_BACKEND or installing
sentence-transformers, so recurrence detection compares like with like.

Idempotent: rows already carrying the active model's embedding are skipped.
"""
from django.core.management.base import BaseCommand

from apps.ai_similarity.service import (
    HASHING_MODEL_ID,
    SBERT_MODEL_NAME,
    active_backend,
    ensure_embedding,
)
from apps.audits.models import Recommendation


class Command(BaseCommand):
    help = "Compute missing or outdated recommendation embeddings."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Stop after this many rows (0 = no limit).",
        )

    def handle(self, *args, **options):
        expected = (
            SBERT_MODEL_NAME if active_backend() == "sbert" else HASHING_MODEL_ID
        )
        queryset = Recommendation.objects.exclude(
            embedding__isnull=False, embedding_model=expected
        ).order_by("pk")

        limit = options["limit"]
        if limit:
            queryset = queryset[:limit]

        done = failed = 0
        for recommendation in queryset.iterator(chunk_size=200):
            try:
                ensure_embedding(recommendation)
                done += 1
            except Exception as exc:  # one bad row must not stop the backfill
                failed += 1
                self.stderr.write(f"REC-{recommendation.pk}: {exc}")

        self.stdout.write(
            self.style.SUCCESS(
                f"Embedded {done} recommendation(s) with '{expected}'. Failed: {failed}."
            )
        )
