from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from trl_experiments.config import REQUIRED_CANONICAL_COLUMNS, SHEET_FALLBACKS


def _clean_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.replace(r"\s+", " ", regex=True).str.strip()


def _choose_sheet(input_path: Path, requested_sheet: str, logger) -> str:
    excel = pd.ExcelFile(input_path)
    if requested_sheet in excel.sheet_names:
        return requested_sheet
    for sheet in SHEET_FALLBACKS:
        if sheet in excel.sheet_names:
            logger.info("Requested sheet '%s' not found. Using fallback sheet '%s'.", requested_sheet, sheet)
            return sheet
    raise ValueError(f"Sheet '{requested_sheet}' not found. Available sheets: {excel.sheet_names}")


def _canonicalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    renamed = df.copy()
    column_map = {}
    if "Label_Start_TRL" in renamed.columns and "Start TRL" not in renamed.columns:
        column_map["Label_Start_TRL"] = "Start TRL"
    if "Label_End_TRL" in renamed.columns and "End TRL" not in renamed.columns:
        column_map["Label_End_TRL"] = "End TRL"
    if "TRL_Delta" in renamed.columns and "TRL Delta" not in renamed.columns:
        column_map["TRL_Delta"] = "TRL Delta"
    renamed = renamed.rename(columns=column_map)

    if "Description" not in renamed.columns and "Model Text" in renamed.columns:
        renamed["Description"] = renamed["Model Text"]
    if "Benefits" not in renamed.columns and "Optional Text With Benefits" in renamed.columns:
        renamed["Benefits"] = renamed["Optional Text With Benefits"]
    if "Benefits" not in renamed.columns:
        renamed["Benefits"] = ""
    if "TRL Delta" not in renamed.columns and {"Start TRL", "End TRL"}.issubset(renamed.columns):
        renamed["TRL Delta"] = pd.to_numeric(renamed["End TRL"], errors="coerce") - pd.to_numeric(renamed["Start TRL"], errors="coerce")
    return renamed


def trl_to_label(value) -> str:
    value = pd.to_numeric(value, errors="coerce")
    if pd.isna(value):
        return np.nan
    if value <= 3:
        return "Low"
    if value <= 6:
        return "Mid"
    return "High"


def load_projects(input_path: Path, sheet: str, logger) -> Tuple[pd.DataFrame, Dict]:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")
    actual_sheet = _choose_sheet(input_path, sheet, logger)
    raw = pd.read_excel(input_path, sheet_name=actual_sheet)
    df = _canonicalize_columns(raw)
    missing_columns = [col for col in REQUIRED_CANONICAL_COLUMNS if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns after canonicalization: {missing_columns}")

    profile = {
        "input_path": str(input_path),
        "requested_sheet": sheet,
        "actual_sheet": actual_sheet,
        "raw_shape": list(raw.shape),
        "canonical_shape_before_filter": list(df.shape),
        "columns": list(df.columns),
        "missing_by_column": {col: int(df[col].isna().sum()) for col in df.columns},
    }

    for col in ["Project Title", "Description", "Benefits", "Program", "Primary TX"]:
        df[col] = df[col].fillna("").astype(str)
    df["Start TRL"] = pd.to_numeric(df["Start TRL"], errors="coerce")
    df["End TRL"] = pd.to_numeric(df["End TRL"], errors="coerce")
    df["target_label"] = df["End TRL"].apply(trl_to_label)
    title = _clean_text(df["Project Title"])
    description = _clean_text(df["Description"])
    benefits = _clean_text(df["Benefits"])
    df["description_primary_text"] = description
    df["title_aux_text"] = title
    df["benefits_aux_text"] = benefits
    df["retrieval_text"] = (
        description
        + " "
        + description
        + " title_context "
        + title
        + " benefits_context "
        + benefits
    ).str.replace(r"\s+", " ", regex=True).str.strip()
    df["classifier_text"] = (
        description
        + " "
        + description
        + " title_context "
        + title
        + " benefits_context "
        + benefits
    ).str.replace(r"\s+", " ", regex=True).str.strip()
    df["evidence_text"] = (
        description
        + " "
        + description
        + " commercialization_context "
        + benefits
    ).str.replace(r"\s+", " ", regex=True).str.strip()
    df["full_text"] = df["classifier_text"]

    before = len(df)
    df = df.dropna(subset=["End TRL", "target_label"]).copy()
    df = df[df["description_primary_text"].str.len() > 0].copy()
    profile["n_dropped_invalid_label_or_text"] = int(before - len(df))
    profile["final_shape"] = list(df.shape)
    profile["label_distribution"] = df["target_label"].value_counts().reindex(["Low", "Mid", "High"], fill_value=0).to_dict()
    profile["text_field_policy"] = {
        "primary_trl_text": "Description",
        "retrieval_text": "Description duplicated as primary signal + Project Title/Benefits as auxiliary context.",
        "classifier_text": "Description duplicated as primary signal + Project Title/Benefits as auxiliary context.",
        "pseudo_start_text": "Description only.",
        "rubric_evidence_text": "Description duplicated + Benefits as commercialization/operational auxiliary evidence.",
        "title_policy": "Project Title is auxiliary only and never used alone for TRL judgment.",
        "benefits_policy": "Benefits is auxiliary for commercialization, operational use, deployment, and impact; it cannot determine TRL alone.",
    }
    logger.info("Loaded data shape=%s final_shape=%s labels=%s", raw.shape, df.shape, profile["label_distribution"])
    return df.reset_index(drop=True), profile


def stratified_split(df: pd.DataFrame, random_state: int, logger):
    train_df, temp_df = train_test_split(
        df,
        test_size=0.30,
        stratify=df["target_label"],
        random_state=random_state,
    )
    valid_df, test_df = train_test_split(
        temp_df,
        test_size=0.50,
        stratify=temp_df["target_label"],
        random_state=random_state,
    )
    splits = {"train": train_df.reset_index(drop=True), "valid": valid_df.reset_index(drop=True), "test": test_df.reset_index(drop=True)}
    distribution = {}
    for name, split_df in splits.items():
        distribution[name] = {
            "n": int(len(split_df)),
            "label_distribution": split_df["target_label"].value_counts().reindex(["Low", "Mid", "High"], fill_value=0).to_dict(),
        }
    logger.info("Split distribution: %s", distribution)
    return splits, distribution
