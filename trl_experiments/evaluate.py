from typing import Dict

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_recall_fscore_support,
)

from trl_experiments.config import LABELS, ORDINAL_MAP


def compute_metrics(y_true, y_pred, probabilities=None) -> Dict:
    metrics = {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "macro_f1": float(f1_score(y_true, y_pred, labels=LABELS, average="macro", zero_division=0)),
        "weighted_f1": float(f1_score(y_true, y_pred, labels=LABELS, average="weighted", zero_division=0)),
    }
    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, labels=LABELS, zero_division=0)
    for idx, label in enumerate(LABELS):
        key = label.lower()
        metrics[f"precision_{key}"] = float(precision[idx])
        metrics[f"recall_{key}"] = float(recall[idx])
        metrics[f"f1_{key}"] = float(f1[idx])

    y_true_ord = np.array([ORDINAL_MAP[x] for x in y_true])
    y_pred_ord = np.array([ORDINAL_MAP[x] for x in y_pred])
    metrics["mae"] = float(np.mean(np.abs(y_true_ord - y_pred_ord)))

    if probabilities is not None:
        try:
            sorted_labels = sorted(LABELS)
            sorted_probs = probabilities[:, [LABELS.index(label) for label in sorted_labels]]
            metrics["log_loss"] = float(log_loss(y_true, sorted_probs, labels=sorted_labels))
        except Exception:
            metrics["log_loss"] = None
        brier_values = []
        for idx, label in enumerate(LABELS):
            y_binary = np.array([1 if y == label else 0 for y in y_true])
            brier_values.append(brier_score_loss(y_binary, probabilities[:, idx]))
        metrics["brier_score"] = float(np.mean(brier_values))
        metrics["calibration_summary"] = {
            "mean_confidence": float(np.max(probabilities, axis=1).mean()),
            "mean_predicted_low": float(probabilities[:, 0].mean()),
            "mean_predicted_mid": float(probabilities[:, 1].mean()),
            "mean_predicted_high": float(probabilities[:, 2].mean()),
        }
    return metrics


def confusion_df(y_true, y_pred) -> pd.DataFrame:
    matrix = confusion_matrix(y_true, y_pred, labels=LABELS)
    return pd.DataFrame(matrix, index=[f"actual_{x}" for x in LABELS], columns=[f"pred_{x}" for x in LABELS])
