let allEvents = [];
let filtersBound = false;
let staticEventRowsCache = [];
let staticEventVisibleCount = 100;

function applyFilters() {
  const keyword = document.getElementById("keyword").value.toLowerCase();
  const klass = document.getElementById("classFilter").value;
  const minConfidence = Number(document.getElementById("minConfidence").value || 0);
  const maxConfidence = Number(document.getElementById("maxConfidence").value || 1);
  const agentType = document.getElementById("agentType").value;
  const filtered = allEvents.filter((event) => {
    const haystack = formatJson(agentType ? event[agentType] : event).toLowerCase();
    return (!klass || event.final_class === klass)
      && (event.confidence || 0) >= minConfidence
      && (event.confidence || 0) <= maxConfidence
      && (!keyword || haystack.includes(keyword) || eventTitle(event).toLowerCase().includes(keyword));
  });
  const visible = filtered.slice(0, 100);
  document.getElementById("eventRows").innerHTML = visible.map((event) => `
    <tr>
      <td>${event.event_id}</td>
      <td>${event.created_at}</td>
      <td>${eventTitle(event)}</td>
      <td><span class="status ${event.final_class}">${event.final_class}</span></td>
      <td>${confidencePct(event.confidence)}</td>
      <td><button data-view="${event.event_id}">View</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted">No matching events.</td></tr>`;
  if (filtered.length) {
    document.getElementById("eventRows").insertAdjacentHTML("beforeend", `<tr><td colspan="6" class="muted">Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} matching reasoning events.</td></tr>`);
  }
}

function renderDetail(event) {
  localStorage.setItem("TRL_LAST_EVENT_ID", event.event_id);
  document.getElementById("eventDetailTitle").textContent = `${event.event_id} · ${eventTitle(event)}`;
  document.getElementById("eventDetail").textContent = formatJson(event);
}

function bindEventInteractions() {
  if (filtersBound) return;
  filtersBound = true;
  document.querySelector(".filters").addEventListener("input", applyFilters);
  document.getElementById("eventRows").addEventListener("click", (click) => {
    const button = click.target.closest("[data-view]");
    if (!button) return;
    const event = allEvents.find((item) => item.event_id === button.dataset.view);
    if (event) renderDetail(event);
  });
}

async function renderEvents() {
  allEvents = await apiGet("/api/v1/trl/events");
  applyFilters();
  if (allEvents[0]) renderDetail(allEvents[0]);
  bindEventInteractions();
}

document.addEventListener("DOMContentLoaded", () => renderEvents().catch(() => renderStaticEvents(true)).then(() => {
  renderEventModelCards().catch(() => {});
  bindStaticEventLoadMore();
  if (!allEvents.length) return renderStaticEvents(true);
  return renderStaticEvents(false);
}).catch(() => {
  document.getElementById("eventRows").innerHTML = `<tr><td colspan="6" class="muted">No event data file found.</td></tr>`;
}));

async function renderEventModelCards() {
  const summary = await fetchStaticJson("assets/data/dashboard_summary.json");
  const target = document.getElementById("eventModelCards");
  if (!target) return;
  const order = [
    ["alg1_full_fusion", "Upper-bound", "Start TRL 포함. 다른 deployment-safe 실험과 분리 해석."],
    ["alg2_no_start_pseudo_start", "No-start main", "Start TRL 제외. validation macro-F1 기준 safe 후보."],
    ["alg3_rubric_explainable", "Explainable", "Start TRL 제외. rubric evidence와 explanation 중심."],
    ["alg4_gridsearched_svc_retrieval", "Accuracy-safe", "Start TRL 제외. validation grid search 기반 accuracy 중심."],
  ];
  target.innerHTML = order.map(([key, badge, note]) => {
    const model = summary.models?.[key] || {};
    const test = model.test || {};
    return `
      <div class="lineup-card">
        <h3>${key}</h3>
        <span class="status ${model.uses_start_trl ? "High" : "Mid"}">${badge}</span>
        <p>Start TRL: ${model.uses_start_trl ? "사용함" : "사용 안 함"}</p>
        <p>Test Acc ${((test.accuracy || 0) * 100).toFixed(1)}% · Macro-F1 ${(test.macro_f1 || 0).toFixed(3)}</p>
        <p>${note}</p>
        <p>이벤트 로그: ${Number(summary.dataset?.n_test || 0).toLocaleString()} rows</p>
      </div>
    `;
  }).join("");
}

function bindStaticEventLoadMore() {
  const button = document.getElementById("loadMoreStaticEvents");
  if (!button || button.dataset.bound) return;
  button.dataset.bound = "1";
  button.addEventListener("click", () => {
    staticEventVisibleCount = Math.min(staticEventVisibleCount + 500, staticEventRowsCache.length || staticEventVisibleCount);
    drawStaticEventRows();
  });
}

function rowToStaticEvent(row) {
  const confidence = Number(row.alg4_gridsearched_svc_retrieval_confidence || row.alg2_no_start_pseudo_start_confidence || row.alg1_full_fusion_confidence || 0);
  return {
    event_id: row.event_id,
    created_at: "batch-test-split",
    final_class: row.deployment_safe_best_by_accuracy || row.alg4_gridsearched_svc_retrieval_pred || row.target_label,
    confidence,
    input: {
      project_id: row.project_id,
      project_title: row.project_title,
      program: row.program,
      primary_taxonomy: row.primary_tx,
      description: row.description_excerpt,
      benefits: row.benefits_excerpt,
      start_trl_reference_only: row.start_trl_reference_only,
      end_trl: row.end_trl_label_source,
      target_label: row.target_label,
    },
    agent_outputs: {
      alg1_upper_bound_with_start_trl: {
        predicted_label: row.alg1_full_fusion_pred,
        confidence: Number(row.alg1_full_fusion_confidence || 0),
      },
      alg2_no_start_pseudo_start: {
        predicted_label: row.alg2_no_start_pseudo_start_pred,
        confidence: Number(row.alg2_no_start_pseudo_start_confidence || 0),
      },
      alg3_rubric_explainable: {
        predicted_label: row.alg3_rubric_explainable_pred,
        confidence: Number(row.alg3_rubric_explainable_confidence || 0),
      },
      alg4_gridsearched_svc_retrieval: {
        predicted_label: row.alg4_gridsearched_svc_retrieval_pred,
        confidence: Number(row.alg4_gridsearched_svc_retrieval_confidence || 0),
      },
    },
  };
}

function traceToStaticEvent(trace, index) {
  return {
    event_id: `KOTRL-X-${String(index + 1).padStart(4, "0")}`,
    created_at: "batch-test-split",
    final_class: trace.predicted_label,
    confidence: Number(trace.confidence || 0),
    input: {
      project_id: trace.project_id,
      project_title: trace.project_title,
      target_label: trace.target_label,
      start_trl_policy: "main model excludes Start TRL",
    },
    retrieval_agent: trace.retrieval_agent,
    pseudo_start_agent: trace.pseudo_start_agent,
    rubric_agent: trace.rubric_agent,
    fusion_agent: trace.fusion_agent,
    judge_agent: trace.judge_agent,
    report_agent: trace.report_agent,
    full_reasoning_trace: trace,
  };
}

async function renderStaticEvents(useAsMain = false) {
  const allRows = await fetchCsv("assets/data/event_analysis_rows.csv");
  staticEventRowsCache = allRows;
  if (useAsMain) {
    try {
      const traces = await fetchJsonl("assets/data/kotrl_x_reasoning_traces.jsonl");
      allEvents = traces.map(traceToStaticEvent);
    } catch (error) {
      allEvents = allRows.map(rowToStaticEvent);
    }
    bindEventInteractions();
    applyFilters();
    if (allEvents[0]) renderDetail(allEvents[0]);
  }
  drawStaticEventRows();
}

function drawStaticEventRows() {
  const rows = staticEventRowsCache.slice(0, staticEventVisibleCount);
  const button = document.getElementById("loadMoreStaticEvents");
  if (button) {
    button.disabled = staticEventVisibleCount >= staticEventRowsCache.length;
    button.textContent = staticEventVisibleCount >= staticEventRowsCache.length ? "All rows loaded" : "Load more";
  }
  document.getElementById("staticEventRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.event_id}</td>
      <td>${row.project_id}</td>
      <td>${renderCellStatus(row.target_label)}</td>
      <td>${renderCellStatus(row.deployment_safe_best_by_macro_f1)}</td>
      <td>${renderCellStatus(row.deployment_safe_best_by_accuracy)}</td>
      <td>${renderCellStatus(row.upper_bound_with_start_trl)}</td>
    </tr>
  `).join("") + `<tr><td colspan="6" class="muted">Showing ${rows.length.toLocaleString()} of ${staticEventRowsCache.length.toLocaleString()} test event rows. Alg1 is shown only as upper-bound; deployment-safe columns exclude Start TRL.</td></tr>`;
}
