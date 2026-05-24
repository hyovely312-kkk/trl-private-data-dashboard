const agentBase = location.pathname.includes("/agents/") ? "../" : "";
const agentData = (path) => `${agentBase}assets/data/${path}`;
let agentCrosscheckRows = [];
let agentCrosscheckVisible = 500;

const agentSubpages = [
  ["Multi-Agent Reasoning Trace", "agents/traces.html", "각 test sample별 embedding, rubric, retrieval, pseudo-start, fusion, judge, report trace"],
  ["실험별 Agent / Algorithm Lineup", "agents/lineup.html", "Alg1~Alg4가 어떤 Agent output을 쓰는지 비교"],
  ["Description × Agent Cross-check", "agents/crosscheck.html", "Description별 알고리즘 결과와 Agent reasoning을 함께 확인"],
  ["Raw Agent Intermediate Logs", "agents/raw-logs.html", "retrieval/pseudo-start/rubric/grid-search 중간 산출물 조회"],
];

function agentPageLink(href) {
  return location.pathname.includes("/agents/") ? `../${href}` : href;
}

async function renderAgentHub() {
  document.getElementById("agentSubpageCards").innerHTML = agentSubpages.map(([title, href, note]) => `
    <a class="lineup-card" href="${href}">
      <h3>${title}</h3><p>${note}</p><span class="button" style="display:inline-block;margin-top:8px">Open</span>
    </a>
  `).join("");
  const [traces, rows] = await Promise.all([
    fetchJsonl(agentData("kotrl_x_reasoning_traces.jsonl")),
    fetchCsv(agentData("project_analysis_rows.csv")),
  ]);
  document.querySelector("[data-agent-traces]").textContent = traces.length.toLocaleString();
  document.querySelector("[data-agent-crosscheck]").textContent = rows.length.toLocaleString();
}

