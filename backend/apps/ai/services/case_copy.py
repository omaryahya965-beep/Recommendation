"""Human-readable case labels used by advisory AI services."""
from __future__ import annotations

from apps.audits.models import Recommendation

S = Recommendation.Status

STATUS_AR = {
    S.DRAFT: "مسودة",
    S.PENDING_RESPONSE: "بانتظار رد الإدارة",
    S.AUDIT_REVIEW: "الرد قيد مراجعة التدقيق",
    S.RETURNED_FOR_REVISION: "معاد للإدارة للتعديل",
    S.PENDING_COUNCIL: "بانتظار مصادقة المجلس",
    S.APPROVED_FOR_IMPLEMENTATION: "معتمدة للتنفيذ",
    S.ACTION_PLAN_REQUIRED: "مطلوب خطة عمل",
    S.ACTION_PLAN_REVIEW: "خطة العمل قيد المراجعة",
    S.REVISION_REQUIRED: "مطلوب تعديل الخطة",
    S.ACTION_PLAN_APPROVED: "خطة العمل معتمدة",
    S.IN_PROGRESS: "قيد التنفيذ",
    S.PENDING_HEAD_REVIEW: "بانتظار مراجعة الإدارة للتنفيذ",
    S.SUBMITTED_FOR_VERIFICATION: "بانتظار تحقق الرقابة",
    S.RETURNED_INSUFFICIENT: "أدلة غير كافية",
    S.PARTIAL: "منفذة جزئياً",
    S.REOPENED: "معاد فتحها — إجراء إضافي",
    S.CLOSURE_REVIEW: "مراجعة إغلاق التوصية",
    S.PENDING_CLOSURE_COUNCIL: "بانتظار مراجعة المجلس للإغلاق",
    S.CLOSED: "مغلقة",
}

STATUS_EN = {
    S.DRAFT: "Draft",
    S.PENDING_RESPONSE: "Awaiting management response",
    S.AUDIT_REVIEW: "Response under audit review",
    S.RETURNED_FOR_REVISION: "Returned to the department for revision",
    S.PENDING_COUNCIL: "Awaiting council ratification",
    S.APPROVED_FOR_IMPLEMENTATION: "Approved for implementation",
    S.ACTION_PLAN_REQUIRED: "Action plan required",
    S.ACTION_PLAN_REVIEW: "Action plan under review",
    S.REVISION_REQUIRED: "Action plan revision required",
    S.ACTION_PLAN_APPROVED: "Action plan approved",
    S.IN_PROGRESS: "In progress",
    S.PENDING_HEAD_REVIEW: "Awaiting department review of implementation",
    S.SUBMITTED_FOR_VERIFICATION: "Awaiting audit verification",
    S.RETURNED_INSUFFICIENT: "Insufficient evidence",
    S.PARTIAL: "Partially implemented",
    S.REOPENED: "Reopened — additional action",
    S.CLOSURE_REVIEW: "Closure review",
    S.PENDING_CLOSURE_COUNCIL: "Awaiting council closure decision",
    S.CLOSED: "Closed",
}

RISK_AR = {"high": "مرتفع", "medium": "متوسط", "low": "منخفض"}
RISK_EN = {"high": "high", "medium": "medium", "low": "low"}

