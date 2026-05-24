async function renderResult() {
  const event = await getLastEvent();
  if (!event) {
    document.getElementById("resultRoot").innerHTML = `<div class="notice">No result event found. Run an analysis first.</div>`;
    return;
  }
  document.querySelector("[data-final-class]").innerHTML = `<span class="status ${event.final_class}">${event.final_class}</span>`;
  document.querySelector("[data-range]").textContent = event.predicted_trl_range;
  document.querySelector("[data-confidence]").textContent = confidencePct(event.confidence);
  document.querySelector("[data-reason]").textContent = event.explanation.final_reason;
  document.getElementById("evidenceList").innerHTML = (event.explanation.key_evidence || []).map((x) => `<li>${x}</li>`).join("") || "<li>No direct evidence sentences detected.</li>";
  document.getElementById("riskList").innerHTML = (event.explanation.risk_factors || []).map((x) => `<li>${x}</li>`).join("");
  document.getElementById("actionList").innerHTML = (event.explanation.recommended_next_action || []).map((x) => `<li>${x}</li>`).join("");
  document.getElementById("rawResult").textContent = formatJson(event);
  document.getElementById("agentLink").href = `agents.html?event_id=${event.event_id}`;

  const probs = event.fusion_log.probabilities;
  new Chart(document.getElementById("probChart"), {
    type: "doughnut",
    data: { labels: Object.keys(probs), datasets: [{ data: Object.values(probs), backgroundColor: ["#ff687d", "#f5c84c", "#38d996"] }] },
    options: { responsive: true, plugins: { legend: { labels: { color: "#e7f2ff" } } } },
  });
}

document.addEventListener("DOMContentLoaded", () => renderResult().catch((error) => {
  document.querySelector("[data-final-class]").innerHTML = `<span class="status Mid">Static</span>`;
  document.querySelector("[data-range]").textContent = "Batch rows";
  document.querySelector("[data-confidence]").textContent = "-";
  document.querySelector("[data-reason]").textContent = `${error.message}. Showing raw Excel batch predictions below.`;
  document.getElementById("rawResult").textContent = "Static mode: backend event API is not connected.";
}).finally(() => {
  renderStaticKoreanReasoning().catch(() => {});
  renderBatchPredictionRows().catch(() => {
  const tbody = document.getElementById("batchPredictionRows");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Batch prediction rows are local/private artifacts and are not published in the public GitHub demo.</td></tr>`;
  }
  });
}));

async function renderStaticKoreanReasoning() {
  const traces = await fetchJsonl("assets/data/kotrl_x_reasoning_traces.jsonl", 1);
  const trace = traces[0];
  if (!trace) return;
  const block = document.getElementById("koreanReasoningBlock");
  const evidence = document.getElementById("evidenceSentences");
  const judge = document.getElementById("judgeAnalysis");
  if (!block || !evidence || !judge) return;
  const report = trace.report_agent || {};
  const fusion = trace.fusion_agent || {};
  const retrieval = trace.retrieval_agent || {};
  block.innerHTML = `
    <div class="metric-row"><div class="muted">예측 결과</div><div>${renderCellStatus(trace.predicted_label)} ${fusion.예측TRL범위 || ""}</div></div>
    <div class="metric-row"><div class="muted">신뢰도</div><div>${trace.confidence}</div></div>
    <div class="metric-row"><div class="muted">판정 근거</div><div>${(report.판정근거 || []).join("<br>")}</div></div>
    <div class="metric-row"><div class="muted">유사 과제 분석</div><div>Low ${Math.round((retrieval.Low비율 || 0) * 100)}% · Mid ${Math.round((retrieval.Mid비율 || 0) * 100)}% · High ${Math.round((retrieval.High비율 || 0) * 100)}%</div></div>
    <div class="metric-row"><div class="muted">판정 보류 요소</div><div>${(report.판정보류요소 || []).join("<br>")}</div></div>
    <div class="metric-row"><div class="muted">추가 필요 단계</div><div>${(report.추가필요사항 || []).join("<br>")}</div></div>
    <p style="margin-top:14px">${report.최종설명 || ""}</p>
  `;
  evidence.innerHTML = (trace.rubric_agent?.근거문장 || []).map((sentence) => `<p class="evidence-highlight">${sentence}</p>`).join("") || `<p class="muted">근거 문장이 탐지되지 않았습니다.</p>`;
  judge.innerHTML = Object.entries(trace.judge_agent || {}).map(([key, value]) => `
    <div class="metric-row"><div class="muted">${key}</div><div>${String(value)}</div></div>
  `).join("");
}

async function renderBatchPredictionRows() {
  const allRows = await fetchCsv("assets/data/project_analysis_rows.csv");
  const rows = allRows.slice(0, 100);
  const tbody = document.getElementById("batchPredictionRows");
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.project_id}<br><span class="muted">${row.project_title}</span></td>
      <td>${renderCellStatus(row.target_label)}</td>
      <td>${renderCellStatus(row.alg1_full_fusion_pred)}<br><span class="muted">${row.alg1_full_fusion_confidence}</span></td>
      <td>${renderCellStatus(row.alg2_no_start_pseudo_start_pred)}<br><span class="muted">${row.alg2_no_start_pseudo_start_confidence}</span></td>
      <td>${renderCellStatus(row.alg3_rubric_explainable_pred)}<br><span class="muted">${row.alg3_rubric_explainable_confidence}</span></td>
      <td>${renderCellStatus(row.alg4_gridsearched_svc_retrieval_pred)}<br><span class="muted">${row.alg4_gridsearched_svc_retrieval_confidence}</span></td>
      <td>${row.description_excerpt}</td>
    </tr>
  `).join("") + `<tr><td colspan="7" class="muted">Showing ${rows.length.toLocaleString()} of ${allRows.length.toLocaleString()} test prediction rows. All rows are loaded in assets/data/project_analysis_rows.csv.</td></tr>`;
}
