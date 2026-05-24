import re
from typing import Dict, List


TEXT_FIELDS = [
    "project_title",
    "description",
    "objective",
    "core_technology",
    "application_area",
    "validation_text",
    "commercialization_plan",
]


def normalize_text(value: str) -> str:
    value = value or ""
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def combine_fields(project: Dict, fields: List[str]) -> str:
    return " ".join(normalize_text(str(project.get(field, ""))) for field in fields if project.get(field))


def split_sentences(text: str) -> List[str]:
    sentences = re.split(r"(?<=[.!?])\s+", normalize_text(text))
    return [sentence.strip() for sentence in sentences if sentence.strip()]


def project_to_log_input(project: Dict) -> Dict:
    return {field: project.get(field, "") for field in TEXT_FIELDS + ["program", "primary_taxonomy", "start_trl_optional"]}
