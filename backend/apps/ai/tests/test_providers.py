import json
from unittest.mock import patch

from django.test import override_settings
from rest_framework.test import APIClient

from apps.ai.exceptions import AIUnavailable, AIValidationError
from apps.ai.models import AIAnalysis
from apps.ai.providers import get_chat_llm
from apps.ai.providers.llm import LocalLLMProvider
from apps.ai.services.common import generate_structured, parse_json_object
from apps.workflow.tests import make_world
from django.test import TestCase


class ProviderTests(TestCase):
    def test_local_provider_returns_fallback_json(self):
        raw = LocalLLMProvider().generate("x", fallback={"quality_score": 71})
        self.assertEqual(json.loads(raw)["quality_score"], 71)

    def test_parse_json_object_fenced_and_invalid(self):
        self.assertEqual(parse_json_object('```json\n{"a": 1}\n```')["a"], 1)
        with self.assertRaises(AIValidationError):
            parse_json_object("not json at all")

    def test_generate_structured_retries_then_fallback(self):
        class Flaky:
            name = "openai"
            model = "fake"
            n = 0

            def generate(self, *args, **kwargs):
                self.n += 1
                if self.n < 3:
                    return "NOT JSON"
                return json.dumps({"ok": True})

        flaky = Flaky()
        with patch("apps.ai.services.common.get_llm_provider", return_value=flaky):
            result = generate_structured("prompt", fallback={"ok": False})
        self.assertEqual(result, {"ok": False})
        self.assertGreaterEqual(flaky.n, 2)

    def test_generate_structured_accepts_second_attempt(self):
        class Flaky:
            name = "openai"
            model = "fake"
            n = 0

            def generate(self, *args, **kwargs):
                self.n += 1
                if self.n == 1:
                    return "NOT JSON"
                return json.dumps({"ok": True})

        flaky = Flaky()
        with patch("apps.ai.services.common.get_llm_provider", return_value=flaky):
            result = generate_structured("prompt", fallback={"ok": False})
        self.assertEqual(result, {"ok": True})


class HealthAndDisabledTests(TestCase):
    def setUp(self):
        self.muni, self.dept, self.users, self.report, self.rec = make_world()
        self.client = APIClient()
        self.client.force_authenticate(self.users["audit"])

    def test_health_hides_api_key(self):
        res = self.client.get("/api/ai/health/")
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("api_key", json.dumps(res.data).lower())
        self.assertNotIn("AI_API_KEY", json.dumps(res.data))

    @override_settings(AI_ENABLED=False)
    def test_disabled_ai_does_not_block_core_create(self):
        res = self.client.post(
            "/api/recommendations/",
            {
                "report": self.report.id,
                "text": "Document petty cash counts daily with dual custody.",
                "risk_level": "high",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        blocked = self.client.post(f"/api/ai/recommendations/{self.rec.id}/analyze/")
        self.assertEqual(blocked.status_code, 503)


class ChatProviderTests(TestCase):
    @override_settings(AI_PROVIDER="local", AI_API_KEY="sk-test", AI_MODEL="gpt-4o-mini")
    def test_assistant_uses_openai_when_key_is_set(self):
        llm = get_chat_llm()
        self.assertEqual(llm.name, "openai")
        self.assertEqual(llm.model, "gpt-4o-mini")

    @override_settings(AI_PROVIDER="openai", AI_API_KEY="")
    def test_assistant_requires_api_key(self):
        with self.assertRaises(AIUnavailable):
            get_chat_llm()
