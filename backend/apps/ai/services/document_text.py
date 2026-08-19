"""Safe text extraction from evidence files. Never executes files."""
from __future__ import annotations

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from django.conf import settings

MAX_UNCOMPRESSED = 5_000_000

INSTRUCTION_LIKE = re.compile(
    r"(ignore (all )?(previous|prior) instructions|تجاهل.*(تعليمات|التعليمات)|approve this recommendation)",
    re.I,
)


def looks_like_instruction_injection(text: str) -> bool:
    return bool(INSTRUCTION_LIKE.search(text or ""))


def extract_evidence_text(evidence) -> dict:
    """Return {text, extraction_ok, document_type, error}."""
    field = evidence.file
    name = (getattr(field, "name", "") or "").lower()
    suffix = Path(name).suffix
    try:
        field.open("rb")
        data = field.read()
    except Exception:
        return {
            "text": "",
            "extraction_ok": False,
            "document_type": suffix or "unknown",
            "error": "Text could not be extracted from this document.",
        }
    finally:
        try:
            field.close()
        except Exception:
            pass

    limit = settings.AI_MAX_EXTRACT_CHARS
    if suffix == ".txt":
        text = data.decode("utf-8", errors="replace")
        return _ok(text, "txt", limit)
    if suffix == ".pdf":
        text = _pdf_text(data)
        if text.strip():
            return _ok(text, "pdf", limit)
        return {
            "text": "",
            "extraction_ok": False,
            "document_type": "pdf",
            "error": "Text could not be extracted from this document.",
        }
    if suffix == ".docx":
        text = _docx_text(data)
        if text.strip():
            return _ok(text, "docx", limit)
        return {
            "text": "",
            "extraction_ok": False,
            "document_type": "docx",
            "error": "Text could not be extracted from this document.",
        }
    return {
        "text": "",
        "extraction_ok": False,
        "document_type": suffix.lstrip(".") or "unsupported",
        "error": "Text could not be extracted from this document.",
    }


def _ok(text: str, doc_type: str, limit: int) -> dict:
    cleaned = text.replace("\x00", " ").strip()
    return {
        "text": cleaned[:limit],
        "extraction_ok": bool(cleaned),
        "document_type": doc_type,
        "error": "" if cleaned else "Text could not be extracted from this document.",
    }


def _pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    except Exception:
        # Uncompressed literal strings only — never execute content streams.
        literals = re.findall(rb"\((?:\\.|[^\\)]){1,200}\)", data)
        decoded = []
        for raw in literals:
            inner = raw[1:-1].replace(b"\\n", b"\n").replace(b"\\(", b"(").replace(b"\\)", b")")
            decoded.append(inner.decode("latin-1", errors="ignore"))
        return " ".join(decoded)


def _docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            if zf.testzip() is not None:
                return ""
            total = sum(info.file_size for info in zf.infolist())
            if total > MAX_UNCOMPRESSED:
                return ""
            with zf.open("word/document.xml") as handle:
                xml = handle.read(MAX_UNCOMPRESSED)
    except Exception:
        return ""
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return ""
    texts = [
        node.text
        for node in root.iter()
        if node.tag.endswith("}t") and node.text
    ]
    return "\n".join(texts)
