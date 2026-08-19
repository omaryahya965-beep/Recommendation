from pathlib import Path

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def render_prompt(name: str, **values) -> str:
    path = PROMPTS_DIR / name
    template = path.read_text(encoding="utf-8")
    for key, value in values.items():
        template = template.replace("{{" + key + "}}", "" if value is None else str(value))
    return template
