const archBase = location.pathname.includes("/architecture/") ? "../" : "";
const archData = (path) => `${archBase}assets/data/${path}`;

const architectureSubpages = [
  ["System Flowcharts", "architecture/system-flow.html", "전체 시스템, Multi-Agent flow, TRL reasoning pipeline, dashboard 구조도"],
  ["Experiment Data Flow Counts", "architecture/data-flow.html", "raw Excel rows, split, feature generation, algorithm run counts"],
  ["Algorithm Data Architectures", "architecture/model-lineup.html", "Alg1~Alg4 데이터 사용 정책과 성능 라인업"],
  ["Agent Definitions", "architecture/agent-definitions.html", "Role-based Agent 입력/출력 정의 JSON"],
];

function fmtArch(value) {
  return Number(value || 0).toLocaleString();
}

async function renderArchitectureHub() {
  document.getElementById("architectureSubpageCards").innerHTML = architectureSubpages.map(([title, href, note]) => `
    <a class="lineup-card" href="${href}"><h3>${title}</h3><p>${note}</p><span class="button" style="display:inline-block;margin-top:8px">Open</span></a>
  `).join("");
  const summary = await fetchStaticJson(archData("dashboard_summary.json"));
  document.querySelector("[data-arch-total]").textContent = fmtArch(summary.dataset?.n_total);
  document.querySelector("[data-arch-test]").textContent = fmtArch(summary.dataset?.n_test);
}

function mermaidPanel(title, code) {
  return `<section class="panel" style="margin-bottom:16px"><div class="section-title"><h2>${title}</h2></div><pre class="mermaid">${code}</pre></section>`;
}

function renderArchitectureMermaids() {
  document.getElementById("architectureMermaidBlocks").innerHTML = [
    mermaidPanel("전체 시스템 아키텍처", `flowchart TD
  A["Raw 데이터<br/>NASA TechPort Excel"] --> B["데이터 정제 에이전트<br/>컬럼 검증·결측 처리·label 생성"]
  B --> C["텍스트 임베딩 에이전트<br/>Description 중심 TF-IDF word/char"]
  B --> D["TRL 근거 분석 에이전트<br/>한글 evidence score"]
  C --> E["유사 과제 검색 에이전트<br/>cosine similarity top-k"]
  D --> F["Pseudo-Start 추정 에이전트<br/>Start TRL 없이 maturity 추정"]
  C --> G["Fusion 예측 에이전트<br/>No-Start deployment-safe prediction"]
  D --> G
  E --> G
  F --> G
  G --> H["판정 검증 에이전트<br/>충돌·일관성 검증"]
  H --> I["설명 생성 에이전트<br/>한글 reasoning summary"]
  I --> J["대시보드 시각화<br/>trace·evidence·event log"]`),
    mermaidPanel("Multi-Agent Flow", `flowchart LR
  A["데이터 정제"] --> B["임베딩 생성"]
  B --> C["근거 분석"]
  B --> D["유사 과제 검색"]
  C --> E["Pseudo-Start 추정"]
  C --> F["Fusion 예측"]
  D --> F
  E --> F
  F --> G["Judge 검증"]
  G --> H["Report 생성"]`),
    mermaidPanel("TRL Reasoning Pipeline", `flowchart TD
  A["Description 문장"] --> B["한글 evidence dictionary 매핑"]
  B --> C["개념·실험실·시제품·실증·운영 점수"]
  C --> D["유사 과제 TRL 분포"]
  D --> E["Pseudo-start maturity"]
  E --> F["Low/Mid/High 확률"]
  F --> G["충돌 분석"]
  G --> H["최종 한글 설명"]`),
    mermaidPanel("Reasoning Trace 구조도", `flowchart LR
  A["Description<br/>Primary TRL Evidence Text"] --> B["embedding_agent<br/>TF-IDF word/char"]
  A --> C["rubric_agent<br/>한글 evidence score"]
  A --> D["retrieval_agent<br/>Description similarity"]
  A --> E["pseudo_start_agent<br/>maturity keyword 추정"]
  X["Benefits<br/>상용화·운영 보조 근거"] -. "auxiliary" .-> C
  Y["Project Title<br/>기술명 보조"] -. "auxiliary" .-> D
  B --> F["fusion_agent"]
  C --> F
  D --> F
  E --> F
  F --> G["judge_agent"]
  G --> H["report_agent"]
  I["project_id"] -. "로그 식별자 / trace lookup key" .-> B
  I -. "로그 식별자 / trace lookup key" .-> C
  I -. "로그 식별자 / trace lookup key" .-> H`),
  ].join("");
  if (window.mermaid) mermaid.init(undefined, document.querySelectorAll(".mermaid"));
}

