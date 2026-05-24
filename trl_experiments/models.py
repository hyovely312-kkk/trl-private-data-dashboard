import json
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import Normalizer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import LinearSVC

from trl_experiments.config import LABELS
from trl_experiments.evaluate import compute_metrics, confusion_df
from trl_experiments.logger import save_json


def _metadata_transformer(train_df: pd.DataFrame, include_start: bool):
    categorical = ["Program", "Primary TX"]
    numeric = ["Start TRL"] if include_start else []
    transformer = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=2), categorical),
            ("num", StandardScaler(), numeric),
        ],
        remainder="drop",
        sparse_threshold=1.0,
    )
    matrix = transformer.fit_transform(train_df[categorical + numeric])
    return transformer, csr_matrix(matrix)


def _transform_metadata(transformer, df: pd.DataFrame, include_start: bool):
    columns = ["Program", "Primary TX"] + (["Start TRL"] if include_start else [])
    return csr_matrix(transformer.transform(df[columns]))


def _numeric_matrix(df: pd.DataFrame, columns: List[str]):
    return csr_matrix(df[columns].fillna(0).to_numpy(dtype=float))


def _fit_candidates(x_train, y_train, x_valid, y_valid, logger, allow_svc: bool = True):
    candidates = [
        (
            "logistic_regression_C1",
            OneVsRestClassifier(LogisticRegression(max_iter=400, C=1.0, class_weight="balanced", solver="liblinear", random_state=42)),
        ),
        (
            "logistic_regression_C0.5",
            OneVsRestClassifier(LogisticRegression(max_iter=400, C=0.5, class_weight="balanced", solver="liblinear", random_state=42)),
        ),
    ]
    if allow_svc and x_train.shape[1] < 15000:
        candidates.append(("linear_svc_calibrated", CalibratedClassifierCV(LinearSVC(class_weight="balanced", random_state=42), cv=3)))
    best = None
    trials = []
    for name, model in candidates:
        model.fit(x_train, y_train)
        pred = model.predict(x_valid)
        probs = model.predict_proba(x_valid) if hasattr(model, "predict_proba") else None
        metrics = compute_metrics(y_valid, pred, probs)
        trials.append({"name": name, "validation_metrics": metrics})
        logger.info("Candidate %s validation macro_f1=%.4f accuracy=%.4f", name, metrics["macro_f1"], metrics["accuracy"])
        if best is None or metrics["macro_f1"] > best[2]["macro_f1"]:
            best = (name, model, metrics)
    return best[0], best[1], best[2], trials


def _save_predictions(path: Path, df: pd.DataFrame, pred, probs, extra_cols: List[str] = None):
    out = pd.DataFrame(
        {
            "project_id": df["Project ID"].astype(str).to_numpy(),
            "project_title": df["Project Title"].astype(str).to_numpy(),
            "target_label": df["target_label"].to_numpy(),
            "predicted_label": pred,
            "probability_low": probs[:, 0],
            "probability_mid": probs[:, 1],
            "probability_high": probs[:, 2],
            "confidence": probs.max(axis=1),
        }
    )
    if extra_cols:
        for col in extra_cols:
            out[col] = df[col].to_numpy() if col in df.columns else None
    out.to_csv(path, index=False)
    return out


def _align_probabilities(model, probs):
    classes = list(model.classes_)
    aligned = np.zeros((probs.shape[0], len(LABELS)))
    for idx, label in enumerate(LABELS):
        if label in classes:
            aligned[:, idx] = probs[:, classes.index(label)]
    row_sums = aligned.sum(axis=1)
    row_sums[row_sums == 0] = 1
    return aligned / row_sums[:, None]


def _export_common(exp_dir: Path, model_name: str, model, valid_df, test_df, x_valid, x_test, config, trials, logger):
    exp_dir.mkdir(parents=True, exist_ok=True)
    valid_pred = model.predict(x_valid)
    valid_probs = _align_probabilities(model, model.predict_proba(x_valid))
    test_pred = model.predict(x_test)
    test_probs = _align_probabilities(model, model.predict_proba(x_test))
    valid_metrics = compute_metrics(valid_df["target_label"], valid_pred, valid_probs)
    test_metrics = compute_metrics(test_df["target_label"], test_pred, test_probs)
    valid_predictions = _save_predictions(exp_dir / "valid_predictions.csv", valid_df, valid_pred, valid_probs)
    test_predictions = _save_predictions(exp_dir / "test_predictions.csv", test_df, test_pred, test_probs)
    confusion_df(test_df["target_label"], test_pred).to_csv(exp_dir / "confusion_matrix.csv")
    save_json(exp_dir / "metrics.json", {"validation": valid_metrics, "test": test_metrics})
    save_json(exp_dir / "config.json", {**config, "selected_model": model_name, "candidate_trials": trials})
    logger.info("Saved experiment %s metrics valid_macro_f1=%.4f test_macro_f1=%.4f", exp_dir.name, valid_metrics["macro_f1"], test_metrics["macro_f1"])
    return {
        "selected_model": model_name,
        "validation_metrics": valid_metrics,
        "test_metrics": test_metrics,
        "valid_predictions": valid_predictions,
        "test_predictions": test_predictions,
        "test_probabilities": test_probs,
        "test_pred": test_pred,
    }


