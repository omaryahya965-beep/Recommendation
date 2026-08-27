import logging

from django.conf import settings

from .base import EmbeddingProvider, LLMProvider
from .embeddings import SimilarityAppEmbeddingProvider
from .llm import LocalLLMProvider, OpenAILLMProvider

logger = logging.getLogger("apps.ai")


def validate_config() -> str:
    name = (settings.AI_PROVIDER or "local").lower()
    if name == "openai":
        if not settings.AI_API_KEY:
            return "AI_API_KEY is missing for OpenAI provider."
        model_setting = (settings.AI_MODEL or "").strip()
        if model_setting == "heuristic-v1":
            return "heuristic-v1 is not a valid model for OpenAI provider."
    elif name != "local":
        return f"Unknown provider: {name}."
    return "ok"


def get_llm_provider() -> LLMProvider:
    name = (settings.AI_PROVIDER or "local").lower()
    if name == "openai":
        try:
            return OpenAILLMProvider()
        except Exception as e:
            logger.warning("ai_provider_openai_init_failed: %s. falling back to local.", str(e))
            return LocalLLMProvider()
    return LocalLLMProvider()


def get_embedding_provider() -> EmbeddingProvider:
    return SimilarityAppEmbeddingProvider()


def provider_meta():
    llm = get_llm_provider()
    emb = get_embedding_provider()
    config_status = validate_config()
    return {
        "provider": llm.name,
        "model": getattr(llm, "model", settings.AI_MODEL),
        "embedding_provider": emb.name,
        "embedding_model": emb.model,
        "local_or_remote_mode": "remote" if llm.name == "openai" and config_status == "ok" else "local",
        "configuration_status": config_status,
    }
