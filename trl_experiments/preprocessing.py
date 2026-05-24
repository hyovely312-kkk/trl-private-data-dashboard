import re
from typing import List


def split_sentences(text: str) -> List[str]:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if not text:
        return []
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def bucket_from_trl(value: int) -> str:
    if value <= 3:
        return "Low"
    if value <= 6:
        return "Mid"
    return "High"
