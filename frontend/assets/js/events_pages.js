const eventsBase = location.pathname.includes("/events/") ? "../" : "";
const eventsData = (path) => `${eventsBase}assets/data/${path}`;
let pageEvents = [];
let rawEventRows = [];
let rawEventVisible = 500;

const eventsSubpages = [
  ["Event Lookup", "events/lookup.html", "필터와 상세 패널로 reasoning event JSON 조회"],
  ["실험 결과 라인업", "events/model-lineup.html", "Alg1 upper-bound와 no-start 모델 성능/정책 비교"],
  ["Raw Excel Event Rows", "events/raw-rows.html", "held-out test rows 2,114개 이벤트 테이블"],
];

async function renderEventsHub() {
  document.getElementById("eventsSubpageCards").innerHTML = eventsSubpages.map(([title, href, note]) => `
    <a class="lineup-card" href="${href}"><h3>${title}</h3><p>${note}</p><span class="button" style="display:inline-block;margin-top:8px">Open</span></a>
  `).join("");
  const rows = await fetchCsv(eventsData("event_analysis_rows.csv"));
  document.querySelector("[data-event-rows]").textContent = rows.length.toLocaleString();
}

function traceToEvent(trace, index) {
  return {
    event_id: `KOTRL-X-${String(index + 1).padStart(4, "0")}`,
    created_at: "batch-test-split",
    final_class: trace.predicted_label,
    confidence: Number(trace.confidence || 0),
    input: { project_id: trace.project_id, project_title: trace.project_title, target_label: trace.target_label, start_trl_policy: "main model excludes Start TRL" },
    retrieval_agent: trace.retrieval_agent,
    pseudo_start_agent: trace.pseudo_start_agent,
    rubric_agent: trace.rubric_agent,
    fusion_agent: trace.fusion_agent,
    judge_agent: trace.judge_agent,
    report_agent: trace.report_agent,
    full_reasoning_trace: trace,
  };
}

function applyEventFilters() {
  const keyword = document.getElementById("keyword").value.toLowerCase();
  const klass = document.getElementById("classFilter").value;
  const minConfidence = Number(document.getElementById("minConfidence").value || 0);
  const maxConfidence = Number(document.getElementById("maxConfidence").value || 1);
  const agentType = document.getElementById("agentType").value;
  const filtered = pageEvents.filter((event) => {
    const haystack = formatJson(agentType ? event[agentType] : event).toLowerCase();
    return (!klass || event.final_class === klass) && (event.confidence || 0) >= minConfidence && (event.confidence || 0) <= maxConfidence && (!keyword || haystack.includes(keyword) || eventTitle(event).toLowerCase().includes(keyword));
  });
  const visible = filtered.slice(0, 100);
  document.getElementById("eventRows").innerHTML = visible.map((event) => `
    <tr><td>${event.event_id}</td><td>${event.created_at}</td><td>${eventTitle(event)}</td><td>${renderCellStatus(event.final_class)}</td><td>${confidencePct(event.confidence)}</td><td><button data-view="${event.event_id}">View</button></td></tr>
  `).join("") + `<tr><td colspan="6" class="muted">Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} matching reasoning events.</td></tr>`;
}

function renderEventDetail(event) {
  document.getElementById("eventDetailTitle").textContent = `${event.event_id} · ${eventTitle(event)}`;
  document.getElementById("eventDetail").textContent = formatJson(event);
}

async function renderEventLookup() {
  const traces = await fetchJsonl(eventsData("kotrl_x_reasoning_traces.jsonl"));
  pageEvents = traces.map(traceToEvent);
  document.querySelector(".filters").addEventListener("input", applyEventFilters);
  document.getElementById("eventRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    const selected = pageEvents.find((item) => item.event_id === button.dataset.view);
    if (selected) renderEventDetail(selected);
  });
  applyEventFilters();
  if (pageEvents[0]) renderEventDetail(pageEvents[0]);
}

async function renderEventModelLineup() {
  const summary = await fetchStaticJson(eventsData("dashboard_summary.json"));
  const order = [
    ["alg1_full_fusion", "Upper-bound", "Start TRL 포함. 다른 deployment-safe 실험과 분리 해석."],
    ["alg2_no_start_pseudo_start", "No-start main", "Start TRL 제외. validation macro-F1 기준 safe 후보."],
    ["alg3_rubric_explainable", "Explainable", "Start TRL 제외. rubric evidence와 explanation 중심."],
    ["alg4_gridsearched_svc_retrieval", "Accuracy-safe", "Start TRL 제외. validation grid search 기반 accuracy 중심."],
  ];
  document.getElementById("eventModelCards").innerHTML = order.map(([key, badge, note]) => {
    const model = summary.models?.[key] || {};
    const test = model.test || {};
    return `<div class="lineup-card"><h3>${key}</h3><span class="status ${model.uses_start_trl ? "High" : "Mid"}">${badge}</span><p>Start TRL: ${model.uses_start_trl ? "사용함" : "사용 안 함"}</p><p>Test Acc ${((test.accuracy || 0) * 100).toFixed(1)}% · Macro-F1 ${(test.macro_f1 || 0).toFixed(3)}</p><p>${note}</p><p>이벤트 로그: ${Number(summary.dataset?.n_test || 0).toLocaleString()} rows</p></div>`;
  }).join("");
}

async function renderRawEventRows() {
  rawEventRows = await fetchCsv(eventsData("event_analysis_rows.csv"));
  document.getElementById("loadMoreStaticEvents").addEventListener("click", () => {
    rawEventVisible = Math.min(rawEventVisible + 500, rawEventRows.length);
    drawRawEventRows();
  });
  drawRawEventRows();
}

function drawRawEventRows() {
  const rows = rawEventRows.slice(0, rawEventVisible);
  const button = document.getElementById("loadMoreStaticEvents");
  button.disabled = rawEventVisible >= rawEventRows.length;
  button.textContent = button.disabled ? "All rows loaded" : "Load more";
  document.getElementById("staticEventRows").innerHTML = rows.map((row) => `
    <tr><td>${row.event_id}</td><td>${row.project_id}</td><td>${renderCellStatus(row.target_label)}</td><td>${renderCellStatus(row.deployment_safe_best_by_macro_f1)}</td><td>${renderCellStatus(row.deployment_safe_best_by_accuracy)}</td><td>${renderCellStatus(row.upper_bound_with_start_trl)}</td></tr>
  `).join("") + `<tr><td colspan="6" class="muted">Showing ${rows.length.toLocaleString()} of ${rawEventRows.length.toLocaleString()} test event rows. Alg1 is upper-bound only; deployment-safe columns exclude Start TRL.</td></tr>`;
}

document.addEventListener("DOMContentLoaded", () => {
  const jobs = { hub: renderEventsHub, lookup: renderEventLookup, "model-lineup": renderEventModelLineup, "raw-rows": renderRawEventRows };
  jobs[document.body.dataset.eventsPage]?.().catch((error) => {
    document.querySelector(".main")?.insertAdjacentHTML("beforeend", `<section class="notice" style="margin-top:16px">${error.message}</section>`);
  });
});
