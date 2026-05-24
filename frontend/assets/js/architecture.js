document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await apiGet("/api/v1/trl/agents");
    document.getElementById("agentDefinitions").textContent = formatJson(data);
  } catch (error) {
    document.getElementById("agentDefinitions").textContent = `${error.message}. Static diagram is still available.`;
  }
  renderArchitectureRunSummary();
  renderAlgorithmArchitectures();
});

async function renderAlgorithmArchitectures() {
  const data = await fetchStaticJson("assets/data/algorithm_architecture.json");
  document.getElementById("algorithmArchitectures").innerHTML = Object.entries(data).map(([key, value]) => `
    <div class="card">
      <div class="section-title"><h2>${key}</h2><span class="status ${value.uses_start_trl ? "High" : "Mid"}">${value.uses_start_trl ? "Upper-bound" : "No Start"}</span></div>
      <p class="muted">${value.purpose}</p>
      <ol>${value.flow.map((step) => `<li>${step}</li>`).join("")}</ol>
    </div>
  `).join("");
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString();
}

async function renderArchitectureRunSummary() {
  const summary = await fetchStaticJson("assets/data/dashboard_summary.json");
  const dataset = summary.dataset || {};
  const labels = dataset.label_distribution || {};
  document.getElementById("architectureRunCards").innerHTML = [
    ["Raw Excel files", dataset.source_file_count || 1, "One workbook used for the experiment run"],
    ["Total project rows", fmtNumber(dataset.n_total), "Each row mapped from End TRL to Low/Mid/High"],
    ["Train rows", fmtNumber(dataset.n_train), "Retrieval corpus and model training set"],
    ["Valid rows", fmtNumber(dataset.n_valid), "Model/grid selection only"],
    ["Test rows", fmtNumber(dataset.n_test), "Final one-time evaluation set"],
    ["Algorithms", "4", "Alg1 upper-bound + Alg2/3/4 deployment-safe"],
    ["Class labels", `L ${labels.Low} · M ${labels.Mid} · H ${labels.High}`, "End TRL <=3, 4-6, >=7"],
    ["KoTRL-X traces", fmtNumber(dataset.n_test), "각 test sample마다 8개 Agent reasoning trace 생성"],
  ].map(([label, value, note]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><span class="metric-note">${note}</span></div>`).join("");
  document.getElementById("architectureFlowRows").innerHTML = [
    ["Load Excel", `${fmtNumber(dataset.n_total)} rows`, `${dataset.sheet || "Main_Data"} sheet loaded; required columns validated.`],
    ["Target mapping", `${labels.Low || 0} Low / ${labels.Mid || 0} Mid / ${labels.High || 0} High`, "End TRL converted into three classes."],
    ["Split", `${fmtNumber(dataset.n_train)} / ${fmtNumber(dataset.n_valid)} / ${fmtNumber(dataset.n_test)}`, "Stratified train/valid/test split with random_state=42."],
    ["Primary text", "Description-centered", "Description drives retrieval, pseudo-start, rubric evidence, and text classification."],
    ["Algorithm runs", `${fmtNumber((dataset.n_test || 0) * 4)} test predictions`, "All four algorithms evaluated on the same held-out test set."],
    ["KoTRL-X log export", `${fmtNumber(dataset.n_test)} JSONL traces`, "embedding, rubric, retrieval, pseudo-start, fusion, judge, report agent log 연결."],
  ].map(([stage, rows, action]) => `<tr><td>${stage}</td><td>${rows}</td><td>${action}</td></tr>`).join("");
}
