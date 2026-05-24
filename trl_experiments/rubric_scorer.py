from pathlib import Path
from typing import Dict

import pandas as pd

from trl_experiments.preprocessing import split_sentences


RUBRIC_KEYWORDS = {
    "principle_evidence": ["principle", "theory", "basic research", "scientific basis"],
    "concept_evidence": ["concept", "feasibility", "proof of concept", "analytical"],
    "lab_validation_evidence": ["laboratory", "lab", "bench test", "component validation", "validated in lab"],
    "prototype_evidence": ["prototype", "breadboard", "engineering model", "pilot module"],
    "relevant_environment_evidence": ["relevant environment", "testbed", "demonstration", "simulated environment"],
    "operational_environment_evidence": ["operational environment", "field test", "flight test", "real-world", "deployed"],
    "commercialization_evidence": ["commercial", "production", "operational use", "commercial use", "market"],
}


def score_text(text: str) -> Dict:
    sentences = split_sentences(text)
    scores = {}
    evidence = []
    for category, keywords in RUBRIC_KEYWORDS.items():
        matched_keywords = set()
        matched_sentences = []
        for sentence in sentences:
            matched = [kw for kw in keywords if kw in sentence.lower()]
            if matched:
                matched_keywords.update(matched)
                matched_sentences.append(sentence)
        score = min(len(matched_keywords) / max(len(keywords), 1), 1.0)
        score_name = category.replace("_evidence", "_score")
        scores[score_name] = round(score, 4)
        for sentence in matched_sentences[:2]:
            evidence.append({"category": category, "sentence": sentence, "score": round(score, 4)})
    evidence = sorted(evidence, key=lambda item: item["score"], reverse=True)[:5]
    high_scores = [
        scores.get("operational_environment_score", 0),
        scores.get("commercialization_score", 0),
        scores.get("relevant_environment_score", 0),
    ]
    if max(high_scores) < 0.2:
        missing = "High-TRL evidence is weak: no strong relevant, operational, or commercialization signal was detected."
    else:
        missing = ""
    return {
        **scores,
        "top_evidence_sentences": " | ".join(item["sentence"] for item in evidence),
        "missing_high_trl_reason": missing,
    }


def generate_rubric_features(splits: Dict, output_dir: Path, logger):
    output_path = output_dir / "rubric"
    output_path.mkdir(parents=True, exist_ok=True)
    result = {}
    for split in ["train", "valid", "test"]:
        rows = []
        for _, row in splits[split].iterrows():
            payload = score_text(row["evidence_text"])
            payload.update({"project_id": str(row["Project ID"]), "target_label": row["target_label"]})
            rows.append(payload)
        df = pd.DataFrame(rows)
        if split in ["valid", "test"]:
            df.to_csv(output_path / f"rubric_features_{split}.csv", index=False)
        result[split] = df
        logger.info("Rubric features generated split=%s shape=%s", split, df.shape)
    return result
