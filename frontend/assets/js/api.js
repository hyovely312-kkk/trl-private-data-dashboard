const apiBase = () => new URLSearchParams(location.search).get("api_base") || localStorage.getItem("TRL_API_BASE") || "http://localhost:8000";

async function apiGet(path) {
  const response = await fetch(`${apiBase()}${path}`);
  if (!response.ok) throw new Error(`GET ${path} failed`);
  return response.json();
}

async function apiPost(path, body) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${path} failed`);
  return response.json();
}

function formatJson(data) {
  return JSON.stringify(data, null, 2);
}

function confidencePct(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function eventTitle(event) {
  return event?.input?.project_title || "Untitled project";
}

async function getLastEvent() {
  const eventId = new URLSearchParams(location.search).get("event_id") || localStorage.getItem("TRL_LAST_EVENT_ID");
  if (eventId) return apiGet(`/api/v1/trl/events/${eventId}`);
  const events = await apiGet("/api/v1/trl/events");
  return events[0];
}

async function fetchStaticText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} not found`);
  return response.text();
}

async function fetchStaticJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} not found`);
  return response.json();
}

function parseCsvRows(text) {
  const rows = [];
  let current = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }
  if (!rows.length) return [];
  const headers = rows[0];
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

async function fetchCsv(path) {
  return parseCsvRows(await fetchStaticText(path));
}

function renderCellStatus(value) {
  return ["Low", "Mid", "High"].includes(value) ? `<span class="status ${value}">${value}</span>` : value;
}
