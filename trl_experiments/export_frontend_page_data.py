import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "frontend" / "assets" / "data"
OUTPUTS = ROOT / "outputs"
AGENT_OUTPUTS = OUTPUTS / "agents"
CONFIGS = ROOT / "configs"
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


def read_dictionary():
    return json.loads((CONFIGS / "korean_reasoning_dictionary.json").read_text(encoding="utf-8"))


def korean_label(label):
    return {"Low": "Low (TRL 1-3)", "Mid": "Mid (TRL 4-6)", "High": "High (TRL 7-9)"}.get(str(label), str(label))


def safe_float(value, default=0.0):
    try:
        if pd.isna(value):
            return default
        return float(value)
    except Exception:
        return default


def clean_json(value):
    if isinstance(value, dict):
        return {key: clean_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean_json(item) for item in value]
    if pd.isna(value) if not isinstance(value, (list, dict, tuple, set)) else False:
        return None
    return value


def split_terms(value, limit=8):
    terms = []
    for chunk in str(value or "").replace("|", ";").split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" in chunk:
            chunk = chunk.split(":", 1)[-1].strip()
        terms.append(chunk)
    return terms[:limit]


def top_keywords_from_text(text, dictionary, limit=8):
    lower = str(text or "").lower()
    mapped = []
    for eng, kor in dictionary.get("term_mapping", {}).items():
      if eng.lower() in lower and kor not in mapped:
          mapped.append(kor)
    if mapped:
        return mapped[:limit]
    tokens = [token.strip(".,;:()[]{}").lower() for token in lower.split()]
    stop = {"the", "and", "for", "with", "from", "that", "this", "will", "are", "was", "were", "into", "using", "their", "have", "has"}
    freq = {}
    for token in tokens:
        if len(token) < 5 or token in stop:
            continue
        freq[token] = freq.get(token, 0) + 1
    return [key for key, _ in sorted(freq.items(), key=lambda item: item[1], reverse=True)[:limit]]


def rubric_korean_scores(row):
    return {
        "원리검증점수": round(safe_float(row.get("principle_score")), 4),
        "개념검증점수": round(safe_float(row.get("concept_score")), 4),
        "실험실검증점수": round(safe_float(row.get("lab_validation_score")), 4),
        "시제품점수": round(safe_float(row.get("prototype_score")), 4),
        "유사환경실증점수": round(safe_float(row.get("relevant_environment_score")), 4),
        "실제환경검증점수": round(safe_float(row.get("operational_environment_score")), 4),
        "상용화점수": round(safe_float(row.get("commercialization_score")), 4),
    }


def strongest_rubric(scores):
    return sorted(scores.items(), key=lambda item: item[1], reverse=True)[:3]


def reason_from_trace(predicted, confidence, rubric_scores, retrieval, pseudo):
    strong = [name for name, score in strongest_rubric(rubric_scores) if score > 0]
    weak_high = []
    if rubric_scores.get("실제환경검증점수", 0) < 0.15:
        weak_high.append("실제 운영환경 검증 evidence 부족")
    if rubric_scores.get("상용화점수", 0) < 0.15:
        weak_high.append("상용 적용 evidence 부족")
    mid_ratio = safe_float(retrieval.get("neighbor_mid_ratio", retrieval.get("Mid비율")))
    high_ratio = safe_float(retrieval.get("neighbor_high_ratio", retrieval.get("High비율")))
    low_ratio = safe_float(retrieval.get("neighbor_low_ratio", retrieval.get("Low비율")))
    retrieval_note = f"유사 과제 분포는 Low {low_ratio:.0%}, Mid {mid_ratio:.0%}, High {high_ratio:.0%}입니다."
    if predicted == "High":
        return f"최종 판정은 High입니다. {', '.join(strong) or '상위 TRL 근거'}가 확인되었고, {retrieval_note} 모델 신뢰도는 {confidence:.2f}입니다."
    if predicted == "Low":
        return f"최종 판정은 Low입니다. 시제품, 실험실 검증, 운영환경 근거가 충분히 강하지 않으며, {retrieval_note} 모델 신뢰도는 {confidence:.2f}입니다."
    missing = "; ".join(weak_high) if weak_high else "상위 TRL 근거가 상대적으로 제한적"
    return f"최종 판정은 Mid입니다. {', '.join(strong) or '중간 단계 근거'}가 확인되었으나 {missing}으로 인해 TRL 4~6 수준으로 판단됩니다. {retrieval_note}"


