import datetime

from django.test import SimpleTestCase

from apps.core.arabic import date_ar, recommendations


class ArabicWordingTests(SimpleTestCase):
    def test_counts_agree_with_the_number(self):
        self.assertEqual(recommendations(1), "توصية واحدة")
        self.assertEqual(recommendations(2), "توصيتان")
        self.assertEqual(recommendations(3), "3 توصيات")
        self.assertEqual(recommendations(10), "10 توصيات")
        self.assertEqual(recommendations(11), "11 توصيةً")
        self.assertEqual(recommendations(100), "100 توصية")
        self.assertEqual(recommendations(0), "0 توصية")

    def test_dates_read_as_the_ui_writes_them(self):
        self.assertEqual(date_ar("2026-10-06"), "6 أكتوبر 2026")
        self.assertEqual(date_ar(datetime.date(2026, 1, 31)), "31 يناير 2026")
        self.assertEqual(date_ar("not a date"), "not a date")

    def test_day_counts(self):
        from apps.core.arabic import days

        self.assertEqual([days(1), days(2), days(7), days(15)], ["يوم واحد", "يومان", "7 أيام", "15 يوماً"])


class ReminderWordingTests(SimpleTestCase):
    def test_reminder_text_counts_days_and_writes_the_date(self):
        from types import SimpleNamespace

        from apps.notifications.services import _message

        rec = SimpleNamespace(id=7, text="العنوان:\nتسوية الحسابات\n")
        self.assertIn("يتبقى 7 أيام", _message(rec, -7, "plan", datetime.date(2026, 10, 13)))
        self.assertIn("(13 أكتوبر 2026)", _message(rec, -7, "plan", datetime.date(2026, 10, 13)))
        self.assertIn("مضى يومان", _message(rec, 2, "verification", datetime.date(2026, 10, 4)))
