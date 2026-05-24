const algorithmInfo = {
  alg1_full_fusion: {
    title: "Alg1. Full Retrieval-Metadata Fusion",
    subtitle: "Start TRL을 포함한 upper-bound 실험입니다.",
    prefix: "alg1_full_fusion",
    role: "성능 상한선 확인",
    why: "Start TRL numeric feature가 포함되어 과제의 초기 성숙도 정보를 직접 참조합니다. 따라서 높은 성능은 실제 신규 과제 deployment 성능이 아니라 upper-bound로 해석해야 합니다.",
  },
  alg2_no_start_pseudo_start: {
    title: "Alg2. No-Start Retrieval / Pseudo-Start Fusion",
    subtitle: "Start TRL 없이 Description maturity 표현을 pseudo-start로 추정합니다.",
    prefix: "alg2_no_start_pseudo_start",
    role: "실제 신규 과제 평가용 main 후보",
    why: "Description 중심 retrieval 분포와 pseudo-start TRL을 결합합니다. Target은 평가용으로만 비교되며 feature에는 들어가지 않습니다.",
  },
  alg3_rubric_explainable: {
    title: "Alg3. Rubric-Guided Explainable Fusion",
    subtitle: "Rubric evidence score와 자연어 설명을 생성하는 설명가능 모델입니다.",
    prefix: "alg3_rubric_explainable",
    role: "설명가능성 확보",
    why: "Description 문장을 evidence category로 나누고 실험실 검증, 시제품, 유사환경, 실제환경, 상용화 점수를 결합합니다. 결과는 근거문장과 부족 evidence로 설명됩니다.",
  },
  alg4_gridsearched_svc_retrieval: {
    title: "Alg4. Grid-Searched TF-IDF Char/Word + LinearSVC Retrieval Fusion",
    subtitle: "Start TRL 없이 validation grid search로 선택된 deployment-safe 성능 모델입니다.",
    prefix: "alg4_gridsearched_svc_retrieval",
    role: "Start TRL 없이 accuracy 70% 이상 목표",
    why: "word/char TF-IDF, metadata-safe feature, retrieval, optional rubric/pseudo feature 조합을 validation에서 탐색하고 test는 최종 1회 평가에만 사용합니다.",
  },
};

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function metricRows(metrics) {
  return [
    ["Accuracy", pct(metrics.accuracy)],
    ["Macro-F1", Number(metrics.macro_f1 || 0).toFixed(4)],
    ["F1 Low", Number(metrics.f1_low || 0).toFixed(4)],
    ["F1 Mid", Number(metrics.f1_mid || 0).toFixed(4)],
    ["F1 High", Number(metrics.f1_high || 0).toFixed(4)],
    ["MAE", Number(metrics.mae || 0).toFixed(4)],
  ].map(([name, value]) => `<div class="metric-row"><div class="muted">${name}</div><div>${value}</div></div>`).join("");
}

function predictionReason(row, info) {
  const pred = row[`${info.prefix}_pred`];
  const target = row.target_label;
  const confidence = row[`${info.prefix}_confidence`];
  const correctness = pred === target ? "정답과 일치" : "정답과 불일치";
  if (info.prefix === "alg1_full_fusion") {
    return `Alg1은 Start TRL reference를 포함한 upper-bound 모델입니다. ${correctness}; 예측 ${pred}, target ${target}, confidence ${confidence}.`;
  }
  if (info.prefix === "alg3_rubric_explainable") {
    return `Alg3는 Description evidence와 rubric score를 결합합니다. ${correctness}; 예측 ${pred}, target ${target}. 상세 근거는 reasoning trace의 rubric_agent/report_agent에서 확인합니다.`;
  }
  if (info.prefix === "alg4_gridsearched_svc_retrieval") {
    return `Alg4는 validation grid search로 선택된 no-start 모델입니다. ${correctness}; 예측 ${pred}, target ${target}, confidence ${confidence}.`;
  }
  return `Alg2는 Start TRL 없이 retrieval과 pseudo-start를 결합합니다. ${correctness}; 예측 ${pred}, target ${target}, confidence ${confidence}.`;
}

async function renderAlgorithmDetail() {
  const key = document.body.dataset.algorithmKey;
  const info = algorithmInfo[key];
  const [summary, logs, predictions] = await Promise.all([
    fetchStaticJson("../assets/data/dashboard_summary.json"),
    fetchStaticJson("../assets/data/agent_algorithm_logs.json"),
    fetchCsv("../assets/data/project_analysis_rows.csv"),
  ]);
  const model = summary.models[key] || {};
  const config = logs.algorithms?.[key] || {};
  document.getElementById("algorithmTitle").textContent = info.title;
  document.getElementById("algorithmSubtitle").textContent = info.subtitle;
  document.getElementById("algorithmKpis").innerHTML = [
    ["Start TRL", model.uses_start_trl ? "사용함" : "사용 안 함", model.uses_start_trl ? "Upper-bound only" : "Deployment-safe"],
    ["Test Accuracy", pct(model.test?.accuracy), "held-out test split"],
    ["Macro-F1", Number(model.test?.macro_f1 || 0).toFixed(4), "class-balanced metric"],
  ].map(([label, value, note]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><span class="metric-note">${note}</span></div>`).join("");

  document.getElementById("featurePolicy").innerHTML = `
    <div class="metric-row"><div class="muted">역할</div><div>${info.role}</div></div>
    <div class="metric-row"><div class="muted">해석</div><div>${config.interpretation || ""}</div></div>
    <div class="metric-row"><div class="muted">선택 모델</div><div>${config.selected_model || model.selected_model || ""}</div></div>
    <div class="metric-row"><div class="muted">Feature</div><div>${(config.features || []).join("<br>")}</div></div>
    <div class="metric-row"><div class="muted">Best selection</div><div>${config.best_model_selection || ""}</div></div>
  `;
  document.getElementById("reasoningSummary").innerHTML = `
    <p>${info.why}</p>
    <h3>Validation metrics</h3>${metricRows(model.validation || {})}
    <h3>Test metrics</h3>${metricRows(model.test || {})}
  `;

  const rows = predictions.slice(0, 80);
  document.getElementById("sampleHead").innerHTML = `<tr><th>Project</th><th>Target<br><span class="muted">evaluation only</span></th><th>Prediction</th><th>Confidence</th><th>왜 그렇게 나왔나</th><th>Description primary input</th></tr>`;
  document.getElementById("sampleRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.project_id}<br><span class="muted">${row.project_title}</span></td>
      <td>${renderCellStatus(row.target_label)}</td>
      <td>${renderCellStatus(row[`${info.prefix}_pred`])}</td>
      <td>${row[`${info.prefix}_confidence`]}</td>
      <td>${predictionReason(row, info)}</td>
      <td>${row.description_excerpt}</td>
    </tr>
  `).join("") + `<tr><td colspan="6" class="muted">Showing 80 of ${predictions.length.toLocaleString()} test rows. Target is End TRL label for evaluation only; Description is the primary input field.</td></tr>`;
  document.getElementById("rawAlgorithmJson").textContent = formatJson({ config, metrics: model, field_policy: logs.field_policy });
}

document.addEventListener("DOMContentLoaded", () => renderAlgorithmDetail().catch((error) => {
  document.getElementById("rawAlgorithmJson").textContent = error.message;
}));
