const samplePayload = {
  project_title: "AI-based autonomous inspection robot",
  description: "The prototype was validated in a laboratory environment.",
  objective: "Develop an autonomous inspection robot.",
  core_technology: "Edge AI vision system",
  application_area: "Industrial safety",
  validation_text: "No field demonstration has been conducted.",
  commercialization_plan: "Pilot deployment is planned.",
  program: "Sample Program",
  primary_taxonomy: "AI / Robotics",
  start_trl_optional: null,
};

function fillSample() {
  Object.entries(samplePayload).forEach(([key, value]) => {
    const field = document.querySelector(`[name="${key}"]`);
    if (field) field.value = value ?? "";
  });
}

function collectForm() {
  const form = document.getElementById("projectForm");
  const data = Object.fromEntries(new FormData(form).entries());
  data.start_trl_optional = data.start_trl_optional ? Number(data.start_trl_optional) : null;
  return data;
}

document.addEventListener("DOMContentLoaded", () => {
  fillSample();
  renderRawProjectRows().catch(() => {
    const tbody = document.getElementById("rawProjectRows");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Raw Excel row data is available in the local/private dashboard export only. The public GitHub demo does not publish row-level project text.</td></tr>`;
    }
  });
  document.getElementById("sampleBtn").addEventListener("click", fillSample);
  document.getElementById("projectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("runStatus");
    status.textContent = "Running agent pipeline...";
    try {
      const result = await apiPost("/api/v1/trl/predict", collectForm());
      localStorage.setItem("TRL_LAST_EVENT_ID", result.event_id);
      localStorage.setItem("TRL_LAST_EVENT", JSON.stringify(result));
      location.href = `result.html?event_id=${result.event_id}`;
    } catch (error) {
      status.textContent = `${error.message}. Check API endpoint and backend server.`;
    }
  });
});

async function renderRawProjectRows() {
  let rows;
  try {
    rows = await fetchCsv("assets/data/raw_all_project_rows.csv");
  } catch (error) {
    rows = await fetchCsv("assets/data/project_analysis_rows.csv");
  }
  const tbody = document.getElementById("rawProjectRows");
  const input = document.getElementById("rawProjectSearch");
  const draw = () => {
    const q = (input.value || "").toLowerCase();
    const filteredAll = rows.filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
    const filtered = filteredAll.slice(0, 100);
    tbody.innerHTML = filtered.map((row) => `
      <tr>
        <td>${row.project_id}</td>
        <td>${row.project_title}</td>
        <td>${row.program}</td>
        <td>${row.primary_tx}</td>
        <td>${row.description_excerpt}</td>
        <td>${renderCellStatus(row.target_label)}</td>
      </tr>
    `).join("") + `<tr><td colspan="6" class="muted">Showing ${filtered.length.toLocaleString()} of ${filteredAll.length.toLocaleString()} matched rows. Total loaded rows: ${rows.length.toLocaleString()}.</td></tr>`;
  };
  input.addEventListener("input", draw);
  draw();
}
