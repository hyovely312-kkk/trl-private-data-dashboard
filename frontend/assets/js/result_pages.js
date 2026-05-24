let resultProbabilityChart = null;
let descriptionRowsCache = [];
let activeDescriptionAlgorithm = "alg4_gridsearched_svc_retrieval";
let visibleDescriptionRows = 200;
let batchRowsCache = [];
let visibleBatchRows = 500;

const resultAlgorithmLabels = {
  alg1_full_fusion: ["Alg1 Upper-bound", "Start TRL 포함"],
  alg2_no_start_pseudo_start: ["Alg2 No-start", "Pseudo-start fusion"],
  alg3_rubric_explainable: ["Alg3 Rubric", "Explainable"],
  alg4_gridsearched_svc_retrieval: ["Alg4 Grid SVC", "Safe accuracy"],
};

function resultReason(row, key) {
  const pred = row[`${key}_pred`];
  const target = row.target_label;
  const confidence = row[`${key}_confidence`];
  const match = pred === target ? "정답 라벨과 일치" : "정답 라벨과 불일치";
  if (key === "alg1_full_fusion") return `Start TRL을 포함한 upper-bound 판단입니다. ${match}; prediction ${pred}, target ${target}, confidence ${confidence}.`;
  if (key === "alg3_rubric_explainable") return `Description evidence와 rubric score를 결합한 설명가능 판단입니다. ${match}; prediction ${pred}, confidence ${confidence}.`;
  if (key === "alg4_gridsearched_svc_retrieval") return `Start TRL 없이 grid search로 선택된 deployment-safe 판단입니다. ${match}; prediction ${pred}, confidence ${confidence}.`;
  return `Start TRL 없이 retrieval과 pseudo-start를 결합한 판단입니다. ${match}; prediction ${pred}, target ${target}, confidence ${confidence}.`;
}

function renderResultProbabilityChart(probs) {
  const canvas = document.getElementById("probChart");
  if (!canvas || !probs || !window.Chart) return;
  if (resultProbabilityChart) resultProbabilityChart.destroy();
  resultProbabilityChart = new Chart(canvas, {
    type: "doughnut",
    data: { labels: Object.keys(probs), datasets: [{ data: Object.values(probs), backgroundColor: ["#ff687d", "#f5c84c", "#38d996"] }] },
    options: { responsive: true, plugins: { legend: { labels: { color: "#e7f2ff" } } } },
  });
}

async function firstTrace() {
  const traces = await fetchJsonl("../assets/data/kotrl_x_reasoning_traces.jsonl", 1);
  return traces[0];
}

async function renderFinalResultPage() {
  const trace = await firstTrace();
  if (!trace) return;
  const report = trace.report_agent || {};
  const fusion = trace.fusion_agent || {};
  document.querySelector("[data-final-class]").innerHTML = `<span class="status ${trace.predicted_label}">${trace.predicted_label}</span>`;
  document.querySelector("[data-range]").textContent = fusion.예측TRL범위 || `${trace.predicted_label} range`;
  document.querySelector("[data-confidence]").textContent = confidencePct(trace.confidence);
  document.querySelector("[data-reason]").textContent = report.최종설명 || "";
  document.getElementById("evidenceList").innerHTML = (trace.rubric_agent?.근거문장 || []).slice(0, 3).map((x) => `<li>${x}</li>`).join("") || "<li>근거 문장이 탐지되지 않았습니다.</li>";
  document.getElementById("riskList").innerHTML = (report.판정보류요소 || []).map((x) => `<li>${x}</li>`).join("") || "<li>판정 보류 요소가 명시되지 않았습니다.</li>";
  document.getElementById("actionList").innerHTML = (report.추가필요사항 || []).map((x) => `<li>${x}</li>`).join("") || "<li>추가 필요 단계가 명시되지 않았습니다.</li>";
  renderResultProbabilityChart({ Low: fusion.Low확률 || 0, Mid: fusion.Mid확률 || 0, High: fusion.High확률 || 0 });
  document.getElementById("rawResult").textContent = formatJson(trace);
}

async function renderReasoningPage() {
  const trace = await firstTrace();
  if (!trace) return;
  const report = trace.report_agent || {};
  const fusion = trace.fusion_agent || {};
  const retrieval = trace.retrieval_agent || {};
  document.getElementById("koreanReasoningBlock").innerHTML = `
    <div class="metric-row"><div class="muted">예측 결과</div><div>${renderCellStatus(trace.predicted_label)} ${fusion.예측TRL범위 || ""}</div></div>
    <div class="metric-row"><div class="muted">신뢰도</div><div>${trace.confidence}</div></div>
    <div class="metric-row"><div class="muted">판정 근거</div><div>${(report.판정근거 || []).join("<br>")}</div></div>
    <div class="metric-row"><div class="muted">유사 과제 분석</div><div>Low ${Math.round((retrieval.Low비율 || 0) * 100)}% · Mid ${Math.round((retrieval.Mid비율 || 0) * 100)}% · High ${Math.round((retrieval.High비율 || 0) * 100)}%</div></div>
    <div class="metric-row"><div class="muted">판정 보류 요소</div><div>${(report.판정보류요소 || []).join("<br>")}</div></div>
    <div class="metric-row"><div class="muted">추가 필요 단계</div><div>${(report.추가필요사항 || []).join("<br>")}</div></div>
    <p style="margin-top:14px">${report.최종설명 || ""}</p>
  `;
  document.getElementById("evidenceSentences").innerHTML = (trace.rubric_agent?.근거문장 || []).map((sentence) => `<p class="evidence-highlight">${sentence}</p>`).join("") || `<p class="muted">근거 문장이 탐지되지 않았습니다.</p>`;
  document.getElementById("judgeAnalysis").innerHTML = Object.entries(trace.judge_agent || {}).map(([key, value]) => `
    <div class="metric-row"><div class="muted">${key}</div><div>${String(value)}</div></div>
  `).join("");
}

