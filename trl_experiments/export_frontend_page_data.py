import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "frontend" / "assets" / "data"
OUTPUTS = ROOT / "outputs"
RAW_PATH = Path("/Users/kimhyojin/Downloads/TRL_NASA_정제데이터.xlsx")


ALG_DIRS = {
    "alg1_full_fusion": OUTPUTS / "experiments" / "alg1_full_retrieval_metadata_fusion",
    "alg2_no_start_pseudo_start": OUTPUTS / "experiments" / "alg2_no_start_pseudo_start_fusion",
    "alg3_rubric_explainable": OUTPUTS / "experiments" / "alg3_rubric_guided_explainable_fusion",
    "alg4_gridsearched_svc_retrieval": OUTPUTS / "experiments" / "alg4_gridsearched_tfidf_svc_retrieval_fusion",
}


def trl_label(value):
    if pd.isna(value):
        return ""
    value = float(value)
    if value <= 3:
        return "Low"
    if value <= 6:
        return "Mid"
    return "High"


def short_text(value, length=240):
    text = " ".join(str(value or "").split())
    if len(text) <= length:
        return text
    return text[: length - 3] + "..."


def read_predictions():
    merged = None
    for model, directory in ALG_DIRS.items():
        path = directory / "test_predictions.csv"
        df = pd.read_csv(path)
        keep = df[
            [
                "project_id",
                "target_label",
                "predicted_label",
                "probability_low",
                "probability_mid",
                "probability_high",
                "confidence",
            ]
        ].copy()
        keep["project_id"] = keep["project_id"].astype(str)
        keep = keep.rename(
            columns={
                "predicted_label": f"{model}_pred",
                "probability_low": f"{model}_prob_low",
                "probability_mid": f"{model}_prob_mid",
                "probability_high": f"{model}_prob_high",
                "confidence": f"{model}_confidence",
            }
        )
        if merged is None:
            merged = keep
        else:
            merged = merged.merge(keep.drop(columns=["target_label"]), on="project_id", how="outer")
    return merged


def load_raw_with_splits():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw = pd.read_excel(RAW_PATH, sheet_name="Main_Data")
    raw["project_id"] = raw["Project ID"].astype(str)
    raw["target_label_from_end_trl"] = raw["End TRL"].apply(trl_label)
    raw["split"] = "train"
    for split_name in ["valid", "test"]:
        ids = set()
        for directory in ALG_DIRS.values():
            path = directory / f"{split_name}_predictions.csv"
            if path.exists():
                ids.update(pd.read_csv(path)["project_id"].astype(str).tolist())
        raw.loc[raw["project_id"].isin(ids), "split"] = split_name
    return raw


def export_raw_dataset_rows(raw):
    trl_delta = raw["TRL Delta"] if "TRL Delta" in raw.columns else raw.get("TRL_Delta", "")
    rows = pd.DataFrame(
        {
            "project_id": raw["project_id"],
            "project_title": raw["Project Title"].map(lambda x: short_text(x, 180)),
            "program": raw["Program"],
            "primary_tx": raw["Primary TX"],
            "description_excerpt": raw["Description"].map(lambda x: short_text(x, 320)),
            "benefits_excerpt": raw["Benefits"].map(lambda x: short_text(x, 220)),
            "start_trl_reference_only": raw["Start TRL"],
            "end_trl": raw["End TRL"],
            "trl_delta": trl_delta,
            "target_label": raw["target_label_from_end_trl"],
            "split": raw["split"],
        }
    )
    rows.to_csv(DATA_DIR / "raw_all_project_rows.csv", index=False)
    return rows


def export_project_rows(raw):
    pred = read_predictions()
    df = pred.merge(raw, on="project_id", how="left")
    df = df.sort_values(["target_label", "project_id"]).copy()

    rows = pd.DataFrame(
        {
            "project_id": df["project_id"],
            "project_title": df["Project Title"].map(lambda x: short_text(x, 120)),
            "program": df["Program"],
            "primary_tx": df["Primary TX"],
            "description_excerpt": df["Description"].map(lambda x: short_text(x, 260)),
            "benefits_excerpt": df["Benefits"].map(lambda x: short_text(x, 180)),
            "start_trl_reference_only": df["Start TRL"],
            "end_trl_label_source": df["End TRL"],
            "target_label": df["target_label"],
        }
    )
    for model in ALG_DIRS:
        rows[f"{model}_pred"] = df[f"{model}_pred"]
        rows[f"{model}_confidence"] = df[f"{model}_confidence"].round(4)
    rows.to_csv(DATA_DIR / "project_analysis_rows.csv", index=False)
    return rows


def export_event_rows(project_rows):
    events = project_rows.copy()
    events.insert(0, "event_id", [f"RAW-TEST-{i + 1:04d}" for i in range(len(events))])
    events["source"] = "raw_excel_test_split"
    events["deployment_safe_best_by_accuracy"] = events["alg4_gridsearched_svc_retrieval_pred"]
    events["deployment_safe_best_by_macro_f1"] = events["alg2_no_start_pseudo_start_pred"]
    events["upper_bound_with_start_trl"] = events["alg1_full_fusion_pred"]
    events.to_csv(DATA_DIR / "event_analysis_rows.csv", index=False)


