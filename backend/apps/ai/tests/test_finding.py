from django.test import TestCase

from apps.audits.finding import (
    brief_excerpt,
    case_title,
    is_repeated_placeholder,
    parse_finding,
    semantic_payload,
)


class FindingParserTests(TestCase):
    def test_parses_wizard_sections(self):
        text = (
            "العنوان:\nفصل المهام\n\n"
            "الوضع القائم:\nأمين الصندوق يحصّل ويسجّل.\n\n"
            "التوصية:\nيجب فصل التحصيل عن التسجيل."
        )
        parsed = parse_finding(text)
        self.assertTrue(parsed["structured"])
        self.assertEqual(parsed["sections"]["title"], "فصل المهام")
        self.assertIn("أمين الصندوق", parsed["sections"]["condition"])
        self.assertEqual(case_title(text), "فصل المهام")
        self.assertEqual(brief_excerpt(text), "فصل المهام")
        self.assertNotIn("العنوان", semantic_payload(text))
        self.assertIn("أمين الصندوق", semantic_payload(text))

    def test_repeated_placeholder(self):
        text = (
            "العنوان:\nOmarYahya\n\nالوضع القائم:\nOmarYahya\n\n"
            "المعيار:\nOmarYahya\n\nالتوصية:\nOmarYahya"
        )
        self.assertTrue(is_repeated_placeholder(text))
        self.assertFalse(is_repeated_placeholder("العنوان:\nA\n\nالوضع القائم:\nSomething real happened here."))