def judge_conflict(predicted, retrieval, rubric_scores):
    ratios = {
        "Low": safe_float(retrieval.get("neighbor_low_ratio", retrieval.get("Low비율"))),
        "Mid": safe_float(retrieval.get("neighbor_mid_ratio", retrieval.get("Mid비율"))),
        "High": safe_float(retrieval.get("neighbor_high_ratio", retrieval.get("High비율"))),
    }
    retrieval_label = max(ratios, key=ratios.get)
    high_evidence = max(rubric_scores.get("실제환경검증점수", 0), rubric_scores.get("상용화점수", 0), rubric_scores.get("유사환경실증점수", 0))
    rubric_label = "High" if high_evidence >= 0.45 else "Mid" if max(rubric_scores.values()) >= 0.2 else "Low"
    conflict = len({retrieval_label, rubric_label, predicted}) > 1
    if conflict and retrieval_label == "High" and rubric_label != "High":
        reason = "유사 과제는 High 비율이 높으나 실제환경 검증 또는 상용 적용 evidence가 부족함"
    elif conflict:
        reason = f"retrieval 기반 판단({retrieval_label})과 rubric 기반 판단({rubric_label})이 서로 다름"
    else:
        reason = "retrieval, rubric, fusion 판단이 큰 충돌 없이 일관됨"
    return {
        "충돌여부": conflict,
        "retrieval기반판단": retrieval_label,
        "rubric기반판단": rubric_label,
        "fusion예측": predicted,
        "충돌사유": reason,
        "최종판정": predicted,
    }


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


