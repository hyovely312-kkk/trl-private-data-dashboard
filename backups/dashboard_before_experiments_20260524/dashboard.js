async function renderDashboard() {
  const events = await apiGet("/api/v1/trl/events");
  const counts = { Low: 0, Mid: 0, High: 0 };
  let confidenceSum = 0;
  let missingEvidence = 0;
  const monthCounts = {};
  const agentConfidence = { Retrieval: [], "Pseudo-Start": [], Rubric: [], Fusion: [] };

  events.forEach((event) => {
    counts[event.final_class] = (counts[event.final_class] || 0) + 1;
    confidenceSum += event.confidence || 0;
    missingEvidence += event.rubric_log?.missing_evidence?.length ? 1 : 0;
    const month = (event.created_at || "").slice(0, 7) || "unknown";
    monthCounts[month] = (monthCounts[month] || 0) + 1;
    agentConfidence.Retrieval.push(event.retrieval_log?.mean_similarity || 0);
    agentConfidence["Pseudo-Start"].push(event.pseudo_start_log?.confidence || 0);
    agentConfidence.Rubric.push(Math.max(...Object.values(event.rubric_log?.rubric_scores || { x: 0 })));
    agentConfidence.Fusion.push(event.confidence || 0);
  });

  const avg = events.length ? confidenceSum / events.length : 0;
  document.querySelector("[data-total]").textContent = events.length;
  document.querySelector("[data-low]").textContent = counts.Low;
  document.querySelector("[data-mid]").textContent = counts.Mid;
  document.querySelector("[data-high]").textContent = counts.High;
  document.querySelector("[data-confidence]").textContent = confidencePct(avg);
  document.querySelector("[data-missing]").textContent = missingEvidence;

  const monthLabels = Object.keys(monthCounts).sort();
  new Chart(document.getElementById("monthlyChart"), {
    type: "line",
    data: { labels: monthLabels, datasets: [{ label: "Analyses", data: monthLabels.map((m) => monthCounts[m]), borderColor: "#22d3ee", backgroundColor: "rgba(34,211,238,.16)", tension: 0.35, fill: true }] },
    options: chartOptions(),
  });
  new Chart(document.getElementById("classChart"), {
    type: "bar",
    data: { labels: ["Low", "Mid", "High"], datasets: [{ label: "TRL Class", data: [counts.Low, counts.Mid, counts.High], backgroundColor: ["#ff687d", "#f5c84c", "#38d996"] }] },
    options: chartOptions(),
  });

  const agentLabels = Object.keys(agentConfidence);
  const avgAgent = agentLabels.map((label) => {
    const values = agentConfidence[label];
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  });
  new Chart(document.getElementById("agentChart"), {
    type: "radar",
    data: { labels: agentLabels, datasets: [{ label: "Average confidence", data: avgAgent, borderColor: "#2f80ff", backgroundColor: "rgba(47,128,255,.18)" }] },
    options: chartOptions(),
  });

  document.getElementById("recentEvents").innerHTML = events.slice(0, 8).map((event) => `
    <tr>
      <td>${event.event_id}</td>
      <td>${eventTitle(event)}</td>
      <td><span class="status ${event.final_class}">${event.final_class}</span></td>
      <td>${confidencePct(event.confidence)}</td>
      <td><a class="button" href="result.html?event_id=${event.event_id}">View</a></td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="muted">No events yet. Run an analysis from the input page.</td></tr>`;
}

function chartOptions() {
  return {
    responsive: true,
    plugins: { legend: { labels: { color: "#e7f2ff" } } },
    scales: {
      x: { ticks: { color: "#8fa7c2" }, grid: { color: "rgba(143,167,194,.12)" } },
      y: { ticks: { color: "#8fa7c2" }, grid: { color: "rgba(143,167,194,.12)" }, beginAtZero: true },
    },
  };
}

document.addEventListener("DOMContentLoaded", () => renderDashboard().catch((error) => {
  document.getElementById("recentEvents").innerHTML = `<tr><td colspan="5" class="muted">${error.message}. Start the FastAPI backend.</td></tr>`;
}));
