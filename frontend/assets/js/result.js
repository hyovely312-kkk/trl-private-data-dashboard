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
}).finally(() => renderBatchPredictionRows().catch(() => {
  const tbody = document.getElementById("batchPredictionRows");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Batch prediction rows are local/private artifacts and are not published in the public GitHub demo.</td></tr>`;
  }
})));

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
