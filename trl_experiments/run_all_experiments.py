import argparse
import json
import sys
import time
from pathlib import Path

import pandas as pd

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from trl_experiments.config import resolve_default_input
from trl_experiments.dashboard_exporter import export_dashboard_files
from trl_experiments.data_loader import load_projects, stratified_split
from trl_experiments.feature_text import build_text_features
from trl_experiments.logger import append_text, save_json, setup_logger
from trl_experiments.models import run_algorithm_1, run_algorithm_2, run_algorithm_3, run_algorithm_4
from trl_experiments.pseudo_start import generate_pseudo_start
from trl_experiments.retrieval_engine import generate_retrieval_features
from trl_experiments.rubric_scorer import generate_rubric_features


def parse_args():
    parser = argparse.ArgumentParser(description="Run reproducible TRL classification experiments.")
    parser.add_argument("--input", default=str(resolve_default_input()))
    parser.add_argument("--sheet", default="Projects_Clean")
    parser.add_argument("--output_dir", default="outputs")
    parser.add_argument("--log_dir", default="logs")
    parser.add_argument("--random_state", type=int, default=42)
    return parser.parse_args()


def resolve_input(path_value: str, logger) -> Path:
    path = Path(path_value)
    if path.exists():
        return path
    fallback = resolve_default_input()
    logger.warning("Input %s not found. Falling back to %s", path, fallback)
    return fallback


def write_stage_log(log_dir: Path, name: str, payload):
    path = log_dir / name
    if isinstance(payload, str):
        append_text(path, payload)
    else:
        save_json(path, payload)


def main():
    args = parse_args()
    project_root = Path(__file__).resolve().parents[1]
    output_dir = (project_root / args.output_dir).resolve()
    log_dir = (project_root / args.log_dir).resolve()
    logger = setup_logger(log_dir)
    start_time = time.time()
    errors = []

    try:
        input_path = resolve_input(args.input, logger)
        df, profile = load_projects(input_path, args.sheet, logger)
        save_json(log_dir / "data_profile.json", profile)

        splits, split_distribution = stratified_split(df, args.random_state, logger)
        save_json(log_dir / "split_distribution.json", split_distribution)

        text_features, vectorizer_config, feature_shapes = build_text_features(splits, output_dir, log_dir, logger)
        write_stage_log(log_dir, "feature_generation.log", f"Generated TF-IDF features: {json.dumps(feature_shapes)}")

        retrieval_features = generate_retrieval_features(splits, text_features, output_dir, logger)
        write_stage_log(log_dir, "retrieval_generation.log", "Generated train/valid/test retrieval features with top_k=5; valid/test CSV files saved.")

        pseudo_features = generate_pseudo_start(splits, output_dir, logger)
        write_stage_log(log_dir, "pseudo_start_generation.log", "Generated rule-based pseudo-start TRL features without using Start TRL.")

        rubric_features = generate_rubric_features(splits, output_dir, logger)
        write_stage_log(log_dir, "rubric_generation.log", "Generated rubric evidence scores and evidence sentence summaries.")

        experiment_results = {}
        experiment_plan = [
            ("alg1_full_fusion", lambda: run_algorithm_1(splits, text_features, retrieval_features, output_dir, logger)),
            ("alg2_no_start_pseudo_start", lambda: run_algorithm_2(splits, text_features, retrieval_features, pseudo_features, output_dir, logger)),
            ("alg3_rubric_explainable", lambda: run_algorithm_3(splits, text_features, retrieval_features, pseudo_features, rubric_features, output_dir, logger)),
            ("alg4_gridsearched_svc_retrieval", lambda: run_algorithm_4(splits, text_features, retrieval_features, pseudo_features, rubric_features, output_dir, logger)),
        ]
        for key, runner in experiment_plan:
            try:
                logger.info("Running %s", key)
                experiment_results[key] = runner()
            except Exception as exc:
                logger.exception("Experiment failed: %s", key)
                errors.append({"stage": key, "error": str(exc)})

        if not experiment_results:
            raise RuntimeError("No experiment completed successfully.")

        dashboard_summary = export_dashboard_files(
            output_dir,
            project_root,
            profile,
            split_distribution,
            experiment_results,
            retrieval_features,
            pseudo_features,
            rubric_features,
            logger,
        )

        runtime_seconds = round(time.time() - start_time, 2)
        summary = {
            "status": "completed_with_errors" if errors else "completed",
            "errors": errors,
            "runtime_seconds": runtime_seconds,
            "data_profile": profile,
            "split_distribution": split_distribution,
            "feature_shapes": feature_shapes,
            "experiments": {
                key: {
                    "selected_model": result["selected_model"],
                    "validation_metrics": result["validation_metrics"],
                    "test_metrics": result["test_metrics"],
                }
                for key, result in experiment_results.items()
            },
            "dashboard_summary_path": str(output_dir / "dashboard" / "dashboard_summary.json"),
        }
        save_json(log_dir / "experiment_summary.json", summary)
        save_json(output_dir / "experiment_summary.json", summary)

        leaderboard = pd.read_csv(output_dir / "dashboard" / "model_leaderboard.csv")
        safe = leaderboard[~leaderboard["uses_start_trl"]]
        best_safe = safe.iloc[0]["model"] if len(safe) else "N/A"
        best_upper = leaderboard[leaderboard["uses_start_trl"]].iloc[0]["model"] if len(leaderboard[leaderboard["uses_start_trl"]]) else "N/A"

        print("\n=== TRL EXPERIMENT RUN COMPLETE ===")
        print(f"Data loading: success ({profile['input_path']} / sheet={profile['actual_sheet']})")
        print(f"Total samples: {profile['final_shape'][0]}")
        print(f"Train/Valid/Test: {split_distribution['train']['n']} / {split_distribution['valid']['n']} / {split_distribution['test']['n']}")
        print(f"Class distribution: {profile['label_distribution']}")
        print("\nModel metrics:")
        for key, result in experiment_results.items():
            valid = result["validation_metrics"]
            test = result["test_metrics"]
            print(f"- {key}: valid_macro_f1={valid['macro_f1']:.4f}, test_accuracy={test['accuracy']:.4f}, test_macro_f1={test['macro_f1']:.4f}, test_mae={test['mae']:.4f}")
        print(f"Best deployment-safe model: {best_safe}")
        print(f"Best upper-bound model: {best_upper}")
        print(f"Results saved: {output_dir}")
        print(f"Logs saved: {log_dir}")
        print(f"Dashboard files: {output_dir / 'dashboard'}")
        print(f"Frontend dashboard data copy: {project_root / 'frontend' / 'assets' / 'data'}")
        print(f"Status: {summary['status']}")
        if dashboard_summary:
            print(f"Best model by macro_f1: {dashboard_summary.get('best_model_by_macro_f1')}")
        return 0
    except Exception as exc:
        logger.exception("Fatal pipeline error")
        errors.append({"stage": "fatal", "error": str(exc)})
        save_json(log_dir / "experiment_summary.json", {"status": "failed", "errors": errors})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