NEXT_AR = {
    S.DRAFT: "أكمل صياغة الملاحظة الرقابية ثم أصدر التقرير إلى الدائرة.",
    S.PENDING_RESPONSE: "يلزم رد رسمي من رئيس الدائرة على الملاحظة.",
    S.AUDIT_REVIEW: "راجع رد الإدارة وقرر قبوله أو إعادته للتعديل.",
    S.RETURNED_FOR_REVISION: "الدائرة تعدّل ردها وفق ملاحظات التدقيق ثم تعيد الإرسال.",
    S.PENDING_COUNCIL: "بانتظار مصادقة المجلس على التقرير قبل بدء التنفيذ.",
    S.APPROVED_FOR_IMPLEMENTATION: "يُطلب من الدائرة إعداد خطة عمل قابلة للقياس.",
    S.ACTION_PLAN_REQUIRED: "أعدّ خطة عمل بخطوات ومسؤول وموعد مستهدف ثم ارفعها للتدقيق.",
    S.ACTION_PLAN_REVIEW: "راجع خطة العمل واعتمدها أو أعدها للتعديل.",
    S.REVISION_REQUIRED: "عدّل خطة العمل وفق ملاحظات التدقيق وأعد تقديمها.",
    S.ACTION_PLAN_APPROVED: "ابدأ تنفيذ الخطوات المعتمدة وارفع الأدلة أولاً بأول.",
    S.IN_PROGRESS: "نفّذ الخطوات المتبقية وارفع أدلة كافية قبل انتهاء الموعد المستهدف.",
    S.PENDING_HEAD_REVIEW: "رئيس الدائرة يراجع اكتمال التنفيذ قبل الرفع للرقابة.",
    S.SUBMITTED_FOR_VERIFICATION: "التدقيق يتحقق من كفاية الأدلة مقابل نص التوصية.",
    S.RETURNED_INSUFFICIENT: "استكمل الأدلة أو خطوات التنفيذ الناقصة ثم أعد الرفع.",
    S.PARTIAL: "أكمل الجزء غير المنفَّذ وارفع ما يثبت المعالجة المتبقية.",
    S.REOPENED: "نفّذ الإجراء الإضافي الذي طلبه المجلس ثم أعد مسار التحقق.",
    S.CLOSURE_REVIEW: "التدقيق يجهّز ملف الإغلاق قبل عرضه على المجلس.",
    S.PENDING_CLOSURE_COUNCIL: "المجلس يبتّ في إغلاق التوصية.",
    S.CLOSED: "الملف مغلق. لا إجراء متابعة مطلوب.",
}

NEXT_EN = {
    S.DRAFT: "Finish drafting the finding, then issue the report to the department.",
    S.PENDING_RESPONSE: "The department head must submit a formal management response.",
    S.AUDIT_REVIEW: "Audit should accept the response or return it for revision.",
    S.RETURNED_FOR_REVISION: "The department revises its response and resubmits it.",
    S.PENDING_COUNCIL: "Council ratification is required before implementation starts.",
    S.APPROVED_FOR_IMPLEMENTATION: "The department should prepare a measurable action plan.",
    S.ACTION_PLAN_REQUIRED: "Prepare an action plan with steps, an owner, and a target date.",
    S.ACTION_PLAN_REVIEW: "Audit should approve the action plan or return it for revision.",
    S.REVISION_REQUIRED: "Revise the action plan against audit comments and resubmit.",
    S.ACTION_PLAN_APPROVED: "Start the approved steps and upload evidence as work proceeds.",
    S.IN_PROGRESS: "Complete remaining steps and upload sufficient evidence before the target date.",
    S.PENDING_HEAD_REVIEW: "The department head reviews implementation completeness.",
    S.SUBMITTED_FOR_VERIFICATION: "Audit verifies the evidence against the recommendation.",
    S.RETURNED_INSUFFICIENT: "Close the evidence or implementation gaps, then resubmit.",
    S.PARTIAL: "Complete the outstanding portion and evidence the remaining treatment.",
    S.REOPENED: "Carry out the additional action requested by council, then re-verify.",
    S.CLOSURE_REVIEW: "Audit prepares the closure file for council.",
    S.PENDING_CLOSURE_COUNCIL: "Council decides whether the recommendation may close.",
    S.CLOSED: "The file is closed. No further follow-up action is required.",
}

# Stages where an action-plan deadline is not expected yet.
PRE_DEADLINE = {
    S.DRAFT,
    S.PENDING_RESPONSE,
    S.AUDIT_REVIEW,
    S.RETURNED_FOR_REVISION,
    S.PENDING_COUNCIL,
    S.APPROVED_FOR_IMPLEMENTATION,
    S.ACTION_PLAN_REQUIRED,
    S.ACTION_PLAN_REVIEW,
    S.REVISION_REQUIRED,
}


def is_ar(language: str) -> bool:
    return (language or "ar") != "en"


def status_label(status: str, language: str = "ar") -> str:
    table = STATUS_AR if is_ar(language) else STATUS_EN
    return table.get(status, status)


def risk_label(level: str, language: str = "ar") -> str:
    table = RISK_AR if is_ar(language) else RISK_EN
    return table.get(level, level)


def next_action(status: str, language: str = "ar") -> str:
    table = NEXT_AR if is_ar(language) else NEXT_EN
    return table.get(status, "")


def deadline_expected(status: str) -> bool:
    return status not in PRE_DEADLINE and status != S.DRAFT