def _decision_to_probabilities(model, matrix):
    if hasattr(model, "predict_proba"):
        return _align_probabilities(model, model.predict_proba(matrix))
    scores = model.decision_function(matrix)
    if scores.ndim == 1:
        scores = np.vstack([-scores, scores]).T
    classes = list(model.classes_)
    aligned_scores = np.zeros((scores.shape[0], len(LABELS)))
    for idx, label in enumerate(LABELS):
        if label in classes:
            aligned_scores[:, idx] = scores[:, classes.index(label)]
    aligned_scores = aligned_scores - aligned_scores.max(axis=1, keepdims=True)
    exp_scores = np.exp(aligned_scores)
    return exp_scores / exp_scores.sum(axis=1, keepdims=True)


def _export_grid_common(exp_dir: Path, model_name: str, model, valid_df, test_df, x_valid, x_test, config, trials, logger):
    exp_dir.mkdir(parents=True, exist_ok=True)
    valid_pred = model.predict(x_valid)
    valid_probs = _decision_to_probabilities(model, x_valid)
    test_pred = model.predict(x_test)
    test_probs = _decision_to_probabilities(model, x_test)
    valid_metrics = compute_metrics(valid_df["target_label"], valid_pred, valid_probs)
    test_metrics = compute_metrics(test_df["target_label"], test_pred, test_probs)
    valid_predictions = _save_predictions(exp_dir / "valid_predictions.csv", valid_df, valid_pred, valid_probs)
    test_predictions = _save_predictions(exp_dir / "test_predictions.csv", test_df, test_pred, test_probs)
    confusion_df(test_df["target_label"], test_pred).to_csv(exp_dir / "confusion_matrix.csv")
    save_json(exp_dir / "metrics.json", {"validation": valid_metrics, "test": test_metrics})
    save_json(exp_dir / "config.json", {**config, "selected_model": model_name, "candidate_trials": trials})
    pd.DataFrame(trials).to_csv(exp_dir / "grid_search_results.csv", index=False)
    logger.info("Saved experiment %s metrics valid_macro_f1=%.4f test_macro_f1=%.4f", exp_dir.name, valid_metrics["macro_f1"], test_metrics["macro_f1"])
    return {
        "selected_model": model_name,
        "validation_metrics": valid_metrics,
        "test_metrics": test_metrics,
        "valid_predictions": valid_predictions,
        "test_predictions": test_predictions,
        "test_probabilities": test_probs,
        "test_pred": test_pred,
    }


def run_algorithm_1(splits, text_features, retrieval_features, output_dir: Path, logger):
    exp_dir = output_dir / "experiments" / "alg1_full_retrieval_metadata_fusion"
    transformer, meta_train = _metadata_transformer(splits["train"], include_start=True)
    meta_valid = _transform_metadata(transformer, splits["valid"], include_start=True)
    meta_test = _transform_metadata(transformer, splits["test"], include_start=True)
    retrieval_cols = ["neighbor_low_ratio", "neighbor_mid_ratio", "neighbor_high_ratio", "mean_similarity", "max_similarity"]
    x_train = hstack([text_features["combined"]["train"], meta_train, _numeric_matrix(retrieval_features["train"], retrieval_cols)]).tocsr()
    x_valid = hstack([text_features["combined"]["valid"], meta_valid, _numeric_matrix(retrieval_features["valid"], retrieval_cols)]).tocsr()
    x_test = hstack([text_features["combined"]["test"], meta_test, _numeric_matrix(retrieval_features["test"], retrieval_cols)]).tocsr()
    name, model, _, trials = _fit_candidates(x_train, splits["train"]["target_label"], x_valid, splits["valid"]["target_label"], logger)
    result = _export_common(exp_dir, name, model, splits["valid"], splits["test"], x_valid, x_test, {
        "algorithm": "Full Retrieval-Metadata Fusion",
        "uses_start_trl": True,
        "interpretation": "upper-bound",
        "features": ["TF-IDF word+char", "Program one-hot", "Primary TX one-hot", "Start TRL numeric", "retrieval features"],
        "best_model_selection": "validation macro_f1",
    }, trials, logger)
    if hasattr(model, "coef_"):
        importance = pd.DataFrame({"feature": [f"feature_{i}" for i in range(model.coef_.shape[1])], "importance": np.abs(model.coef_).mean(axis=0)})
        importance.sort_values("importance", ascending=False).head(200).to_csv(exp_dir / "feature_importance.csv", index=False)
    return result