def export_agent_logs():
    retrieval = pd.read_csv(OUTPUTS / "retrieval" / "retrieval_features_test.csv")
    pseudo = pd.read_csv(OUTPUTS / "pseudo_start" / "pseudo_start_test.csv")
    rubric = pd.read_csv(OUTPUTS / "rubric" / "rubric_features_test.csv")
    alg4_grid = pd.read_csv(ALG_DIRS["alg4_gridsearched_svc_retrieval"] / "grid_search_results.csv")
    configs = {}
    metrics = {}
    for model, directory in ALG_DIRS.items():
        configs[model] = json.loads((directory / "config.json").read_text(encoding="utf-8"))
        metrics[model] = json.loads((directory / "metrics.json").read_text(encoding="utf-8"))
    def records(df):
        return json.loads(df.where(pd.notna(df), None).to_json(orient="records"))

    payload = {
        "field_policy": {
            "description": "Primary TRL judgment field for retrieval, pseudo-start, rubric, and text features.",
            "benefits": "Auxiliary evidence for commercialization/deployment/application readiness.",
            "project_title": "Auxiliary technology identity only; not used alone for TRL judgment.",
            "program_primary_tx": "Metadata-safe prior features.",
            "start_trl": "Only used by Algorithm 1 upper-bound experiment.",
        },
        "algorithms": configs,
        "metrics": metrics,
        "retrieval_samples": records(retrieval),
        "pseudo_start_samples": records(pseudo),
        "rubric_samples": records(rubric),
        "alg4_grid_search_top": alg4_grid.sort_values(["validation_accuracy", "validation_macro_f1"], ascending=False)
        .head(20)
        .pipe(records),
    }
    (DATA_DIR / "agent_algorithm_logs.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def export_architecture():
    architectures = {
        "alg1_full_fusion": {
            "purpose": "Upper-bound performance check. Uses Start TRL, so it is not deployment-safe.",
            "uses_start_trl": True,
            "flow": [
                "Raw Excel row",
                "Description-centered TF-IDF word/char features",
                "Program + Primary TX metadata one-hot",
                "Start TRL numeric reference feature",
                "Train-corpus retrieval distribution",
                "LogisticRegression candidate selection by validation macro-F1",
                "Final Low/Mid/High prediction",
            ],
        },
        "alg2_no_start_pseudo_start": {
            "purpose": "Main deployment-safe model. Excludes Start TRL and estimates pseudo-start from Description.",
            "uses_start_trl": False,
            "flow": [
                "Raw Excel row",
                "Description-centered TF-IDF word/char features",
                "Program + Primary TX metadata one-hot",
                "Retrieval distribution from Description-centered similarity",
                "Pseudo-start TRL from Description rules",
                "LogisticRegression candidate selection by validation macro-F1",
                "Final Low/Mid/High prediction",
            ],
        },
        "alg3_rubric_explainable": {
            "purpose": "Explainable model with rubric evidence scores and final natural-language reason.",
            "uses_start_trl": False,
            "flow": [
                "Raw Excel row",
                "Text model probabilities",
                "Description-centered rubric evidence scoring",
                "Benefits auxiliary commercialization evidence",
                "Retrieval + pseudo-start + metadata features",
                "LogisticRegression fusion",
                "Explanation JSONL generation",
            ],
        },
        "alg4_gridsearched_svc_retrieval": {
            "purpose": "Accuracy-focused deployment-safe model targeting 70%+ accuracy without Start TRL.",
            "uses_start_trl": False,
            "flow": [
                "Raw Excel row",
                "Grid over word TF-IDF, char_wb TF-IDF, and word+char",
                "Grid over retrieval, pseudo-start, rubric optional features",
                "Grid over LinearSVC, LogisticRegression, Calibrated LinearSVC",
                "Validation accuracy primary selection with macro-F1 tie-breaker",
                "Final one-time test evaluation",
            ],
        },
    }
    (DATA_DIR / "algorithm_architecture.json").write_text(json.dumps(architectures, ensure_ascii=False, indent=2), encoding="utf-8")


def export_rules_rows():
    rows = [
        ["principle_evidence", "principle; theory; basic research; scientific basis", "early TRL principle", "TRL 1-2"],
        ["concept_evidence", "concept; feasibility; proof of concept; analytical", "concept maturity", "TRL 2-3"],
        ["lab_validation_evidence", "laboratory; lab; bench test; component validation", "lab validation", "TRL 3-4"],
        ["prototype_evidence", "prototype; breadboard; engineering model; pilot module", "prototype evidence", "TRL 4-5"],
        ["relevant_environment_evidence", "relevant environment; testbed; demonstration", "relevant environment", "TRL 5-6"],
        ["operational_environment_evidence", "operational environment; field test; flight test; real-world; deployed", "operational evidence", "TRL 6-8"],
        ["commercialization_evidence", "commercial; production; operational use; commercial use; market", "commercial readiness", "TRL 8-9"],
    ]
    pd.DataFrame(rows, columns=["category", "keywords", "purpose", "mapped_trl_range"]).to_csv(DATA_DIR / "rules_analysis_rows.csv", index=False)


def main():
    raw = load_raw_with_splits()
    export_raw_dataset_rows(raw)
    project_rows = export_project_rows(raw)
    export_event_rows(project_rows)
    export_agent_logs()
    export_architecture()
    export_rules_rows()
    print(f"Exported page data files to {DATA_DIR}")


if __name__ == "__main__":
    main()
