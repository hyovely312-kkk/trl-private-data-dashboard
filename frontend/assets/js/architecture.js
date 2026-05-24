document.addEventListener("DOMContentLoaded", async () => {
  try {
    const data = await apiGet("/api/v1/trl/agents");
    document.getElementById("agentDefinitions").textContent = formatJson(data);
  } catch (error) {
    document.getElementById("agentDefinitions").textContent = `${error.message}. Static diagram is still available.`;
  }
  renderArchitectureRunSummary();
  renderAlgorithmArchitectures();
  renderArchitectureModelLineup();
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

function modelLabel(key) {
  return {
    alg1_full_fusion: "Alg1 Full Fusion",
    alg2_no_start_pseudo_start: "Alg2 No-Start + Pseudo",
    alg3_rubric_explainable: "Alg3 Rubric Explainable",
    alg4_gridsearched_svc_retrieval: "Alg4 Grid-Searched SVC",
  }[key] || key;
}

function modelRole(key) {
  return {
    alg1_full_fusion: "Upper-bound 비교용. Start TRL 포함.",
    alg2_no_start_pseudo_start: "실제 신규 과제 평가용 No-Start main 후보.",
    alg3_rubric_explainable: "근거 점수와 설명가능성 중심.",
    alg4_gridsearched_svc_retrieval: "Start TRL 없이 accuracy 70%+ 목표 성능 모델.",
  }[key] || "";
}

function primaryDataForModel(key) {
  if (key === "alg1_full_fusion") return "Description + Benefits + Program + Primary TX + Start TRL";
  if (key === "alg3_rubric_explainable") return "Description evidence + Benefits commercialization + retrieval + pseudo-start";
  if (key === "alg4_gridsearched_svc_retrieval") return "Description TF-IDF word/char + metadata + retrieval + optional rubric/pseudo";
  return "Description TF-IDF + metadata + retrieval + pseudo-start";
}

async function renderArchitectureModelLineup() {
  const summary = await fetchStaticJson("assets/data/dashboard_summary.json");
  const models = summary.models || {};
  const entries = Object.entries(models);
  const cardEl = document.getElementById("architectureModelCards");
  const rowEl = document.getElementById("architectureModelRows");
  if (!cardEl || !rowEl) return;
  cardEl.innerHTML = entries.map(([key, model]) => `
    <div class="lineup-card">
      <h3>${modelLabel(key)}</h3>
      <span class="status ${model.uses_start_trl ? "High" : "Mid"}">${model.uses_start_trl ? "Upper-bound" : "Deployment-safe"}</span>
      <p>${modelRole(key)}</p>
      <p>Accuracy ${(model.test.accuracy * 100).toFixed(1)}% · Macro-F1 ${model.test.macro_f1.toFixed(3)}</p>
    </div>
  `).join("");
  rowEl.innerHTML = entries.map(([key, model]) => `
    <tr>
      <td>${modelLabel(key)}<br><span class="muted">${model.selected_model || ""}</span></td>
      <td>${model.uses_start_trl ? "사용함 / upper-bound" : "사용 안 함"}</td>
      <td>${primaryDataForModel(key)}</td>
      <td>${modelRole(key)}</td>
      <td>${(model.test.accuracy * 100).toFixed(2)}%</td>
      <td>${model.test.macro_f1.toFixed(4)}</td>
      <td>${model.test.mae.toFixed(4)}</td>
    </tr>
  `).join("");
}
