"""Semantic duplicate-recommendation detection.

Pluggable embedding backends behind one interface:

- "sbert": sentence-transformers multilingual model (best quality; optional
  heavy dependency). Used automatically when installed and SIMILARITY_BACKEND
  is "auto" or "sbert".
- "hashing_ngram": deterministic character n-gram hashing embedding in pure
  Python. No dependencies, works offline, handles Arabic text. Default
  fallback so the feature always functions in development.

Embeddings are stored on the Recommendation row (portable JSON list) with the
producing model's id, and cosine similarity is computed in Python — accurate
and fast at the system's expected scale. Swapping to pgvector on Neon only
requires changing the storage/query layer here, nothing else.

The result is NEVER a final decision: recommendations are only flagged as
"possibly recurring" for internal audit to confirm or dismiss.
"""
import hashlib
import math
import re

from django.conf import settings

HASHING_DIM = 512
HASHING_MODEL_ID = "hashing_ngram_v2"
SBERT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

_sbert_model = None

# Arabic-aware normalization: strip diacritics, unify alef/teh-marbuta/yeh.
_DIACRITICS = re.compile(r"[\u064B-\u065F\u0670]")
_NON_WORD = re.compile(r"[^\w\s\u0600-\u06FF]", re.UNICODE)


def _normalize(text):
    text = text.strip().lower()
    text = _DIACRITICS.sub("", text)
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    text = text.replace("ة", "ه").replace("ى", "ي")
    text = _NON_WORD.sub(" ", text)
    return re.sub(r"\s+", " ", text)


def _get_sbert():
    global _sbert_model
    if _sbert_model is None:
        from sentence_transformers import SentenceTransformer
        _sbert_model = SentenceTransformer(SBERT_MODEL_NAME)
    return _sbert_model


def _sbert_available():
    try:
        import sentence_transformers  # noqa: F401
        return True
    except ImportError:
        return False


def active_backend():
    configured = settings.SIMILARITY_BACKEND
    if configured == "sbert":
        return "sbert"
    if configured == "auto" and _sbert_available():
        return "sbert"
    return "hashing_ngram"


def _embed_hashing(text, dim=HASHING_DIM):
    """Character n-gram (2-4) hashing embedding, l2-normalized."""
    normalized = _normalize(text)
    vector = [0.0] * dim
    padded = f" {normalized} "
    for n in (2, 3, 4):
        for i in range(len(padded) - n + 1):
            gram = padded[i : i + n]
            digest = hashlib.md5(gram.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "little") % dim
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0:
        return vector
    return [v / norm for v in vector]


def embed(text):
    """Returns (vector, model_id)."""
    if active_backend() == "sbert":
        model = _get_sbert()
        vec = model.encode(_normalize(text), normalize_embeddings=True)
        return [float(v) for v in vec], SBERT_MODEL_NAME
    return _embed_hashing(text), HASHING_MODEL_ID


def cosine(a, b):
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))  # vectors are l2-normalized


def _embed_source(recommendation):
    from apps.audits.finding import semantic_payload

    return semantic_payload(recommendation.text, recommendation.root_cause)


def ensure_embedding(recommendation):
    _, model_id = None, active_backend()
    expected = SBERT_MODEL_NAME if model_id == "sbert" else HASHING_MODEL_ID
    if recommendation.embedding and recommendation.embedding_model == expected:
        return recommendation.embedding
    vector, model_used = embed(_embed_source(recommendation))
    recommendation.embedding = vector
    recommendation.embedding_model = model_used
    recommendation.save(update_fields=["embedding", "embedding_model", "updated_at"])
    return vector


def find_similar(recommendation, top_k=3, min_score=0.0, user=None):
    """Top-k most similar prior recommendations in the same municipality.

    Candidate selection used to hydrate the first 300 rows of the default
    ordering, which is `-priority_score`. That is unrelated to similarity, so
    a genuine repeat finding with a low priority score could sit at position
    301 and never be compared at all.

    Instead the scan reads only `(id, embedding, embedding_model)` as raw
    tuples. Skipping model instantiation and the related-object joins makes
    each candidate cheap enough to compare the whole municipality, and only
    the handful of winners are loaded as full objects.

    Rows whose embedding is missing or was produced by a different model are
    repaired lazily, but at most `MAX_BACKFILL_PER_CALL` per request so a cold
    dataset degrades gradually instead of turning one read into thousands of
    writes. `backfill_embeddings` fixes the rest offline.
    """
    from apps.ai.similarity_config import MAX_BACKFILL_PER_CALL
    from apps.audits.finding import semantic_payload
    from apps.audits.models import Recommendation
    from apps.core.permissions import scope_recommendations

    vector = ensure_embedding(recommendation)
    expected_model = recommendation.embedding_model

    candidates = Recommendation.objects.filter(
        report__municipality=recommendation.report.municipality
    ).exclude(pk=recommendation.pk)
    if user is not None:
        candidates = scope_recommendations(candidates, user)

    scored: list[tuple[int, float]] = []
    stale: list[int] = []
    for rec_id, embedding, model_id in candidates.values_list(
        "id", "embedding", "embedding_model"
    ).iterator(chunk_size=1000):
        if not embedding or model_id != expected_model:
            stale.append(rec_id)
            continue
        score = cosine(vector, embedding)
        if score >= min_score:
            scored.append((rec_id, score))

    for rec in Recommendation.objects.filter(
        pk__in=stale[:MAX_BACKFILL_PER_CALL]
    ):
        embedding = ensure_embedding(rec)
        if embedding and rec.embedding_model == expected_model:
            score = cosine(vector, embedding)
            if score >= min_score:
                scored.append((rec.id, score))

    scored.sort(key=lambda pair: pair[1], reverse=True)

    # Load only the shortlist as real objects. Over-fetch a little because
    # near-identical texts are collapsed immediately below.
    shortlist = [rec_id for rec_id, _ in scored[: max(top_k * 4, 12)]]
    if not shortlist:
        return []
    by_id = {
        rec.id: rec
        for rec in Recommendation.objects.filter(pk__in=shortlist).select_related(
            "report__department", "action_plan"
        )
    }

    unique = []
    seen = set()
    for rec_id, score in scored:
        rec = by_id.get(rec_id)
        if rec is None:
            continue
        key = _normalize(semantic_payload(rec.text, rec.root_cause))[:480]
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append((rec, score))
        if len(unique) >= top_k:
            break
    return unique


def flag_if_recurring(recommendation, user=None):
    """Called on creation. Flags a possible recurrence for HUMAN confirmation;
    never makes the final call itself.

    Uses the shared AUTO_FLAG_MIN_SCORE so the flag written here cannot
    disagree with the label the similarity panel shows for the same match.
    """
    from apps.ai.similarity_config import AUTO_FLAG_MIN_SCORE, CANDIDATE_MIN_SCORE

    matches = find_similar(recommendation, top_k=1, min_score=CANDIDATE_MIN_SCORE)
    if not matches:
        return None
    best, score = matches[0]
    if score >= AUTO_FLAG_MIN_SCORE:
        recommendation.is_recurring = True
        recommendation.similar_recommendation = best
        recommendation.similarity_score = round(score, 4)
        recommendation.save(
            update_fields=[
                "is_recurring", "similar_recommendation", "similarity_score", "updated_at",
            ]
        )
        if user is not None:
            from apps.core.models import log_action
            log_action(
                user, "flagged_possibly_recurring",
                recommendation=recommendation, report=recommendation.report,
                similar_to=best.id, score=recommendation.similarity_score,
            )
        return best, score
    return None
