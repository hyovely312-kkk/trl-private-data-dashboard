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

let rawProjectRowsCache = [];
let excelWorkbook = null;

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
  }
  return "";
}

function excerpt(value, limit = 180) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function labelFromEndTrl(value) {
  const n = Number(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n <= 3) return "Low";
  if (n <= 6) return "Mid";
  return "High";
}

function normalizeProjectRow(row, index = 0) {
  const projectId = pick(row, ["Project ID", "project_id", "Project_ID", "id"]) || `EXCEL-${String(index + 1).padStart(5, "0")}`;
  const title = pick(row, ["Project Title", "project_title", "title", "Title"]);
  const description = pick(row, ["Description", "description", "description_excerpt"]);
  const benefits = pick(row, ["Benefits", "benefits", "benefits_excerpt"]);
  const program = pick(row, ["Program", "program"]);
  const primaryTx = pick(row, ["Primary TX", "Primary Taxonomy", "primary_tx", "primary_taxonomy"]);
  const endTrl = pick(row, ["End TRL", "end_trl"]);
  const label = pick(row, ["target_label", "end_trl_class", "End label"]) || labelFromEndTrl(endTrl);
  return {
    project_id: projectId,
    project_title: title,
    program,
    primary_tx: primaryTx,
    description,
    benefits,
    description_excerpt: pick(row, ["description_excerpt"]) || excerpt(description),
    benefits_excerpt: pick(row, ["benefits_excerpt"]) || excerpt(benefits),
    start_trl_reference_only: pick(row, ["Start TRL", "start_trl_reference_only", "start_trl"]),
    end_trl: endTrl,
    target_label: label,
  };
}

function fillFormFromProjectRow(row) {
  const payload = {
    project_title: row.project_title || "",
    description: row.description || row.description_excerpt || "",
    objective: "",
    core_technology: row.primary_tx || "",
    application_area: row.primary_tx || "",
    validation_text: row.description || row.description_excerpt || "",
    commercialization_plan: row.benefits || row.benefits_excerpt || "",
    program: row.program || "",
    primary_taxonomy: row.primary_tx || "",
    start_trl_optional: row.start_trl_reference_only || "",
  };
  Object.entries(payload).forEach(([key, value]) => {
    const field = document.querySelector(`[name="${key}"]`);
    if (field) field.value = value ?? "";
  });
  const status = document.getElementById("runStatus");
  if (status) status.textContent = `${row.project_id} loaded into the input form. Description remains the primary TRL field.`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
  fillSample();
  renderRawProjectRows().catch(() => {
    const tbody = document.getElementById("rawProjectRows");
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">Raw Excel row data is available in the local/private dashboard export only. You can also select an Excel file above and load it directly in this browser.</td></tr>`;
    }
  });
  document.getElementById("sampleBtn").addEventListener("click", fillSample);
  setupExcelConnector();
  document.getElementById("rawProjectRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-load-row]");
    if (!button) return;
    const row = rawProjectRowsCache[Number(button.dataset.loadRow)];
    if (row) fillFormFromProjectRow(row);
  });
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
  drawRawProjectRows(rows.map(normalizeProjectRow), "dashboard CSV export");
}

function drawRawProjectRows(rows, sourceLabel = "loaded data") {
  rawProjectRowsCache = rows;
  const tbody = document.getElementById("rawProjectRows");
  const input = document.getElementById("rawProjectSearch");
  const draw = () => {
    const q = (input.value || "").toLowerCase();
    const filteredAll = rows.filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
    const filtered = filteredAll.slice(0, 100);
    tbody.innerHTML = filtered.map((row) => {
      const sourceIndex = rows.indexOf(row);
      return `
      <tr>
        <td>${escapeHtml(row.project_id)}</td>
        <td>${escapeHtml(row.project_title)}</td>
        <td>${escapeHtml(row.program)}</td>
        <td>${escapeHtml(row.primary_tx)}</td>
        <td>${escapeHtml(row.description_excerpt)}</td>
        <td>${renderCellStatus(row.target_label)}</td>
        <td class="row-action"><button type="button" class="secondary" data-load-row="${sourceIndex}">Use Row</button></td>
      </tr>
    `;
    }).join("") + `<tr><td colspan="7" class="muted">Showing ${filtered.length.toLocaleString()} of ${filteredAll.length.toLocaleString()} matched rows from ${escapeHtml(sourceLabel)}. Total loaded rows: ${rows.length.toLocaleString()}.</td></tr>`;
  };
  input.addEventListener("input", draw);
  draw();
}

function setupExcelConnector() {
  const fileInput = document.getElementById("excelFileInput");
  const sheetSelect = document.getElementById("excelSheetSelect");
  const loadButton = document.getElementById("excelLoadSheetBtn");
  const status = document.getElementById("excelLoadStatus");
  if (!fileInput || !sheetSelect || !loadButton || !status) return;
  status.textContent = window.XLSX
    ? "Excel parser ready. Select the NASA TRL workbook."
    : "Excel parser is unavailable. Check assets/vendor/xlsx.full.min.js.";

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!window.XLSX) {
      status.textContent = "Excel parser could not be loaded. Check internet access for the SheetJS CDN.";
      return;
    }
    status.textContent = `Reading ${file.name}...`;
    try {
      const buffer = await file.arrayBuffer();
      excelWorkbook = window.XLSX.read(buffer, { type: "array" });
      const preferred = ["Projects_Clean", "Main_Data"].find((name) => excelWorkbook.SheetNames.includes(name));
      sheetSelect.innerHTML = excelWorkbook.SheetNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
      sheetSelect.value = preferred || excelWorkbook.SheetNames[0] || "";
      sheetSelect.disabled = false;
      loadButton.disabled = false;
      status.textContent = `${file.name} loaded. ${excelWorkbook.SheetNames.length} sheet(s) found.`;
      loadExcelSheetRows();
    } catch (error) {
      excelWorkbook = null;
      sheetSelect.disabled = true;
      loadButton.disabled = true;
      status.textContent = `Excel load failed: ${error.message}`;
    }
  });

  sheetSelect.addEventListener("change", loadExcelSheetRows);
  loadButton.addEventListener("click", loadExcelSheetRows);
}

function loadExcelSheetRows() {
  const sheetSelect = document.getElementById("excelSheetSelect");
  const status = document.getElementById("excelLoadStatus");
  if (!excelWorkbook || !sheetSelect?.value) return;
  const worksheet = excelWorkbook.Sheets[sheetSelect.value];
  const rawRows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  const rows = rawRows.map(normalizeProjectRow);
  drawRawProjectRows(rows, `Excel sheet ${sheetSelect.value}`);
  status.textContent = `${rows.length.toLocaleString()} rows loaded from ${sheetSelect.value}. Description is the primary analysis text; Start TRL remains reference only.`;
}
