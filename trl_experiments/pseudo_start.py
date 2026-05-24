from pathlib import Path
from typing import Dict, List

import pandas as pd

from trl_experiments.preprocessing import bucket_from_trl


RULES = [
    ("concept_principle", ["concept", "principle", "theory", "feasibility"], 2),
    ("proof_of_concept", ["proof of concept", "analytical", "formulation"], 3),
    ("lab_component", ["laboratory", "lab", "breadboard", "component validation"], 4),
    ("prototype_validation", ["prototype", "tested", "validation", "validated"], 5),
    ("relevant_environment", ["relevant environment", "demonstration", "testbed"], 6),
    ("field_operational", ["field test", "operational environment", "flight test"], 8),
    ("commercial_deployed", ["commercial", "deployed", "operational use", "production"], 9),
]


def estimate_text(text: str) -> Dict:
    lowered = str(text or "").lower()
    matches: List[Dict] = []
    best_trl = 1
    for category, keywords, trl in RULES:
        matched = [kw for kw in keywords if kw in lowered]
        if matched:
            best_trl = max(best_trl, trl)
            matches.append({"category": category, "keywords": matched, "mapped_trl": trl})
    confidence = min(0.35 + 0.08 * sum(len(item["keywords"]) for item in matches) + best_trl / 18, 0.95)
    if not matches:
        reason = "No explicit maturity keywords were detected; defaulted to early-stage pseudo-start."
    else:
        reason = f"Highest detected maturity signal maps to pseudo TRL {best_trl}."
    return {
        "pseudo_start_trl": int(best_trl),
        "pseudo_start_bucket": bucket_from_trl(int(best_trl)),
        "pseudo_start_confidence": round(float(confidence), 4),
        "matched_keywords": "; ".join(f"{m['category']}:{','.join(m['keywords'])}" for m in matches),
        "pseudo_start_reason": reason,
    }


def generate_pseudo_start(splits: Dict, output_dir: Path, logger):
    output_path = output_dir / "pseudo_start"
    output_path.mkdir(parents=True, exist_ok=True)
    result = {}
    for split in ["train", "valid", "test"]:
        rows = []
        for _, row in splits[split].iterrows():
            payload = estimate_text(row["description_primary_text"])
            payload.update({"project_id": str(row["Project ID"]), "target_label": row["target_label"]})
            rows.append(payload)
        df = pd.DataFrame(rows)
        if split in ["valid", "test"]:
            df.to_csv(output_path / f"pseudo_start_{split}.csv", index=False)
        result[split] = df
        logger.info("Pseudo-start features generated split=%s shape=%s", split, df.shape)
    return result
