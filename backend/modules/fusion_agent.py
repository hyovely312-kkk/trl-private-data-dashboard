from typing import Dict


FEATURE_NAMES = [
    "neighbor_low_ratio",
    "neighbor_mid_ratio",
    "neighbor_high_ratio",
    "mean_similarity",
    "pseudo_start_trl",
    "pseudo_start_confidence",
    "principle_score",
    "lab_validation_score",
    "prototype_score",
    "field_demo_score",
    "operation_score",
]


def _pseudo_distribution(pseudo_start_trl: int, confidence: float) -> Dict[str, float]:
    base = {"Low": 0.15, "Mid": 0.15, "High": 0.15}
    if pseudo_start_trl <= 3:
        base["Low"] += confidence
    elif pseudo_start_trl <= 6:
        base["Mid"] += confidence
    else:
        base["High"] += confidence
    total = sum(base.values())
    return {key: value / total for key, value in base.items()}


def _rubric_distribution(scores: Dict[str, float]) -> Dict[str, float]:
    low = scores.get("principle", 0) * 0.7 + scores.get("lab_validation", 0) * 0.3
    mid = scores.get("lab_validation", 0) * 0.35 + scores.get("prototype", 0) * 0.4 + scores.get("field_demo", 0) * 0.25
    high = scores.get("field_demo", 0) * 0.35 + scores.get("operation", 0) * 0.65
    floor = 0.03
    raw = {"Low": low + floor, "Mid": mid + floor, "High": high + floor}
    total = sum(raw.values())
    return {key: value / total for key, value in raw.items()}


def run_fusion_agent(retrieval_log: Dict, pseudo_start_log: Dict, rubric_log: Dict) -> Dict:
    retrieval_weight = 0.35
    pseudo_weight = 0.30
    rubric_weight = 0.35
    retrieval_dist = retrieval_log.get("neighbor_distribution", {"Low": 0, "Mid": 0, "High": 0})
    pseudo_dist = _pseudo_distribution(
        pseudo_start_log.get("pseudo_start_trl", 1),
        pseudo_start_log.get("confidence", 0.35),
    )
    rubric_scores = rubric_log.get("rubric_scores", {})
    rubric_dist = _rubric_distribution(rubric_scores)

    probabilities = {}
    for label in ["Low", "Mid", "High"]:
        probabilities[label] = (
            retrieval_dist.get(label, 0) * retrieval_weight
            + pseudo_dist.get(label, 0) * pseudo_weight
            + rubric_dist.get(label, 0) * rubric_weight
        )
    total = sum(probabilities.values()) or 1
    probabilities = {label: round(value / total, 4) for label, value in probabilities.items()}
    final_class = max(probabilities, key=probabilities.get)
    range_map = {"Low": "TRL 1-3", "Mid": "TRL 4-6", "High": "TRL 7-9"}

    feature_vector = [
        retrieval_dist.get("Low", 0),
        retrieval_dist.get("Mid", 0),
        retrieval_dist.get("High", 0),
        retrieval_log.get("mean_similarity", 0),
        pseudo_start_log.get("pseudo_start_trl", 1),
        pseudo_start_log.get("confidence", 0),
        rubric_scores.get("principle", 0),
        rubric_scores.get("lab_validation", 0),
        rubric_scores.get("prototype", 0),
        rubric_scores.get("field_demo", 0),
        rubric_scores.get("operation", 0),
    ]

    return {
        "agent_name": "Fusion Decision Agent",
        "weights": {
            "retrieval_score_weight": retrieval_weight,
            "pseudo_start_weight": pseudo_weight,
            "rubric_score_weight": rubric_weight,
        },
        "feature_vector": feature_vector,
        "feature_names": FEATURE_NAMES,
        "probabilities": probabilities,
        "final_class": final_class,
        "predicted_trl_range": range_map[final_class],
    }