async function renderDescriptionTabsPage() {
  descriptionRowsCache = await fetchCsv("../assets/data/project_analysis_rows.csv");
  const tabs = document.getElementById("descriptionResultTabs");
  const loadMore = document.getElementById("loadMoreDescriptionResults");
  tabs.innerHTML = Object.entries(resultAlgorithmLabels).map(([key, [label, note]]) => `
    <button type="button" class="tab-button ${key === activeDescriptionAlgorithm ? "active" : ""}" data-result-algorithm="${key}">${label}<br><span class="muted">${note}</span></button>
  `).join("");
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-result-algorithm]");
    if (!button) return;
    activeDescriptionAlgorithm = button.dataset.resultAlgorithm;
    visibleDescriptionRows = 200;
    tabs.querySelectorAll(".tab-button").forEach((el) => el.classList.toggle("active", el.dataset.resultAlgorithm === activeDescriptionAlgorithm));
    drawDescriptionResultRows();
  });
  loadMore.addEventListener("click", () => {
    visibleDescriptionRows = Math.min(visibleDescriptionRows + 500, descriptionRowsCache.length);
    drawDescriptionResultRows();
  });
  drawDescriptionResultRows();
}

function drawDescriptionResultRows() {
  const rows = descriptionRowsCache.slice(0, visibleDescriptionRows);
  const loadMore = document.getElementById("loadMoreDescriptionResults");
  loadMore.disabled = visibleDescriptionRows >= descriptionRowsCache.length;
  loadMore.textContent = visibleDescriptionRows >= descriptionRowsCache.length ? "All rows loaded" : "Load more";
  document.getElementById("descriptionResultRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.project_id}<br><span class="muted">${row.project_title}</span></td>
      <td>${row.description_excerpt}</td>
      <td>${renderCellStatus(row.target_label)}</td>
      <td>${renderCellStatus(row[`${activeDescriptionAlgorithm}_pred`])}</td>
      <td>${row[`${activeDescriptionAlgorithm}_confidence`]}</td>
      <td>${resultReason(row, activeDescriptionAlgorithm)}</td>
    </tr>
  `).join("") + `<tr><td colspan="6" class="muted">Showing ${rows.length.toLocaleString()} of ${descriptionRowsCache.length.toLocaleString()} Description-level results for ${resultAlgorithmLabels[activeDescriptionAlgorithm][0]}.</td></tr>`;
}

async function renderBatchRowsPage() {
  batchRowsCache = await fetchCsv("../assets/data/project_analysis_rows.csv");
  const loadMore = document.getElementById("loadMoreBatchRows");
  loadMore.addEventListener("click", () => {
    visibleBatchRows = Math.min(visibleBatchRows + 500, batchRowsCache.length);
    drawBatchRows();
  });
  drawBatchRows();
}

function drawBatchRows() {
  const rows = batchRowsCache.slice(0, visibleBatchRows);
  const loadMore = document.getElementById("loadMoreBatchRows");
  loadMore.disabled = visibleBatchRows >= batchRowsCache.length;
  loadMore.textContent = visibleBatchRows >= batchRowsCache.length ? "All rows loaded" : "Load more";
  document.getElementById("batchPredictionRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.project_id}<br><span class="muted">${row.project_title}</span></td>
      <td>${renderCellStatus(row.target_label)}</td>
      <td>${renderCellStatus(row.alg1_full_fusion_pred)}<br><span class="muted">${row.alg1_full_fusion_confidence}</span></td>
      <td>${renderCellStatus(row.alg2_no_start_pseudo_start_pred)}<br><span class="muted">${row.alg2_no_start_pseudo_start_confidence}</span></td>
      <td>${renderCellStatus(row.alg3_rubric_explainable_pred)}<br><span class="muted">${row.alg3_rubric_explainable_confidence}</span></td>
      <td>${renderCellStatus(row.alg4_gridsearched_svc_retrieval_pred)}<br><span class="muted">${row.alg4_gridsearched_svc_retrieval_confidence}</span></td>
      <td>${row.description_excerpt}</td>
    </tr>
  `).join("") + `<tr><td colspan="7" class="muted">Showing ${rows.length.toLocaleString()} of ${batchRowsCache.length.toLocaleString()} test prediction rows.</td></tr>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.resultPage;
  const jobs = {
    final: renderFinalResultPage,
    "description-tabs": renderDescriptionTabsPage,
    reasoning: renderReasoningPage,
    "batch-rows": renderBatchRowsPage,
  };
  jobs[page]?.().catch((error) => {
    document.querySelector(".main")?.insertAdjacentHTML("beforeend", `<section class="notice">${error.message}</section>`);
  });
});
