"""Control-area classification for audit findings.

This replaces a first-match-wins list of loose regexes that produced wrong
categories on ordinary Arabic audit language. Two failures in particular:

* ``أنظم`` was treated as evidence of IT. In municipal audit Arabic,
  "الأنظمة والتعليمات" means *regulations*, so compliance findings were being
  filed as IT. IT now requires an actually computing-specific term
  (حاسوب/برمجيات/شبكة/قاعدة بيانات/إلكتروني/سيبراني…).
* ``it\b`` and ``hr\b`` were matched case-insensitively, so the English
  pronoun "it" in any sentence scored as IT. Acronyms are now matched
  case-sensitively as whole words.

Classification is scored rather than first-match: every category accumulates
weight from the terms it matches, the strongest wins, and a category is only
assigned when it clears a minimum score. Otherwise the finding is OTHER,
which is an honest answer and better than a confident wrong label.

The finding text carries far more signal than the department name, so the
department contributes at a reduced weight and can only break a tie.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Strong terms are specific to one control area; weak terms only corroborate.
STRONG = 3
WEAK = 1

# A category needs at least one strong term, or several weak ones.
MIN_SCORE = STRONG


@dataclass(frozen=True)
class Category:
    key: str
    label_ar: str
    label_en: str
    strong: re.Pattern
    weak: re.Pattern | None = None
    # Applied to matches coming from the department name rather than the text.
    department: re.Pattern | None = None


def _p(pattern: str, *, case_sensitive: bool = False) -> re.Pattern:
    return re.compile(pattern, 0 if case_sensitive else re.I)


CATEGORIES: tuple[Category, ...] = (
    Category(
        key="PROCUREMENT",
        label_ar="المشتريات والعطاءات",
        label_en="Procurement and tendering",
        strong=_p(r"عطاء|عطاءات|مناقص|مشتريات|التوريد|أمر شراء|كراسة الشروط"
                  r"|procurement|tender|bidding|purchase order"),
        weak=_p(r"شراء|مورد|عرض سعر|supplier|vendor|quotation"),
        department=_p(r"مشتريات|لوازم|عطاءات|procurement|supply"),
    ),
    Category(
        key="FINANCE",
        label_ar="الشؤون المالية",
        label_en="Finance",
        strong=_p(r"الصندوق|أمين الصندوق|سند قبض|سند صرف|أمر الصرف|كشف بنكي"
                  r"|التسوية البنكية|القيود المحاسبية|الموازنة|النفقات|المصروفات"
                  r"|العهد المالية|صرف الدفعات|الدفعات المالية|اعتماد الصرف"
                  r"|petty cash|bank reconciliation|journal entr|budget|expenditure"
                  r"|disbursement"),
        weak=_p(r"مالي|محاسب|صرف|دفع|finance|financial|accounting|payment"),
        department=_p(r"مالي|محاسب|خزين|finance|treasur"),
    ),
    Category(
        key="REVENUE",
        label_ar="الإيرادات والجباية",
        label_en="Revenue and collection",
        strong=_p(r"الجباية|التحصيل|الرسوم|الذمم|المتأخرات|الإيرادات|فاتورة المياه"
                  r"|ضريبة المسقفات|revenue|collection|arrears|receivable|levy|tariff"),
        weak=_p(r"رسم|اشتراك|فاتورة|tax|fee|invoice|billing"),
        department=_p(r"جباي|إيرادات|تحصيل|revenue|collection|billing"),
    ),
    Category(
        key="HR",
        label_ar="الموارد البشرية",
        label_en="Human resources",
        strong=_p(r"الموارد البشرية|شؤون الموظفين|التعيين|الدوام|الرواتب|الإجازات"
                  r"|الوصف الوظيفي|التقييم السنوي|المناوبات"
                  r"|human resources|payroll|recruitment|attendance|job description"),
        weak=_p(r"موظف|كادر|توظيف|staff|employee|personnel"),
        department=_p(r"موارد بشر|شؤون الموظفين|human resources|personnel"),
    ),
    Category(
        key="IT",
        label_ar="أنظمة المعلومات",
        label_en="Information systems",
        # Deliberately requires a computing-specific term: bare "أنظمة"
        # in Arabic audit reports usually means regulations, not software.
        strong=_p(r"الحاسوب|الحواسيب|البرمجيات|برنامج محوسب|النظام المحوسب"
                  r"|قاعدة البيانات|الشبكة الحاسوبية|النسخ الاحتياطي|كلمات المرور"
                  r"|صلاحيات الدخول|أمن المعلومات|الأمن السيبراني|إلكتروني"
                  r"|software|database|backup|password|cybersecurity|server"
                  r"|network|user access|information security"),
        weak=_p(r"محوسب|رقمي|تقني|digital|computeri[sz]ed"),
        department=_p(r"حاسوب|معلومات|تكنولوجيا|information technology"),
    ),
    Category(
        key="COMPLIANCE",
        label_ar="الالتزام والامتثال",
        label_en="Compliance",
        # This is where "الأنظمة والتعليمات" legitimately belongs.
        strong=_p(r"الأنظمة والتعليمات|القانون|اللائحة|اللوائح|التشريع|قرار مجلس"
                  r"|مخالفة قانونية|الامتثال|النظام الداخلي"
                  r"|compliance|regulation|statut|by-?law|legal requirement"),
        weak=_p(r"تعليمات|أصول|نظام معتمد|policy|procedure manual"),
        department=_p(r"قانون|شؤون قانونية|امتثال|legal|compliance"),
    ),
    Category(
        key="ASSET_MANAGEMENT",
        label_ar="إدارة الأصول والمستودعات",
        label_en="Asset and inventory management",
        strong=_p(r"المستودع|المخزون|الجرد|الأصول الثابتة|سجل الأصول|المركبات"
                  r"|الآليات|قطع الغيار"
                  r"|inventory|stocktak|fixed asset|asset register|fleet|spare part"),
        weak=_p(r"أصل|معدات|مخزن|asset|equipment|warehouse"),
        department=_p(r"مستودع|أصول|آليات|asset|warehouse|fleet"),
    ),
    Category(
        key="OPERATIONS",
        label_ar="العمليات والخدمات",
        label_en="Operations and services",
        strong=_p(r"الصيانة|تقديم الخدمة|جودة الخدمة|النفايات|المياه|الصرف الصحي"
                  r"|الطرق|التراخيص|maintenance|service delivery|waste|sanitation"
                  r"|road works|licensing"),
        weak=_p(r"تشغيل|خدمة|operation|service"),
        department=_p(r"هندس|خدمات|صحة|بيئة|engineering|services|operations"),
    ),
)

CATEGORY_KEYS = tuple(category.key for category in CATEGORIES) + ("OTHER",)

_BY_KEY = {category.key: category for category in CATEGORIES}

LABELS = {
    **{c.key: {"ar": c.label_ar, "en": c.label_en} for c in CATEGORIES},
    "OTHER": {"ar": "غير مصنّف", "en": "Unclassified"},
}


def category_label(key: str, language: str = "ar") -> str:
    entry = LABELS.get(key or "OTHER", LABELS["OTHER"])
    return entry["en" if (language or "").startswith("en") else "ar"]


def score_categories(text: str, department_name: str = "") -> dict[str, int]:
    """Weighted score per control area. Higher means stronger evidence."""
    blob = text or ""
    dept = department_name or ""
    scores: dict[str, int] = {}
    for category in CATEGORIES:
        score = 0
        if category.strong.search(blob):
            score += STRONG
        if category.weak is not None and category.weak.search(blob):
            score += WEAK
        # The department is a hint, never enough on its own to classify.
        if category.department is not None and category.department.search(dept):
            score += WEAK
        if score:
            scores[category.key] = score
    return scores


def classify(text: str, department_name: str = "") -> str:
    """Best-scoring control area, or OTHER when nothing is convincing."""
    scores = score_categories(text, department_name)
    if not scores:
        return "OTHER"
    best = max(scores.values())
    if best < MIN_SCORE:
        return "OTHER"
    # Ties resolve by declaration order, which is stable across runs.
    for category in CATEGORIES:
        if scores.get(category.key) == best:
            return category.key
    return "OTHER"


def matches(key: str, text: str) -> bool:
    """Does this text show evidence of one named control area?

    Used by the risk model for its financial / compliance / operational
    dimensions. Named lookup replaces the previous positional indexing into
    the rules list, where reordering the list silently changed the maths.
    """
    category = _BY_KEY.get(key)
    if category is None:
        return False
    if category.strong.search(text or ""):
        return True
    return bool(category.weak is not None and category.weak.search(text or ""))
