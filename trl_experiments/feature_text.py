from pathlib import Path
from typing import Dict

from scipy.sparse import hstack
from sklearn.feature_extraction.text import TfidfVectorizer

from trl_experiments.config import DEFAULT_CHAR_MAX_FEATURES, DEFAULT_WORD_MAX_FEATURES
from trl_experiments.logger import save_json


def build_text_features(splits: Dict, output_dir: Path, log_dir: Path, logger):
    word_vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        min_df=2,
        max_features=DEFAULT_WORD_MAX_FEATURES,
        sublinear_tf=True,
        lowercase=True,
    )
    char_vectorizer = TfidfVectorizer(
        analyzer="char_wb",
        ngram_range=(3, 5),
        min_df=2,
        max_features=DEFAULT_CHAR_MAX_FEATURES,
        sublinear_tf=True,
        lowercase=True,
    )
    retrieval_vectorizer = TfidfVectorizer(
        analyzer="word",
        ngram_range=(1, 2),
        min_df=2,
        max_features=DEFAULT_WORD_MAX_FEATURES,
        sublinear_tf=True,
        lowercase=True,
    )
    train_text = splits["train"]["classifier_text"]
    xw_train = word_vectorizer.fit_transform(train_text)
    xc_train = char_vectorizer.fit_transform(train_text)
    xr_train = retrieval_vectorizer.fit_transform(splits["train"]["retrieval_text"])

    features = {
        "word": {"train": xw_train},
        "char": {"train": xc_train},
        "retrieval_word": {"train": xr_train},
        "combined": {"train": hstack([xw_train, xc_train]).tocsr()},
        "word_vectorizer": word_vectorizer,
        "char_vectorizer": char_vectorizer,
        "retrieval_vectorizer": retrieval_vectorizer,
    }
    for split in ["valid", "test"]:
        xw = word_vectorizer.transform(splits[split]["classifier_text"])
        xc = char_vectorizer.transform(splits[split]["classifier_text"])
        xr = retrieval_vectorizer.transform(splits[split]["retrieval_text"])
        features["word"][split] = xw
        features["char"][split] = xc
        features["retrieval_word"][split] = xr
        features["combined"][split] = hstack([xw, xc]).tocsr()

    config = {
        "word_tfidf": {
            "analyzer": "word",
            "ngram_range": [1, 2],
            "min_df": 2,
            "max_features": DEFAULT_WORD_MAX_FEATURES,
            "actual_features": len(word_vectorizer.get_feature_names_out()),
        },
        "char_tfidf": {
            "analyzer": "char_wb",
            "ngram_range": [3, 5],
            "min_df": 2,
            "max_features": DEFAULT_CHAR_MAX_FEATURES,
            "actual_features": len(char_vectorizer.get_feature_names_out()),
        },
        "retrieval_tfidf": {
            "analyzer": "word",
            "ngram_range": [1, 2],
            "min_df": 2,
            "max_features": DEFAULT_WORD_MAX_FEATURES,
            "actual_features": len(retrieval_vectorizer.get_feature_names_out()),
        },
        "scibert": {
            "enabled": False,
            "status": "TODO: optional SciBERT embedding can be added when transformer runtime/model cache is available.",
        },
        "text_field_policy": {
            "classifier_text": "Description-centered: Description is duplicated to dominate TF-IDF; Project Title and Benefits are auxiliary context only.",
            "retrieval_text": "Separate Description-centered TF-IDF vectorizer; Project Title and Benefits are auxiliary context only.",
            "start_trl": "excluded from deployment-safe text features",
        },
    }
    shapes = {
        family: {split: list(matrix.shape) for split, matrix in values.items()}
        for family, values in features.items()
        if family in ["word", "char", "retrieval_word", "combined"]
    }
    save_json(output_dir / "features" / "vectorizer_config.json", config)
    save_json(output_dir / "features" / "feature_shape_log.json", shapes)
    save_json(log_dir / "feature_shape_log.json", shapes)
    logger.info("Feature shapes: %s", shapes)
    return features, config, shapes
