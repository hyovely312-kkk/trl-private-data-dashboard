const agentTabs = [
  ["retrieval_log", "Retrieval Agent", "TF-IDF cosine similarity and top-k label distribution."],
  ["pseudo_start_log", "Pseudo-Start Agent", "Rule scoring from maturity expressions. Optional Start TRL is reference only."],
  ["rubric_log", "Rubric Evidence Agent", "Sentence-level evidence scoring by TRL category."],
  ["fusion_log", "Fusion Agent", "Rule-weighted fusion of retrieval, pseudo-start, and rubric features."],
  ["explanation", "Explanation Agent", "Natural-language reasoning, risks, and next actions."],
];

function renderAgentDetail(event, key, label, subtitle) {
  const log = event[key] || {};
  document.getElementById("agentTitle").textContent = label;
  document.getElementById("agentSubtitle").textContent = subtitle;
  const pairs = [
    ["Agent name", log.agent_name || label],
    ["Input fields", Array.isArray(log.input_fields) ? log.input_fields.join(", ") : "Derived from previous agents"],
    ["Processing", log.processing_method || log.embedding_method || log.calculation || "Rule-weighted decision and explanation"],
    ["Final output", log.final_class || log.pseudo_start_trl || event.final_class],
  ];
  document.getElementById("agentMetrics").innerHTML = pairs.map(([name, value]) => `
    <div class="metric-row"><div class="muted">${name}</div><div>${value}</div></div>
  `).join("");
  document.getElementById("agentJson").textContent = formatJson(log);
}

async function renderAgents() {
  const event = await getLastEvent();
  const list = document.getElementById("agentList");
  list.innerHTML = agentTabs.map(([key, label], index) => `<div class="list-item ${index === 0 ? "active" : ""}" data-agent="${key}">${label}</div>`).join("");
  renderAgentDetail(event, ...agentTabs[0]);
  list.addEventListener("click", (click) => {
    const item = click.target.closest("[data-agent]");
    if (!item) return;
    document.querySelectorAll(".list-item").forEach((el) => el.classList.remove("active"));
    item.classList.add("active");
    renderAgentDetail(event, ...agentTabs.find(([key]) => key === item.dataset.agent));
  });
}

document.addEventListener("DOMContentLoaded", () => renderAgents().catch((error) => {
  document.getElementById("agentJson").textContent = `${error.message}. Loading raw Excel experiment logs instead.`;
}).finally(() => renderStaticAgentRows().catch(() => {
  const body = document.getElementById("agentSampleRows");
  if (body) {
    body.innerHTML = `<tr><td class="muted">Agent intermediate row logs are local/private artifacts and are not published in the public GitHub demo.</td></tr>`;
  }
})));

async function renderStaticAgentRows() {
  const data = await fetchStaticJson("assets/data/agent_algorithm_logs.json");
  const list = document.getElementById("agentList");
  if (!list.dataset.staticBound) {
    if (!list.innerHTML.trim()) {
      list.innerHTML = "";
    }
    list.insertAdjacentHTML(list.innerHTML.trim() ? "beforeend" : "afterbegin", `
      <div class="list-item" data-static-agent="retrieval_samples">Raw Retrieval Rows</div>
      <div class="list-item" data-static-agent="pseudo_start_samples">Raw Pseudo-Start Rows</div>
      <div class="list-item" data-static-agent="rubric_samples">Raw Rubric Rows</div>
      <div class="list-item" data-static-agent="alg4_grid_search_top">Alg4 Grid Search</div>
    `);
    list.dataset.staticBound = "1";
    list.addEventListener("click", (click) => {
      const item = click.target.closest("[data-static-agent]");
      if (!item) return;
      document.querySelectorAll(".list-item").forEach((el) => el.classList.remove("active"));
      item.classList.add("active");
      renderStaticAgentDetail(data, item.dataset.staticAgent, item.textContent);
    });
  }
  const defaultItem = list.querySelector("[data-static-agent='retrieval_samples']");
  if (defaultItem) {
    document.querySelectorAll(".list-item").forEach((el) => el.classList.remove("active"));
    defaultItem.classList.add("active");
  }
  renderStaticAgentDetail(data, "retrieval_samples", "Raw Retrieval Rows");
  drawAgentSampleTable(data.retrieval_samples);
}

function renderStaticAgentDetail(data, key, title) {
  const rows = data[key] || [];
  const fieldPolicy = data.field_policy || {};
  const metrics = data.metrics || {};
  document.getElementById("agentTitle").textContent = title;
  document.getElementById("agentSubtitle").textContent = "Excel raw data based experiment log. The table below shows the first 100 loaded rows.";
  document.getElementById("agentMetrics").innerHTML = [
    ["Loaded rows", rows.length.toLocaleString()],
    ["Primary field", "Description"],
    ["Start TRL policy", "Excluded except Algorithm 1 upper-bound"],
    ["Available algorithms", Object.keys(metrics).length || 4],
  ].map(([name, value]) => `<div class="metric-row"><div class="muted">${name}</div><div>${value}</div></div>`).join("");
  document.getElementById("agentJson").textContent = formatJson({
    selected_log_type: key,
    row_count: rows.length,
    field_policy: fieldPolicy,
    sample_row: rows[0] || {},
    metrics,
  });
  drawAgentSampleTable(rows);
}

function drawAgentSampleTable(rows) {
  const head = document.getElementById("agentSampleHead");
  const body = document.getElementById("agentSampleRows");
  if (!rows.length) return;
  const visible = rows.slice(0, 100);
  const cols = Object.keys(rows[0]).slice(0, 8);
  head.innerHTML = `<tr>${cols.map((col) => `<th>${col}</th>`).join("")}</tr>`;
  body.innerHTML = visible.map((row) => `<tr>${cols.map((col) => `<td>${renderCellStatus(String(row[col] ?? ""))}</td>`).join("")}</tr>`).join("")
    + `<tr><td colspan="${cols.length}" class="muted">Showing ${visible.length.toLocaleString()} of ${rows.length.toLocaleString()} loaded intermediate rows.</td></tr>`;
}
