let allEvents = [];
let filtersBound = false;

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
  document.getElementById("eventRows").innerHTML = filtered.map((event) => `
    <tr>
      <td>${event.event_id}</td>
      <td>${event.created_at}</td>
      <td>${eventTitle(event)}</td>
      <td><span class="status ${event.final_class}">${event.final_class}</span></td>
      <td>${confidencePct(event.confidence)}</td>
      <td><button data-view="${event.event_id}">View</button></td>
    </tr>
  `).join("") || `<tr><td colspan="6" class="muted">No matching events.</td></tr>`;
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
  if (!allEvents.length) return renderStaticEvents(true);
  return renderStaticEvents(false);
}).catch(() => {
  document.getElementById("eventRows").innerHTML = `<tr><td colspan="6" class="muted">No event data file found.</td></tr>`;
}));

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

async function renderStaticEvents(useAsMain = false) {
  const allRows = await fetchCsv("assets/data/event_analysis_rows.csv");
  const rows = allRows.slice(0, 100);
  if (useAsMain) {
    allEvents = allRows.map(rowToStaticEvent);
    bindEventInteractions();
    applyFilters();
    if (allEvents[0]) renderDetail(allEvents[0]);
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
  `).join("") + `<tr><td colspan="6" class="muted">Showing ${rows.length.toLocaleString()} of ${allRows.length.toLocaleString()} test event rows. All rows are loaded in assets/data/event_analysis_rows.csv.</td></tr>`;
}
