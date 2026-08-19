import logging

from django.conf import settings

from .base import EmbeddingProvider, LLMProvider
from .embeddings import SimilarityAppEmbeddingProvider
from .llm import LocalLLMProvider, OpenAILLMProvider

logger = logging.getLogger("apps.ai")


def get_llm_provider() -> LLMProvider:
    name = (settings.AI_PROVIDER or "local").lower()
    if name == "openai" and settings.AI_API_KEY:
        try:
            return OpenAILLMProvider()
        except Exception:
            logger.warning("ai_provider_openai_init_failed fallback=local")
            return LocalLLMProvider()
    if name == "openai" and not settings.AI_API_KEY:
        logger.warning("ai_provider_openai_missing_key fallback=local")
    return LocalLLMProvider()


def get_embedding_provider() -> EmbeddingProvider:
    return SimilarityAppEmbeddingProvider()


def provider_meta():
    llm = get_llm_provider()
    emb = get_embedding_provider()
    return {
        "provider": llm.name,
        "model": getattr(llm, "model", settings.AI_MODEL),
        "embedding_provider": emb.name,
        "embedding_model": emb.model,
    }