async function renderArchitectureDataFlow() {
  const summary = await fetchStaticJson(archData("dashboard_summary.json"));
  const dataset = summary.dataset || {};
  const labels = dataset.label_distribution || {};
  document.getElementById("architectureRunCards").innerHTML = [
    ["Raw Excel files", dataset.source_file_count || 1, "One workbook used for the experiment run"],
    ["Total project rows", fmtArch(dataset.n_total), "End TRL to Low/Mid/High"],
    ["Train rows", fmtArch(dataset.n_train), "Retrieval corpus and model training"],
    ["Valid rows", fmtArch(dataset.n_valid), "Grid/model selection only"],
    ["Test rows", fmtArch(dataset.n_test), "Final one-time evaluation"],
    ["Algorithms", "4", "Alg1 upper-bound + Alg2/3/4 deployment-safe"],
    ["Class labels", `L ${labels.Low} · M ${labels.Mid} · H ${labels.High}`, "End TRL <=3, 4-6, >=7"],
    ["KoTRL-X traces", fmtArch(dataset.n_test), "각 test sample마다 Agent trace 생성"],
  ].map(([label, value, note]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><span class="metric-note">${note}</span></div>`).join("");
  document.getElementById("architectureFlowRows").innerHTML = [
    ["Load Excel", `${fmtArch(dataset.n_total)} rows`, `${dataset.sheet || "Main_Data"} sheet loaded; required columns validated.`],
    ["Target mapping", `${labels.Low || 0} Low / ${labels.Mid || 0} Mid / ${labels.High || 0} High`, "End TRL converted into three classes."],
    ["Split", `${fmtArch(dataset.n_train)} / ${fmtArch(dataset.n_valid)} / ${fmtArch(dataset.n_test)}`, "Stratified train/valid/test split with random_state=42."],
    ["Primary text", "Description-centered", "Description drives retrieval, pseudo-start, rubric evidence, and text classification."],
    ["Algorithm runs", `${fmtArch((dataset.n_test || 0) * 4)} test predictions`, "All four algorithms evaluated on the same held-out test set."],
    ["KoTRL-X log export", `${fmtArch(dataset.n_test)} JSONL traces`, "embedding, rubric, retrieval, pseudo-start, fusion, judge, report agent log 연결."],
  ].map(([stage, rows, action]) => `<tr><td>${stage}</td><td>${rows}</td><td>${action}</td></tr>`).join("");
}

function archModelLabel(key) {
  return { alg1_full_fusion: "Alg1 Full Fusion", alg2_no_start_pseudo_start: "Alg2 No-Start + Pseudo", alg3_rubric_explainable: "Alg3 Rubric Explainable", alg4_gridsearched_svc_retrieval: "Alg4 Grid-Searched SVC" }[key] || key;
}

function archModelRole(key) {
  return { alg1_full_fusion: "Upper-bound 비교용. Start TRL 포함.", alg2_no_start_pseudo_start: "실제 신규 과제 평가용 No-Start main 후보.", alg3_rubric_explainable: "근거 점수와 설명가능성 중심.", alg4_gridsearched_svc_retrieval: "Start TRL 없이 accuracy 70%+ 목표 성능 모델." }[key] || "";
}

function archPrimaryData(key) {
  if (key === "alg1_full_fusion") return "Description + Benefits + Program + Primary TX + Start TRL";
  if (key === "alg3_rubric_explainable") return "Description evidence + Benefits commercialization + retrieval + pseudo-start";
  if (key === "alg4_gridsearched_svc_retrieval") return "Description TF-IDF word/char + metadata + retrieval + optional rubric/pseudo";
  return "Description TF-IDF + metadata + retrieval + pseudo-start";
}

async function renderArchitectureModelLineupPage() {
  const [summary, arch] = await Promise.all([
    fetchStaticJson(archData("dashboard_summary.json")),
    fetchStaticJson(archData("algorithm_architecture.json")),
  ]);
  const entries = Object.entries(summary.models || {});
  document.getElementById("architectureModelCards").innerHTML = entries.map(([key, model]) => `
    <div class="lineup-card"><h3>${archModelLabel(key)}</h3><span class="status ${model.uses_start_trl ? "High" : "Mid"}">${model.uses_start_trl ? "Upper-bound" : "Deployment-safe"}</span><p>${archModelRole(key)}</p><p>Accuracy ${(model.test.accuracy * 100).toFixed(1)}% · Macro-F1 ${model.test.macro_f1.toFixed(3)}</p></div>
  `).join("");
  document.getElementById("architectureModelRows").innerHTML = entries.map(([key, model]) => `
    <tr><td>${archModelLabel(key)}<br><span class="muted">${model.selected_model || ""}</span></td><td>${model.uses_start_trl ? "사용함 / upper-bound" : "사용 안 함"}</td><td>${archPrimaryData(key)}</td><td>${archModelRole(key)}</td><td>${(model.test.accuracy * 100).toFixed(2)}%</td><td>${model.test.macro_f1.toFixed(4)}</td><td>${model.test.mae.toFixed(4)}</td></tr>
  `).join("");
  document.getElementById("algorithmArchitectures").innerHTML = Object.entries(arch).map(([key, value]) => `
    <div class="card"><div class="section-title"><h2>${key}</h2><span class="status ${value.uses_start_trl ? "High" : "Mid"}">${value.uses_start_trl ? "Upper-bound" : "No Start"}</span></div><p class="muted">${value.purpose}</p><ol>${value.flow.map((step) => `<li>${step}</li>`).join("")}</ol></div>
  `).join("");
}

async function renderAgentDefinitionsPage() {
  try {
    document.getElementById("agentDefinitions").textContent = formatJson(await apiGet("/api/v1/trl/agents"));
  } catch (error) {
    document.getElementById("agentDefinitions").textContent = `${error.message}. Static backend agent definition is unavailable on GitHub Pages, but architecture and experiment logs are available in the dashboard exports.`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const jobs = {
    hub: renderArchitectureHub,
    "system-flow": renderArchitectureMermaids,
    "data-flow": renderArchitectureDataFlow,
    "model-lineup": renderArchitectureModelLineupPage,
    "agent-definitions": renderAgentDefinitionsPage,
  };
  try {
    const result = jobs[document.body.dataset.architecturePage]?.();
    if (result?.catch) result.catch((error) => document.querySelector(".main")?.insertAdjacentHTML("beforeend", `<section class="notice" style="margin-top:16px">${error.message}</section>`));
  } catch (error) {
    document.querySelector(".main")?.insertAdjacentHTML("beforeend", `<section class="notice" style="margin-top:16px">${error.message}</section>`);
  }
});
