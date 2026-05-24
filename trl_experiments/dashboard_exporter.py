import json
import shutil
from pathlib import Path
from typing import Dict

import pandas as pd

from trl_experiments.config import LABELS
from trl_experiments.logger import save_json


def export_dashboard_files(
    output_dir: Path,
    project_root: Path,
    profile: Dict,
    split_distribution: Dict,
    experiment_results: Dict,
    retrieval_features: Dict,
    pseudo_features: Dict,
    rubric_features: Dict,
    logger,
):
    dashboard_dir = output_dir / "dashboard"
    dashboard_dir.mkdir(parents=True, exist_ok=True)
    leaderboard_rows = []
    classwise_rows = []
    for key, result in experiment_results.items():
        test = result["test_metrics"]
        valid = result["validation_metrics"]
        leaderboard_rows.append(
            {
                "model": key,
                "uses_start_trl": key.startswith("alg1"),
                "validation_macro_f1": valid["macro_f1"],
                "test_accuracy": test["accuracy"],
                "test_macro_f1": test["macro_f1"],
                "test_weighted_f1": test["weighted_f1"],
                "test_mae": test["mae"],
            }
        )
        for label in LABELS:
            lower = label.lower()
            classwise_rows.append(
                {
                    "model": key,
                    "class": label,
                    "precision": test[f"precision_{lower}"],
                    "recall": test[f"recall_{lower}"],
                    "f1": test[f"f1_{lower}"],
                }
            )
    leaderboard = pd.DataFrame(leaderboard_rows).sort_values("test_macro_f1", ascending=False)
    classwise = pd.DataFrame(classwise_rows)
    leaderboard.to_csv(dashboard_dir / "model_leaderboard.csv", index=False)
    classwise.to_csv(dashboard_dir / "classwise_metrics.csv", index=False)

    sample_predictions = []
    for key, result in experiment_results.items():
        temp = result["test_predictions"].head(80).copy()
        temp.insert(0, "model", key)
        sample_predictions.append(temp)
    pd.concat(sample_predictions, ignore_index=True).to_csv(dashboard_dir / "sample_predictions.csv", index=False)

    if "alg3_rubric_explainable" in experiment_results:
        with (dashboard_dir / "sample_explanations.jsonl").open("w", encoding="utf-8") as handle:
            for item in experiment_results["alg3_rubric_explainable"].get("explanations", [])[:200]:
                handle.write(json.dumps(item, ensure_ascii=False) + "\n")

    retrieval_features["test"].head(200).to_csv(dashboard_dir / "retrieval_examples.csv", index=False)
    rubric_cols = [col for col in rubric_features["test"].columns if col.endswith("_score")]
    rubric_features["test"][rubric_cols].describe().to_csv(dashboard_dir / "rubric_score_distribution.csv")
    pseudo_features["test"]["pseudo_start_bucket"].value_counts().rename_axis("bucket").reset_index(name="count").to_csv(dashboard_dir / "pseudo_start_distribution.csv", index=False)

    best_model = leaderboard.iloc[0]["model"] if not leaderboard.empty else None
    safe = leaderboard[~leaderboard["uses_start_trl"]]
    best_safe = safe.iloc[0]["model"] if not safe.empty else None
    best_accuracy_model = leaderboard.sort_values("test_accuracy", ascending=False).iloc[0]["model"] if not leaderboard.empty else None
    best_safe_accuracy = safe.sort_values("test_accuracy", ascending=False).iloc[0]["model"] if not safe.empty else None
    summary = {
        "dataset": {
            "n_total": int(profile["final_shape"][0]),
            "n_train": int(split_distribution["train"]["n"]),
            "n_valid": int(split_distribution["valid"]["n"]),
            "n_test": int(split_distribution["test"]["n"]),
            "label_distribution": profile["label_distribution"],
            "input_path": profile["input_path"],
            "sheet": profile["actual_sheet"],
        },
        "models": {
            key: {
                "uses_start_trl": key.startswith("alg1"),
                "validation": result["validation_metrics"],
                "test": result["test_metrics"],
                "selected_model": result["selected_model"],
            }
            for key, result in experiment_results.items()
        },
        "best_model_by_macro_f1": best_model,
        "best_deployment_safe_model": best_safe,
        "best_model_by_accuracy": best_accuracy_model,
        "best_deployment_safe_model_by_accuracy": best_safe_accuracy,
        "notes": [
            "Algorithm 1 includes Start TRL and should be interpreted as upper-bound.",
            "Algorithm 2, 3, and 4 exclude Start TRL and are deployment-safe.",
            "Algorithm 4 performs validation grid search over TF-IDF text blocks, optional pseudo/rubric features, and linear classifiers.",
        ],
    }
    save_json(dashboard_dir / "dashboard_summary.json", summary)

    frontend_data = project_root / "frontend" / "assets" / "data"
    frontend_data.mkdir(parents=True, exist_ok=True)
    for name in [
        "dashboard_summary.json",
        "model_leaderboard.csv",
        "classwise_metrics.csv",
        "sample_predictions.csv",
        "sample_explanations.jsonl",
        "retrieval_examples.csv",
        "rubric_score_distribution.csv",
        "pseudo_start_distribution.csv",
    ]:
        source = dashboard_dir / name
        if source.exists():
            shutil.copy2(source, frontend_data / name)
    logger.info("Dashboard export saved to %s and copied to %s", dashboard_dir, frontend_data)
    return summary