def build_reasoning_traces(raw):
    AGENT_OUTPUTS.mkdir(parents=True, exist_ok=True)
    dictionary = read_dictionary()
    retrieval = pd.read_csv(OUTPUTS / "retrieval" / "retrieval_features_test.csv")
    pseudo = pd.read_csv(OUTPUTS / "pseudo_start" / "pseudo_start_test.csv")
    rubric = pd.read_csv(OUTPUTS / "rubric" / "rubric_features_test.csv")
    alg4 = pd.read_csv(ALG_DIRS["alg4_gridsearched_svc_retrieval"] / "test_predictions.csv")
    alg4["project_id"] = alg4["project_id"].astype(str)
    retrieval["project_id"] = retrieval["project_id"].astype(str)
    pseudo["project_id"] = pseudo["project_id"].astype(str)
    rubric["project_id"] = rubric["project_id"].astype(str)
    raw_keep = raw.copy()
    raw_keep["project_id"] = raw_keep["project_id"].astype(str)
    df = (
        alg4.merge(raw_keep, on="project_id", how="left", suffixes=("", "_raw"))
        .merge(retrieval, on=["project_id", "target_label"], how="left")
        .merge(pseudo, on=["project_id", "target_label"], how="left")
        .merge(rubric, on=["project_id", "target_label"], how="left")
    )

    traces = []
    embedding_rows = []
    rubric_rows = []
    retrieval_rows = []
    pseudo_rows = []
    fusion_rows = []
    judge_rows = []
    report_rows = []

    for _, row in df.iterrows():
        project_id = str(row["project_id"])
        description = row.get("Description", "")
        benefits = row.get("Benefits", "")
        predicted = str(row.get("predicted_label", ""))
        confidence = safe_float(row.get("confidence"))
        rubric_scores = rubric_korean_scores(row)
        evidence_sentences = [sentence.strip() for sentence in str(row.get("top_evidence_sentences") or "").split("|") if sentence.strip()][:5]
        retrieval_agent = {
            "계산식": "sim(q,d)=q·d / ||q|| ||d||",
            "기준텍스트": "Description 중심 TF-IDF; Title/Benefits는 보조 context",
            "top_k_project_ids": split_terms(row.get("top_k_project_ids"), 10),
            "유사도점수": [round(safe_float(x), 4) for x in split_terms(row.get("top_k_similarity_scores"), 10)],
            "top_k_labels": split_terms(row.get("top_k_labels"), 10),
            "Low비율": round(safe_float(row.get("neighbor_low_ratio")), 4),
            "Mid비율": round(safe_float(row.get("neighbor_mid_ratio")), 4),
            "High비율": round(safe_float(row.get("neighbor_high_ratio")), 4),
            "평균유사도": round(safe_float(row.get("mean_similarity")), 4),
            "최대유사도": round(safe_float(row.get("max_similarity")), 4),
        }
        pseudo_terms = [dictionary.get("term_mapping", {}).get(term, term) for term in split_terms(row.get("matched_keywords"))]
        pseudo_agent = {
            "추정StartTRL": int(safe_float(row.get("pseudo_start_trl"))),
            "추정버킷": row.get("pseudo_start_bucket", ""),
            "신뢰도": round(safe_float(row.get("pseudo_start_confidence")), 4),
            "근거키워드": pseudo_terms,
            "추정사유": f"Start TRL을 직접 사용하지 않고 Description maturity 표현을 근거로 {int(safe_float(row.get('pseudo_start_trl')))} 수준으로 추정함",
        }
        fusion_agent = {
            "모델": "Algorithm 4. Grid-Searched TF-IDF Char/Word + LinearSVC Retrieval Fusion",
            "StartTRL사용여부": False,
            "Low확률": round(safe_float(row.get("probability_low")), 4),
            "Mid확률": round(safe_float(row.get("probability_mid")), 4),
            "High확률": round(safe_float(row.get("probability_high")), 4),
            "신뢰도": round(confidence, 4),
            "최종예측": predicted,
            "예측TRL범위": korean_label(predicted),
        }
        judge_agent = judge_conflict(predicted, retrieval_agent, rubric_scores)
        report_agent = {
            "최종설명": reason_from_trace(predicted, confidence, rubric_scores, retrieval_agent, pseudo_agent),
            "판정근거": [f"{name}: {score:.2f}" for name, score in strongest_rubric(rubric_scores) if score > 0],
            "판정보류요소": [
                text for text, score in [
                    ("실제 운영환경 검증 evidence 부족", rubric_scores.get("실제환경검증점수", 0)),
                    ("상용 적용 evidence 부족", rubric_scores.get("상용화점수", 0)),
                    ("현장/유사환경 실증 evidence 부족", rubric_scores.get("유사환경실증점수", 0)),
                ] if score < 0.15
            ],
            "추가필요사항": ["현장 실증 수행", "실제 운영환경 검증 데이터 확보", "상용 적용 또는 운영 활용 근거 보강"],
        }
        trace = {
            "project_id": project_id,
            "project_title": row.get("Project Title", ""),
            "target_label": row.get("target_label", ""),
            "predicted_label": predicted,
            "confidence": round(confidence, 4),
            "data_cleaning_agent": {
                "입력컬럼": ["Project ID", "Project Title", "Program", "Primary TX", "Description", "Benefits", "Start TRL", "End TRL", "TRL Delta"],
                "결측처리": "텍스트 결측은 빈 문자열로 처리하고 End TRL 기준 target_label 생성",
                "target_label": row.get("target_label", ""),
                "StartTRL정책": "메인 reasoning trace에서는 사용하지 않음",
                "Description길이": len(str(description or "")),
            },
            "text_embedding_agent": {
                "embedding_type": "tfidf_char_word",
                "primary_text_field": "Description",
                "auxiliary_fields": ["Project Title", "Benefits", "Program", "Primary TX"],
                "top_keywords": top_keywords_from_text(f"{description} {benefits}", dictionary),
                "text_vector_shape": "grid-selected TF-IDF sparse vector",
            },
            "rubric_agent": {
                **rubric_scores,
                "근거문장": evidence_sentences,
                "부족근거": row.get("missing_high_trl_reason") or "상위 TRL evidence가 명시적으로 충분하지 않음",
            },
            "retrieval_agent": retrieval_agent,
            "pseudo_start_agent": pseudo_agent,
            "fusion_agent": fusion_agent,
            "judge_agent": judge_agent,
            "report_agent": report_agent,
        }
        traces.append(trace)
        embedding_rows.append({"project_id": project_id, **trace["text_embedding_agent"]})
        rubric_rows.append({"project_id": project_id, **trace["rubric_agent"]})
        retrieval_rows.append({"project_id": project_id, **retrieval_agent})
        pseudo_rows.append({"project_id": project_id, **pseudo_agent})
        fusion_rows.append({"project_id": project_id, **fusion_agent})
        judge_rows.append({"project_id": project_id, **judge_agent})
        report_rows.append({"project_id": project_id, **report_agent})

    def write_jsonl(path, rows):
        with path.open("w", encoding="utf-8") as f:
            for item in rows:
                f.write(json.dumps(clean_json(item), ensure_ascii=False, allow_nan=False) + "\n")

    write_jsonl(AGENT_OUTPUTS / "reasoning_traces.jsonl", traces)
    write_jsonl(DATA_DIR / "kotrl_x_reasoning_traces.jsonl", traces)
    write_jsonl(AGENT_OUTPUTS / "embedding_agent_outputs.jsonl", embedding_rows)
    write_jsonl(AGENT_OUTPUTS / "rubric_agent_outputs.jsonl", rubric_rows)
    write_jsonl(AGENT_OUTPUTS / "retrieval_agent_outputs.jsonl", retrieval_rows)
    write_jsonl(AGENT_OUTPUTS / "pseudo_start_agent_outputs.jsonl", pseudo_rows)
    write_jsonl(AGENT_OUTPUTS / "fusion_agent_outputs.jsonl", fusion_rows)
    write_jsonl(AGENT_OUTPUTS / "judge_agent_outputs.jsonl", judge_rows)
    write_jsonl(AGENT_OUTPUTS / "report_agent_outputs.jsonl", report_rows)

    summary_rows = []
    for trace in traces:
        summary_rows.append({
            "project_id": trace["project_id"],
            "target_label": trace["target_label"],
            "predicted_label": trace["predicted_label"],
            "confidence": trace["confidence"],
            "judge_conflict": trace["judge_agent"]["충돌여부"],
            "retrieval_judgment": trace["judge_agent"]["retrieval기반판단"],
            "rubric_judgment": trace["judge_agent"]["rubric기반판단"],
            "final_reason": trace["report_agent"]["최종설명"],
        })
    pd.DataFrame(summary_rows).to_csv(DATA_DIR / "kotrl_x_reasoning_trace_index.csv", index=False)
    pd.DataFrame(summary_rows).to_csv(AGENT_OUTPUTS / "reasoning_trace_index.csv", index=False)