async function renderAgentTraces() {
  const traces = await fetchJsonl(agentData("kotrl_x_reasoning_traces.jsonl"));
  const cards = document.getElementById("traceSummaryCards");
  const rowsEl = document.getElementById("traceRows");
  const search = document.getElementById("traceSearch");
  const detailTitle = document.getElementById("traceDetailTitle");
  const detailJson = document.getElementById("traceDetailJson");
  const conflicts = traces.filter((trace) => trace.judge_agent?.충돌여부).length;
  const avgConfidence = traces.reduce((sum, trace) => sum + Number(trace.confidence || 0), 0) / Math.max(traces.length, 1);
  cards.innerHTML = [
    ["Reasoning traces", traces.length.toLocaleString(), "각 sample별 8개 Agent log"],
    ["Judge conflicts", conflicts.toLocaleString(), "retrieval/rubric/fusion 불일치 사례"],
    ["Avg confidence", `${Math.round(avgConfidence * 100)}%`, "Alg4 deployment-safe fusion 기준"],
  ].map(([label, value, note]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><span class="metric-note">${note}</span></div>`).join("");

  const showDetail = (trace) => {
    detailTitle.textContent = `${trace.project_id} · ${trace.predicted_label}`;
    detailJson.textContent = formatJson(trace);
  };
  const draw = () => {
    const q = (search.value || "").toLowerCase();
    const filtered = traces.filter((trace) => !q || JSON.stringify(trace).toLowerCase().includes(q));
    const visible = filtered.slice(0, 120);
    rowsEl.innerHTML = visible.map((trace) => `
      <tr data-trace-id="${trace.project_id}">
        <td>${trace.project_id}<br><span class="muted">${trace.project_title || ""}</span></td>
        <td>${renderCellStatus(trace.target_label)}</td>
        <td>${renderCellStatus(trace.predicted_label)}<br><span class="muted">${trace.confidence}</span></td>
        <td>${trace.judge_agent?.충돌여부 ? "충돌 있음" : "일관"}<br><span class="muted">${trace.judge_agent?.충돌사유 || ""}</span></td>
        <td>${trace.report_agent?.최종설명 || ""}</td>
      </tr>
    `).join("") + `<tr><td colspan="5" class="muted">Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} KoTRL-X reasoning traces.</td></tr>`;
    if (filtered[0]) showDetail(filtered[0]);
  };
  search.addEventListener("input", draw);
  rowsEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-trace-id]");
    if (!row) return;
    const trace = traces.find((item) => String(item.project_id) === row.dataset.traceId);
    if (trace) showDetail(trace);
  });
  draw();
}

async function renderAgentLineup() {
  const summary = await fetchStaticJson(agentData("dashboard_summary.json"));
  const lineup = [
    ["Alg1 Full Retrieval-Metadata Fusion", "사용함 / upper-bound", "Description, Benefits, Program, Primary TX, Start TRL", "embedding + retrieval + metadata + Start TRL", "Low/Mid/High probability", "alg1_full_fusion"],
    ["Alg2 No-Start / Pseudo-Start Fusion", "사용 안 함", "Description 중심 text, Program, Primary TX", "embedding + retrieval + pseudo-start", "Deployment-safe prediction", "alg2_no_start_pseudo_start"],
    ["Alg3 Rubric-Guided Explainable Fusion", "사용 안 함", "Description evidence, Benefits 보조", "rubric + retrieval + pseudo-start + report", "Prediction + explanation", "alg3_rubric_explainable"],
    ["Alg4 Grid-Searched TF-IDF SVC Retrieval Fusion", "사용 안 함", "Description TF-IDF word/char, metadata, retrieval", "embedding + retrieval + optional rubric/pseudo + calibrated classifier", "Accuracy-focused deployment-safe prediction", "alg4_gridsearched_svc_retrieval"],
  ];
  document.getElementById("agentLineupRows").innerHTML = lineup.map(([name, start, inputs, agents, output, key]) => {
    const metric = summary.models?.[key]?.test || {};
    return `<tr><td>${name}</td><td>${start}</td><td>${inputs}</td><td>${agents}</td><td>${output}</td><td>Acc ${((metric.accuracy || 0) * 100).toFixed(1)}% · Macro-F1 ${(metric.macro_f1 || 0).toFixed(3)}</td></tr>`;
  }).join("");
}

async function renderAgentCrosscheckPage() {
  const [traces, projects] = await Promise.all([
    fetchJsonl(agentData("kotrl_x_reasoning_traces.jsonl")),
    fetchCsv(agentData("project_analysis_rows.csv")),
  ]);
  const projectById = Object.fromEntries(projects.map((row) => [String(row.project_id), row]));
  agentCrosscheckRows = traces.map((trace) => ({ trace, project: projectById[String(trace.project_id)] || {} }));
  document.getElementById("loadMoreAgentCrosscheck").addEventListener("click", () => {
    agentCrosscheckVisible = Math.min(agentCrosscheckVisible + 500, agentCrosscheckRows.length);
    drawAgentCrosscheckPage();
  });
  drawAgentCrosscheckPage();
}

function drawAgentCrosscheckPage() {
  const rows = agentCrosscheckRows.slice(0, agentCrosscheckVisible);
  const button = document.getElementById("loadMoreAgentCrosscheck");
  button.disabled = agentCrosscheckVisible >= agentCrosscheckRows.length;
  button.textContent = button.disabled ? "All rows loaded" : "Load more";
  document.getElementById("agentCrosscheckRows").innerHTML = rows.map(({ trace, project }) => {
    const rubric = trace.rubric_agent || {};
    const retrieval = trace.retrieval_agent || {};
    const pseudo = trace.pseudo_start_agent || {};
    const report = trace.report_agent || {};
    return `<tr>
      <td>${trace.project_id}<br><span class="muted">${trace.project_title || project.project_title || ""}</span><br>${project.description_excerpt || ""}</td>
      <td>Alg1 ${renderCellStatus(project.alg1_full_fusion_pred || "")}<br>Alg2 ${renderCellStatus(project.alg2_no_start_pseudo_start_pred || "")}<br>Alg3 ${renderCellStatus(project.alg3_rubric_explainable_pred || "")}<br>Alg4 ${renderCellStatus(project.alg4_gridsearched_svc_retrieval_pred || trace.predicted_label)}</td>
      <td>Mid ${Math.round((retrieval.Mid비율 || 0) * 100)}% · High ${Math.round((retrieval.High비율 || 0) * 100)}%<br><span class="muted">top-k ${((retrieval.top_k_project_ids || []).slice(0, 3)).join(", ")}</span></td>
      <td>시제품 ${rubric.시제품점수 ?? 0}<br>실험실 ${rubric.실험실검증점수 ?? 0}<br>실제환경 ${rubric.실제환경검증점수 ?? 0}</td>
      <td>추정 TRL ${pseudo.추정StartTRL ?? "-"}<br>신뢰도 ${pseudo.신뢰도 ?? "-"}<br><span class="muted">${(pseudo.근거키워드 || []).join(", ")}</span></td>
      <td>${trace.judge_agent?.충돌여부 ? "충돌 있음" : "일관"}<br><span class="muted">${report.최종설명 || ""}</span></td>
    </tr>`;
  }).join("") + `<tr><td colspan="6" class="muted">Showing ${rows.length.toLocaleString()} of ${agentCrosscheckRows.length.toLocaleString()} Description × Agent cross-check rows.</td></tr>`;
}

async function renderRawAgentLogs() {
  const data = await fetchStaticJson(agentData("agent_algorithm_logs.json"));
  const list = document.getElementById("agentList");
  const items = [
    ["retrieval_samples", "Raw Retrieval Rows"],
    ["pseudo_start_samples", "Raw Pseudo-Start Rows"],
    ["rubric_samples", "Raw Rubric Rows"],
    ["alg4_grid_search_top", "Alg4 Grid Search"],
  ];
  list.innerHTML = items.map(([key, label], index) => `<div class="list-item ${index === 0 ? "active" : ""}" data-static-agent="${key}">${label}</div>`).join("");
  const show = (key, title) => {
    const rows = data[key] || [];
    document.getElementById("agentTitle").textContent = title;
    document.getElementById("agentSubtitle").textContent = "Excel raw data based experiment log.";
    document.getElementById("agentMetrics").innerHTML = [
      ["Loaded rows", rows.length.toLocaleString()],
      ["Primary field", "Description"],
      ["Start TRL policy", "Excluded except Algorithm 1 upper-bound"],
      ["Available algorithms", Object.keys(data.metrics || {}).length || 4],
    ].map(([name, value]) => `<div class="metric-row"><div class="muted">${name}</div><div>${value}</div></div>`).join("");
    document.getElementById("agentJson").textContent = formatJson({ selected_log_type: key, row_count: rows.length, field_policy: data.field_policy, sample_row: rows[0] || {}, metrics: data.metrics });
    drawRawAgentTable(rows);
  };
  list.addEventListener("click", (event) => {
    const item = event.target.closest("[data-static-agent]");
    if (!item) return;
    list.querySelectorAll(".list-item").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    show(item.dataset.staticAgent, item.textContent);
  });
  show(items[0][0], items[0][1]);
}

function drawRawAgentTable(rows) {
  const head = document.getElementById("agentSampleHead");
  const body = document.getElementById("agentSampleRows");
  if (!rows.length) {
    head.innerHTML = "";
    body.innerHTML = `<tr><td class="muted">No rows loaded.</td></tr>`;
    return;
  }
  const visible = rows.slice(0, 100);
  const cols = Object.keys(rows[0]).slice(0, 8);
  head.innerHTML = `<tr>${cols.map((col) => `<th>${col}</th>`).join("")}</tr>`;
  body.innerHTML = visible.map((row) => `<tr>${cols.map((col) => `<td>${renderCellStatus(String(row[col] ?? ""))}</td>`).join("")}</tr>`).join("") + `<tr><td colspan="${cols.length}" class="muted">Showing ${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} loaded intermediate rows.</td></tr>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const jobs = {
    hub: renderAgentHub,
    traces: renderAgentTraces,
    lineup: renderAgentLineup,
    crosscheck: renderAgentCrosscheckPage,
    "raw-logs": renderRawAgentLogs,
  };
  jobs[document.body.dataset.agentPage]?.().catch((error) => {
    document.querySelector(".main")?.insertAdjacentHTML("beforeend", `<section class="notice" style="margin-top:16px">${error.message}</section>`);
  });
});
