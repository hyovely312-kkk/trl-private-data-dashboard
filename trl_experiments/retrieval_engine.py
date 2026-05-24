from pathlib import Path
from typing import Dict

import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity

from trl_experiments.config import DEFAULT_TOP_K, LABELS


def generate_retrieval_features(splits: Dict, text_features: Dict, output_dir: Path, logger, top_k: int = DEFAULT_TOP_K):
    output_path = output_dir / "retrieval"
    output_path.mkdir(parents=True, exist_ok=True)
    train_matrix = text_features["retrieval_word"]["train"]
    train_df = splits["train"].reset_index(drop=True)
    train_labels = train_df["target_label"].to_numpy()
    train_ids = train_df["Project ID"].astype(str).to_numpy()

    result = {}
    for split in ["train", "valid", "test"]:
        query_matrix = text_features["retrieval_word"][split]
        query_df = splits[split].reset_index(drop=True)
        rows = []
        for start in range(0, query_matrix.shape[0], 512):
            sims = cosine_similarity(query_matrix[start:start + 512], train_matrix)
            for offset, sim_row in enumerate(sims):
                row_idx = start + offset
                if split == "train":
                    sim_row[row_idx] = -1.0
                top_idx = np.argpartition(-sim_row, min(top_k, len(sim_row) - 1))[:top_k]
                top_idx = top_idx[np.argsort(-sim_row[top_idx])]
                top_labels = train_labels[top_idx].tolist()
                counts = {label: top_labels.count(label) / top_k for label in LABELS}
                rows.append(
                    {
                        "project_id": str(query_df.loc[row_idx, "Project ID"]),
                        "target_label": query_df.loc[row_idx, "target_label"],
                        "top_k_project_ids": "|".join(train_ids[top_idx].tolist()),
                        "top_k_similarity_scores": "|".join(f"{float(sim_row[i]):.6f}" for i in top_idx),
                        "top_k_labels": "|".join(top_labels),
                        "neighbor_low_ratio": counts["Low"],
                        "neighbor_mid_ratio": counts["Mid"],
                        "neighbor_high_ratio": counts["High"],
                        "mean_similarity": float(np.mean(sim_row[top_idx])),
                        "max_similarity": float(np.max(sim_row[top_idx])),
                        "retrieval_text_policy": "Description-centered TF-IDF; title/benefits are auxiliary context.",
                    }
                )
        features_df = pd.DataFrame(rows)
        if split in ["valid", "test"]:
            features_df.to_csv(output_path / f"retrieval_features_{split}.csv", index=False)
        result[split] = features_df
        logger.info("Retrieval features generated split=%s shape=%s", split, features_df.shape)
    return result