def run_algorithm_2(splits, text_features, retrieval_features, pseudo_features, output_dir: Path, logger):
    exp_dir = output_dir / "experiments" / "alg2_no_start_pseudo_start_fusion"
    transformer, meta_train = _metadata_transformer(splits["train"], include_start=False)
    meta_valid = _transform_metadata(transformer, splits["valid"], include_start=False)
    meta_test = _transform_metadata(transformer, splits["test"], include_start=False)
    retrieval_cols = ["neighbor_low_ratio", "neighbor_mid_ratio", "neighbor_high_ratio", "mean_similarity", "max_similarity"]
    pseudo_cols = ["pseudo_start_trl", "pseudo_start_confidence"]
    x_train = hstack([text_features["combined"]["train"], meta_train, _numeric_matrix(retrieval_features["train"], retrieval_cols), _numeric_matrix(pseudo_features["train"], pseudo_cols)]).tocsr()
    x_valid = hstack([text_features["combined"]["valid"], meta_valid, _numeric_matrix(retrieval_features["valid"], retrieval_cols), _numeric_matrix(pseudo_features["valid"], pseudo_cols)]).tocsr()
    x_test = hstack([text_features["combined"]["test"], meta_test, _numeric_matrix(retrieval_features["test"], retrieval_cols), _numeric_matrix(pseudo_features["test"], pseudo_cols)]).tocsr()
    name, model, _, trials = _fit_candidates(x_train, splits["train"]["target_label"], x_valid, splits["valid"]["target_label"], logger)
    result = _export_common(exp_dir, name, model, splits["valid"], splits["test"], x_valid, x_test, {
        "algorithm": "No-Start Retrieval / Pseudo-Start Fusion",
        "uses_start_trl": False,
        "interpretation": "deployment-safe main model",
        "features": ["TF-IDF word+char", "Program one-hot", "Primary TX one-hot", "retrieval features", "pseudo_start_trl", "pseudo_start_confidence"],
        "best_model_selection": "validation macro_f1",
    }, trials, logger)
    pseudo_features["test"].to_csv(exp_dir / "pseudo_start_analysis.csv", index=False)
    return result


def _train_text_probability_model(splits, text_features):
    model = OneVsRestClassifier(LogisticRegression(max_iter=400, C=1.0, class_weight="balanced", solver="liblinear", random_state=42))
    model.fit(text_features["combined"]["train"], splits["train"]["target_label"])
    return model


