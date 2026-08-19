"""Embedding providers.

Default implementation delegates to `apps.ai_similarity` so we do not duplicate
the hashing n-gram / sentence-transformers backends or JSONField storage.

A future pgvector backend can replace `find_similar` query mechanics without
changing this interface.
"""
from .base import EmbeddingProvider


class SimilarityAppEmbeddingProvider(EmbeddingProvider):
    name = "ai_similarity"

    def __init__(self):
        from apps.ai_similarity.service import HASHING_MODEL_ID, SBERT_MODEL_NAME, active_backend

        backend = active_backend()
        self.model = SBERT_MODEL_NAME if backend == "sbert" else HASHING_MODEL_ID

    def embed(self, texts):
        from apps.ai_similarity.service import embed

        vectors = []
        for text in texts:
            vector, model_id = embed(text or "")
            self.model = model_id
            vectors.append(vector)
        return vectors
