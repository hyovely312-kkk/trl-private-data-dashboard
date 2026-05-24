from typing import Dict

from modules.preprocessing import combine_fields, split_sentences


PSEUDO_RULES = {
    "principle": {"keywords": ["concept", "principle", "theory", "basic research"], "score": 1},
    "lab_validation": {"keywords": ["laboratory", "lab", "bench test", "validated in lab"], "score": 2},
    "prototype": {"keywords": ["prototype", "breadboard", "pilot module"], "score": 3},
    "relevant_environment": {"keywords": ["relevant environment", "testbed", "pilot", "simulation environment"], "score": 4},
    "operational_environment": {
        "keywords": ["operational environment", "field deployment", "real-world", "commercial deployment"],
        "score": 5,
    },
}

INPUT_FIELDS = ["description", "objective", "validation_text", "commercialization_plan"]


def _score_to_trl(score: int) -> int:
    return {0: 1, 1: 2, 2: 3, 3: 4, 4: 6, 5: 8}.get(score, 1)


def run_pseudo_start_agent(project: Dict) -> Dict:
    text = combine_fields(project, INPUT_FIELDS)
    sentences = split_sentences(text)
    detected_terms = []
    rule_scores = {category: 0 for category in PSEUDO_RULES}

    for category, rule in PSEUDO_RULES.items():
        for keyword in rule["keywords"]:
            keyword_lower = keyword.lower()
            for sentence in sentences:
                if keyword_lower in sentence.lower():
                    rule_scores[category] = max(rule_scores[category], rule["score"])
                    detected_terms.append(
                        {
                            "term": keyword,
                            "category": category,
                            "matched_sentence": sentence,
                        }
                    )
                    break

    highest_score = max(rule_scores.values()) if rule_scores else 0
    pseudo_start_trl = _score_to_trl(highest_score)
    coverage = min(len(detected_terms) / 6, 1)
    confidence = round(0.45 + (highest_score / 5) * 0.35 + coverage * 0.2, 4) if highest_score else 0.35
    if highest_score >= 5:
        reason = "Operational or real-world evidence terms were detected."
    elif highest_score >= 4:
        reason = "Relevant environment, testbed, or pilot terms were detected, but operational evidence is limited."
    elif highest_score >= 3:
        reason = "Prototype terms were detected, but field or operational evidence was not strong."
    elif highest_score >= 2:
        reason = "Laboratory validation terms were detected without strong prototype or deployment evidence."
    else:
        reason = "Only principle-level or weak maturity evidence was detected."

    return {
        "agent_name": "Pseudo-Start TRL Agent",
        "input_fields": INPUT_FIELDS,
        "processing_method": "Rule-based keyword scoring. User-provided Start TRL is not used by the main model.",
        "detected_terms": detected_terms,
        "rule_scores": rule_scores,
        "pseudo_start_trl": pseudo_start_trl,
        "confidence": round(confidence, 4),
        "start_trl_reference": project.get("start_trl_optional"),
        "reason": reason,
    }
