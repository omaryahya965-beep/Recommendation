class LLMProvider:
    """Interface for text generation. Implementations must never receive API keys
    from callers — they read configuration themselves."""

    name = "base"
    model = ""

    def generate(self, prompt, context=None, **kwargs):
        raise NotImplementedError


class EmbeddingProvider:
    """Interface for text embeddings. Storage remains on Recommendation.embedding
    (JSONField today; pgvector can replace the query layer later)."""

    name = "base"
    model = ""

    def embed(self, texts):
        """Return a list of vectors, one per input string."""
        raise NotImplementedError
