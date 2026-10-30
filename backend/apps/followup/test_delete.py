"""Internal Audit can delete a saved follow-up report; nobody else can."""
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AuditTrail
from apps.core.testing import make_world
from apps.followup.models import FollowUpReport
from apps.followup.services import generate_followup_report


class FollowUpDeleteTests(TestCase):
    def setUp(self):
        cache.clear()
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        today = timezone.localdate()
        self.fu = generate_followup_report(self.muni, self.users["audit"], today, today)

    def delete(self, who):
        api = APIClient()
        api.force_authenticate(self.users[who])
        return api.delete(f"/api/followup-reports/{self.fu.id}/")

    def test_audit_deletes_and_it_is_logged(self):
        self.assertEqual(self.delete("audit").status_code, 204)
        self.assertFalse(FollowUpReport.objects.filter(pk=self.fu.pk).exists())
        self.assertTrue(AuditTrail.objects.filter(action="followup_report_deleted").exists())

    def test_others_cannot_delete(self):
        for who in ("council", "head", "emp"):
            self.assertIn(self.delete(who).status_code, (403, 404), who)
        self.assertTrue(FollowUpReport.objects.filter(pk=self.fu.pk).exists())
