import csv
from pathlib import Path
from typing import Dict, List

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from modules.preprocessing import combine_fields


RETRIEVAL_FIELDS = [
    "project_title",
    "description",
    "objective",
    "core_technology",
    "application_area",
    "validation_text",
]


def _load_projects(path: Path) -> List[Dict]:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def run_retrieval_agent(project: Dict, sample_path: Path, top_n: int = 5) -> Dict:
    samples = _load_projects(sample_path)
    query_text = combine_fields(project, RETRIEVAL_FIELDS)
    corpus = [
        " ".join([row["title"], row["description"], row["objective"], row["validation_text"]])
        for row in samples
    ]
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), analyzer="word", max_features=5000, lowercase=True)
    matrix = vectorizer.fit_transform([query_text] + corpus)
    similarities = cosine_similarity(matrix[0:1], matrix[1:]).flatten()

    ranked_indexes = similarities.argsort()[::-1][:top_n]
    top_k = []
    counts = {"Low": 0, "Mid": 0, "High": 0}
    for index in ranked_indexes:
        row = samples[int(index)]
        label = row["end_trl_class"]
        counts[label] += 1
        top_k.append(
            {
                "project_id": row["project_id"],
                "title": row["title"],
                "similarity": round(float(similarities[index]), 4),
                "trl_class": label,
            }
        )

    denom = max(len(top_k), 1)
    distribution = {label: round(counts[label] / denom, 4) for label in counts}
    mean_similarity = round(sum(item["similarity"] for item in top_k) / denom, 4)

    return {
        "agent_name": "Retrieval Similarity Agent",
        "input_fields": RETRIEVAL_FIELDS,
        "embedding_method": "TF-IDF word n-gram",
        "calculation": "sim(q, d_i) = q dot d_i / (||q|| * ||d_i||)",
        "query_vector_shape": [1, int(matrix.shape[1])],
        "top_k": top_k,
        "neighbor_distribution": distribution,
        "mean_similarity": mean_similarity,
    }