def run_algorithm_3(splits, text_features, retrieval_features, pseudo_features, rubric_features, output_dir: Path, logger):
    exp_dir = output_dir / "experiments" / "alg3_rubric_guided_explainable_fusion"
    exp_dir.mkdir(parents=True, exist_ok=True)
    text_model = _train_text_probability_model(splits, text_features)
    transformer, meta_train = _metadata_transformer(splits["train"], include_start=False)
    meta_valid = _transform_metadata(transformer, splits["valid"], include_start=False)
    meta_test = _transform_metadata(transformer, splits["test"], include_start=False)

    retrieval_cols = ["neighbor_low_ratio", "neighbor_mid_ratio", "neighbor_high_ratio", "mean_similarity", "max_similarity"]
    pseudo_cols = ["pseudo_start_trl", "pseudo_start_confidence"]
    rubric_cols = [col for col in rubric_features["valid"].columns if col.endswith("_score")]
    train_prob = _align_probabilities(text_model, text_model.predict_proba(text_features["combined"]["train"]))
    valid_prob = _align_probabilities(text_model, text_model.predict_proba(text_features["combined"]["valid"]))
    test_prob = _align_probabilities(text_model, text_model.predict_proba(text_features["combined"]["test"]))
    x_train = hstack([csr_matrix(train_prob), meta_train, _numeric_matrix(retrieval_features["train"], retrieval_cols), _numeric_matrix(pseudo_features["train"], pseudo_cols), _numeric_matrix(rubric_features["train"], rubric_cols)]).tocsr()
    x_valid = hstack([csr_matrix(valid_prob), meta_valid, _numeric_matrix(retrieval_features["valid"], retrieval_cols), _numeric_matrix(pseudo_features["valid"], pseudo_cols), _numeric_matrix(rubric_features["valid"], rubric_cols)]).tocsr()
    x_test = hstack([csr_matrix(test_prob), meta_test, _numeric_matrix(retrieval_features["test"], retrieval_cols), _numeric_matrix(pseudo_features["test"], pseudo_cols), _numeric_matrix(rubric_features["test"], rubric_cols)]).tocsr()
    name, model, _, trials = _fit_candidates(x_train, splits["train"]["target_label"], x_valid, splits["valid"]["target_label"], logger, allow_svc=False)
    result = _export_common(exp_dir, name, model, splits["valid"], splits["test"], x_valid, x_test, {
        "algorithm": "Rubric-Guided Explainable Fusion",
        "uses_start_trl": False,
        "interpretation": "deployment-safe explainable model",
        "features": ["text model probabilities", "Program one-hot", "Primary TX one-hot", "retrieval features", "pseudo-start features", "rubric scores"],
        "best_model_selection": "validation macro_f1",
        "lightgbm": "optional TODO; not required for v0.1 reproducibility",
    }, trials, logger)

    explanations = []
    test_pred = result["test_pred"]
    test_probs = result["test_probabilities"]
    for idx, (_, row) in enumerate(splits["test"].reset_index(drop=True).iterrows()):
        rubric_row = rubric_features["test"].iloc[idx]
        retrieval_row = retrieval_features["test"].iloc[idx]
        predicted = test_pred[idx]
        if predicted == "High":
            reason = "High-TRL deployment or commercialization evidence was strong enough, and retrieval/model signals support a high maturity class."
        elif predicted == "Mid":
            reason = "Prototype, laboratory, or relevant-environment evidence was detected, but operational environment evidence was weak; therefore the project was classified as Mid."
        else:
            reason = "Evidence is mainly concept or early validation oriented, with limited prototype or deployment signals; therefore the project was classified as Low."
        explanations.append(
            {
                "project_id": str(row["Project ID"]),
                "project_title": row["Project Title"],
                "target_label": row["target_label"],
                "predicted_label": predicted,
                "confidence": float(test_probs[idx].max()),
                "rubric_scores": {col: float(rubric_row[col]) for col in rubric_cols},
                "retrieval_distribution": {
                    "low": float(retrieval_row["neighbor_low_ratio"]),
                    "mid": float(retrieval_row["neighbor_mid_ratio"]),
                    "high": float(retrieval_row["neighbor_high_ratio"]),
                },
                "top_evidence_sentences": rubric_row.get("top_evidence_sentences", ""),
                "missing_high_trl_reason": rubric_row.get("missing_high_trl_reason", ""),
                "final_reason": reason,
            }
        )
    with (exp_dir / "explanations.jsonl").open("w", encoding="utf-8") as handle:
        for item in explanations:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    pd.DataFrame(explanations[:200]).to_csv(exp_dir / "sample_explanations.csv", index=False)
    return {**result, "explanations": explanations}


