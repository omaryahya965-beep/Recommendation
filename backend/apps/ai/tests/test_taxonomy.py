"""Control-area classification, with the Arabic cases that used to be wrong."""
from django.test import SimpleTestCase

from apps.ai import taxonomy


class ArabicClassificationTests(SimpleTestCase):
    def test_regulations_wording_is_compliance_not_it(self):
        """'الأنظمة والتعليمات' means regulations, not computer systems.

        The previous rule matched the substring 'أنظم' and filed ordinary
        compliance findings under IT.
        """
        text = (
            "لم تلتزم الدائرة بتطبيق الأنظمة والتعليمات المعتمدة الصادرة عن "
            "المجلس البلدي."
        )
        self.assertEqual(taxonomy.classify(text), "COMPLIANCE")

    def test_regulations_wording_never_falls_back_to_it(self):
        """Even mixed with other signals, 'الأنظمة' must not imply IT.

        A finding can legitimately be read as compliance or finance; what it
        must never be is information systems.
        """
        text = (
            "لم تلتزم الدائرة بتطبيق الأنظمة والتعليمات المعتمدة بشأن صرف النفقات."
        )
        self.assertNotEqual(taxonomy.classify(text), "IT")
        self.assertIn(taxonomy.classify(text), ("COMPLIANCE", "FINANCE"))

    def test_real_it_finding_is_still_it(self):
        text = (
            "لا يتم أخذ النسخ الاحتياطي لقاعدة البيانات بشكل دوري، كما أن "
            "كلمات المرور الخاصة بالنظام المحوسب غير محدثة."
        )
        self.assertEqual(taxonomy.classify(text), "IT")

    def test_english_pronoun_it_does_not_classify_as_it(self):
        """`it\\b` matched the English pronoun in any sentence."""
        text = (
            "The committee reviewed the tender file and found that it was "
            "not approved before the purchase order was issued."
        )
        self.assertNotEqual(taxonomy.classify(text), "IT")

    def test_procurement_finding(self):
        text = "تم ترسية العطاء دون الإعلان عنه ودون كراسة شروط معتمدة."
        self.assertEqual(taxonomy.classify(text), "PROCUREMENT")

    def test_cash_handling_is_finance(self):
        text = "لا تتم التسوية البنكية شهرياً ولا يوجد فصل بين أمين الصندوق والمحاسب."
        self.assertEqual(taxonomy.classify(text), "FINANCE")

    def test_collection_finding_is_revenue(self):
        text = "لم تتم متابعة الذمم والمتأخرات المستحقة على المكلفين في دائرة الجباية."
        self.assertEqual(taxonomy.classify(text), "REVENUE")

    def test_hr_finding(self):
        text = "لا يوجد وصف وظيفي معتمد للموظفين ولم يتم إجراء التقييم السنوي."
        self.assertEqual(taxonomy.classify(text), "HR")

    def test_inventory_finding_is_asset_management(self):
        text = "لم يتم إجراء الجرد السنوي للمستودع ولا يوجد سجل أصول محدث."
        self.assertEqual(taxonomy.classify(text), "ASSET_MANAGEMENT")

    def test_unclassifiable_text_is_other_not_a_guess(self):
        self.assertEqual(taxonomy.classify("ملاحظة عامة."), "OTHER")
        self.assertEqual(taxonomy.classify(""), "OTHER")

    def test_department_name_alone_never_decides(self):
        """A weak department hint must not outvote silence in the finding."""
        self.assertEqual(taxonomy.classify("ملاحظة عامة.", "الدائرة المالية"), "OTHER")

    def test_department_corroborates_a_real_finding(self):
        text = "لا يوجد فصل في المهام عند صرف الدفعات."
        self.assertEqual(taxonomy.classify(text, "الدائرة المالية"), "FINANCE")


class NamedMatchingTests(SimpleTestCase):
    def test_matches_uses_named_categories(self):
        self.assertTrue(taxonomy.matches("FINANCE", "التسوية البنكية غير مكتملة"))
        self.assertFalse(taxonomy.matches("IT", "الأنظمة والتعليمات"))
        self.assertFalse(taxonomy.matches("NOT_A_CATEGORY", "anything"))

    def test_every_category_has_both_labels(self):
        for key in taxonomy.CATEGORY_KEYS:
            self.assertTrue(taxonomy.category_label(key, "ar"))
            self.assertTrue(taxonomy.category_label(key, "en"))
            self.assertNotEqual(
                taxonomy.category_label(key, "ar"),
                taxonomy.category_label(key, "en"),
            )
