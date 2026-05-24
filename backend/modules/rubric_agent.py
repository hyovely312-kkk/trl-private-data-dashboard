import json
from pathlib import Path
from typing import Dict

from modules.preprocessing import combine_fields, split_sentences


INPUT_FIELDS = ["description", "objective", "validation_text", "commercialization_plan"]


def run_rubric_agent(project: Dict, rules_path: Path) -> Dict:
    rules = json.loads(rules_path.read_text(encoding="utf-8"))
    text = combine_fields(project, INPUT_FIELDS)
    sentences = split_sentences(text)
    rubric_scores = {}
    evidence_sentences = []
    category_sentence_map = {category: [] for category in rules}

    for category, rule in rules.items():
        keywords = rule.get("keywords", [])
        matched_keywords = set()
        for sentence in sentences:
            matched_in_sentence = [kw for kw in keywords if kw.lower() in sentence.lower()]
            if matched_in_sentence:
                matched_keywords.update(matched_in_sentence)
                category_sentence_map[category].append(sentence)
        score = len(matched_keywords) / max(len(keywords), 1)
        rubric_scores[category] = round(min(score, 1), 4)

    for sentence in sentences:
        matched_categories = [
            category
            for category, rule in rules.items()
            if any(keyword.lower() in sentence.lower() for keyword in rule.get("keywords", []))
        ]
        if matched_categories:
            weight = max(rubric_scores[category] for category in matched_categories)
            evidence_sentences.append(
                {
                    "sentence": sentence,
                    "matched_categories": matched_categories,
                    "weight": round(weight, 4),
                }
            )

    missing_evidence = []
    missing_labels = {
        "field_demo": "No field deployment or relevant environment evidence was detected.",
        "operation": "No operational environment or commercialization deployment evidence was detected.",
        "prototype": "No prototype evidence was detected.",
        "lab_validation": "No laboratory validation evidence was detected.",
    }
    for category, message in missing_labels.items():
        if rubric_scores.get(category, 0) == 0:
            missing_evidence.append(message)

    return {
        "agent_name": "Rubric Evidence Agent",
        "input_fields": INPUT_FIELDS,
        "processing_method": "Sentence-level keyword matching with normalized evidence category scores.",
        "rubric_scores": rubric_scores,
        "evidence_sentences": evidence_sentences,
        "missing_evidence": missing_evidence,
    }