def run_algorithm_4(splits, text_features, retrieval_features, pseudo_features, rubric_features, output_dir: Path, logger):
    exp_dir = output_dir / "experiments" / "alg4_gridsearched_tfidf_svc_retrieval_fusion"
    transformer, meta_train = _metadata_transformer(splits["train"], include_start=False)
    meta_valid = _transform_metadata(transformer, splits["valid"], include_start=False)
    meta_test = _transform_metadata(transformer, splits["test"], include_start=False)
    retrieval_cols = ["neighbor_low_ratio", "neighbor_mid_ratio", "neighbor_high_ratio", "mean_similarity", "max_similarity"]
    pseudo_cols = ["pseudo_start_trl", "pseudo_start_confidence"]
    rubric_cols = [col for col in rubric_features["valid"].columns if col.endswith("_score")]

    text_blocks = {
        "word": (
            text_features["word"]["train"],
            text_features["word"]["valid"],
            text_features["word"]["test"],
        ),
        "char": (
            text_features["char"]["train"],
            text_features["char"]["valid"],
            text_features["char"]["test"],
        ),
        "word_char": (
            text_features["combined"]["train"],
            text_features["combined"]["valid"],
            text_features["combined"]["test"],
        ),
    }
    feature_variants = [
        {"name": "text_meta_retrieval", "pseudo": False, "rubric": False},
        {"name": "text_meta_retrieval_pseudo", "pseudo": True, "rubric": False},
        {"name": "text_meta_retrieval_rubric", "pseudo": False, "rubric": True},
        {"name": "text_meta_retrieval_pseudo_rubric", "pseudo": True, "rubric": True},
    ]
    classifier_factories = [
        ("linear_svc_C0.5", lambda: LinearSVC(C=0.5, class_weight="balanced", random_state=42, max_iter=3000)),
        ("linear_svc_C1", lambda: LinearSVC(C=1.0, class_weight="balanced", random_state=42, max_iter=3000)),
        ("logistic_regression_C1", lambda: OneVsRestClassifier(LogisticRegression(max_iter=400, C=1.0, class_weight="balanced", solver="liblinear", random_state=42))),
        ("calibrated_linear_svc_C0.5", lambda: CalibratedClassifierCV(LinearSVC(C=0.5, class_weight="balanced", random_state=42, max_iter=3000), cv=3)),
    ]

    def build_matrix(split_name, text_matrix, meta_matrix, variant):
        blocks = [text_matrix, meta_matrix, _numeric_matrix(retrieval_features[split_name], retrieval_cols)]
        if variant["pseudo"]:
            blocks.append(_numeric_matrix(pseudo_features[split_name], pseudo_cols))
        if variant["rubric"]:
            blocks.append(_numeric_matrix(rubric_features[split_name], rubric_cols))
        matrix = hstack(blocks).tocsr()
        return Normalizer(copy=False).fit_transform(matrix)

    best = None
    trials = []
    for text_name, (x_text_train, x_text_valid, x_text_test) in text_blocks.items():
        for variant in feature_variants:
            x_train = build_matrix("train", x_text_train, meta_train, variant)
            x_valid = build_matrix("valid", x_text_valid, meta_valid, variant)
            for classifier_name, factory in classifier_factories:
                model_name = f"{text_name}__{variant['name']}__{classifier_name}"
                try:
                    model = factory()
                    model.fit(x_train, splits["train"]["target_label"])
                    pred = model.predict(x_valid)
                    probs = _decision_to_probabilities(model, x_valid)
                    metrics = compute_metrics(splits["valid"]["target_label"], pred, probs)
                    trial = {
                        "name": model_name,
                        "text_features": text_name,
                        "feature_variant": variant["name"],
                        "classifier": classifier_name,
                        "uses_pseudo_start": variant["pseudo"],
                        "uses_rubric_scores": variant["rubric"],
                        "validation_accuracy": metrics["accuracy"],
                        "validation_macro_f1": metrics["macro_f1"],
                        "validation_weighted_f1": metrics["weighted_f1"],
                        "validation_mae": metrics["mae"],
                    }
                    trials.append(trial)
                    logger.info("Alg4 candidate %s validation accuracy=%.4f macro_f1=%.4f", model_name, metrics["accuracy"], metrics["macro_f1"])
                    score = (metrics["accuracy"], metrics["macro_f1"])
                    if best is None or score > best["score"]:
                        best = {
                            "score": score,
                            "name": model_name,
                            "model": model,
                            "text_name": text_name,
                            "variant": variant,
                            "validation_metrics": metrics,
                        }
                except Exception as exc:
                    logger.exception("Alg4 candidate failed: %s", model_name)
                    trials.append({"name": model_name, "error": str(exc)})

    if best is None:
        raise RuntimeError("Algorithm 4 grid search produced no valid model.")

    x_train_text, x_valid_text, x_test_text = text_blocks[best["text_name"]]
    x_valid = build_matrix("valid", x_valid_text, meta_valid, best["variant"])
    x_test = build_matrix("test", x_test_text, meta_test, best["variant"])
    result = _export_grid_common(exp_dir, best["name"], best["model"], splits["valid"], splits["test"], x_valid, x_test, {
        "algorithm": "Grid-Searched TF-IDF Char/Word + LinearSVC Retrieval Fusion",
        "uses_start_trl": False,
        "interpretation": "deployment-safe performance-focused model",
        "target": "Start TRL 없이 accuracy 70% 이상 목표",
        "features": ["word-level TF-IDF", "char_wb-level TF-IDF", "Program one-hot", "Primary TX one-hot", "retrieval features", "optional pseudo_start_trl", "optional rubric_scores"],
        "classifiers": ["LinearSVC", "LogisticRegression", "CalibratedClassifierCV(LinearSVC)"],
        "best_model_selection": "validation accuracy primary, validation macro_f1 tie-breaker",
        "best_feature_variant": best["variant"]["name"],
        "best_text_features": best["text_name"],
    }, trials, logger)
    return result