def export_architecture():
    architectures = {
        "kotrl_x_multi_agent_reasoning": {
            "purpose": "KoTRL-X main architecture. Start TRL 없이 Description 중심 evidence, retrieval, pseudo-start, fusion, judge, report trace를 생성한다.",
            "uses_start_trl": False,
            "flow": [
                "Raw Excel 데이터",
                "데이터 정제 에이전트: 컬럼 검증, 결측 처리, End TRL label 생성",
                "텍스트 임베딩 에이전트: Description 중심 TF-IDF word/char embedding",
                "TRL 근거 분석 에이전트: 한글 evidence dictionary 기반 점수화",
                "유사 과제 검색 에이전트: cosine similarity와 top-k label 분포",
                "Pseudo-Start 추정 에이전트: Start TRL 없이 maturity 표현 추정",
                "Fusion 예측 에이전트: deployment-safe Alg4 확률 결합",
                "판정 검증 에이전트: retrieval/rubric/fusion 충돌 분석",
                "설명 생성 에이전트: 한글 최종 판정 근거와 추가 필요 단계 생성",
            ],
        },
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
    dictionary = read_dictionary()
    rows = []
    for category, info in dictionary["evidence_categories"].items():
        rows.append([category, "; ".join(info["keywords"]), info["reasoning_role"], info["mapped_trl"]])
    pd.DataFrame(rows, columns=["category", "keywords", "purpose", "mapped_trl_range"]).to_csv(DATA_DIR / "rules_analysis_rows.csv", index=False)
    (DATA_DIR / "korean_reasoning_dictionary.json").write_text(json.dumps(dictionary, ensure_ascii=False, indent=2), encoding="utf-8")


def export_paper_artifacts():
    dictionary = read_dictionary()
    leaderboard = pd.read_csv(OUTPUTS / "dashboard" / "model_leaderboard.csv")
    retrieval = pd.read_csv(OUTPUTS / "dashboard" / "retrieval_examples.csv")
    rubric = pd.read_csv(OUTPUTS / "dashboard" / "rubric_score_distribution.csv")
    pseudo = pd.read_csv(OUTPUTS / "dashboard" / "pseudo_start_distribution.csv")
    trace_index = pd.read_csv(DATA_DIR / "kotrl_x_reasoning_trace_index.csv")
    artifacts = {
        "system_name": "KoTRL-X",
        "agent_input_output_table": dictionary["agent_roles"],
        "agent_calculation_table": {
            "텍스트 임베딩 에이전트": "Description 중심 TF-IDF word/char sparse vector 생성",
            "TRL 근거 분석 에이전트": "한글 evidence dictionary keyword match 기반 category score",
            "유사 과제 검색 에이전트": "cosine similarity top-k 및 Low/Mid/High neighbor distribution",
            "Pseudo-Start 추정 에이전트": "Start TRL 없이 maturity keyword 최고 score를 pseudo TRL로 mapping",
            "Fusion 예측 에이전트": "validation grid search로 선택된 deployment-safe classifier 확률 출력",
            "Judge Agent": "retrieval/rubric/fusion label 간 불일치 여부와 조정 사유 산출",
            "Report Agent": "최종 판정 근거, 보류 요소, 추가 필요 단계를 한글 자연어로 생성",
        },
        "reasoning_trace_examples": trace_index.head(10).to_dict(orient="records"),
        "confusion_case_examples": trace_index[trace_index["judge_conflict"] == True].head(10).to_dict(orient="records"),
        "feature_ablation_table": leaderboard.to_dict(orient="records"),
        "retrieval_case_table": retrieval.head(20).to_dict(orient="records"),
        "rubric_evidence_case_table": rubric.head(20).to_dict(orient="records"),
        "pseudo_start_case_table": pseudo.head(20).to_dict(orient="records"),
    }
    for path in [OUTPUTS / "dashboard" / "paper_artifacts.json", DATA_DIR / "paper_artifacts.json"]:
        path.write_text(json.dumps(clean_json(artifacts), ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")


def main():
    raw = load_raw_with_splits()
    export_raw_dataset_rows(raw)
    project_rows = export_project_rows(raw)
    export_event_rows(project_rows)
    export_agent_logs()
    build_reasoning_traces(raw)
    export_architecture()
    export_rules_rows()
    export_paper_artifacts()
    print(f"Exported page data files to {DATA_DIR}")


if __name__ == "__main__":
    main()
