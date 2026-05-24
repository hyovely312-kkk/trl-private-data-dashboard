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
}).finally(() => renderExperimentDashboard()));

async function fetchOptionalText(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} not found`);
  return response.text();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.match(/(\"[^\"]*(?:\"\"[^\"]*)*\"|[^,]*)/g).filter((_, i) => i % 2 === 0).map((value) => value.replace(/^"|"$/g, "").replace(/""/g, "\""));
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function modelRole(model) {
  if (model.includes("alg1")) return "Upper-bound";
  if (model.includes("alg4")) return "Deployment-safe accuracy";
  if (model.includes("alg3")) return "Explainable deployment-safe";
  return "Main deployment-safe";
}

function drawChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!window.Chart) {
    drawCanvasFallback(canvas, config);
    return null;
  }
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  return new Chart(canvas, config);
}

function drawCanvasFallback(canvas, config) {
  const ctx = canvas.getContext("2d");
  const labels = config.data.labels || [];
  const dataset = config.data.datasets?.[0] || { label: "Data", data: [] };
  const values = dataset.data.map((value) => Number(value || 0));
  const width = canvas.width || 640;
  const height = canvas.height || 260;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#081525";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#e7f2ff";
  ctx.font = "14px sans-serif";
  ctx.fillText(dataset.label || "Chart", 18, 24);
  const max = Math.max(...values, 1);
  const barWidth = Math.max(18, (width - 50) / Math.max(values.length, 1) - 12);
  values.forEach((value, index) => {
    const barHeight = Math.max(4, (height - 86) * (value / max));
    const x = 24 + index * (barWidth + 12);
    const y = height - 42 - barHeight;
    ctx.fillStyle = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[index % dataset.backgroundColor.length] : (dataset.backgroundColor || "#22d3ee");
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#8fa7c2";
    ctx.font = "11px sans-serif";
    ctx.fillText(String(labels[index] || index + 1).slice(0, 12), x, height - 20);
    ctx.fillText(value > 1 ? Math.round(value).toLocaleString() : value.toFixed(2), x, y - 6);
  });
}

function renderStaticOverviewCharts(summary, leaderboard) {
  const dataset = summary.dataset || {};
  const labels = dataset.label_distribution || {};
  const models = summary.models || {};
  const total = Number(dataset.n_total || 0);
  const confidenceValues = Object.values(models).map((model) => Number(model.mean_confidence || model.test?.calibration_summary?.mean_confidence || 0));
  const avgConfidence = confidenceValues.reduce((sum, value) => sum + value, 0) / Math.max(confidenceValues.length, 1);

  document.querySelector("[data-total]").textContent = total.toLocaleString();
  document.querySelector("[data-low]").textContent = Number(labels.Low || 0).toLocaleString();
  document.querySelector("[data-mid]").textContent = Number(labels.Mid || 0).toLocaleString();
  document.querySelector("[data-high]").textContent = Number(labels.High || 0).toLocaleString();
  document.querySelector("[data-confidence]").textContent = pct(avgConfidence);
  document.querySelector("[data-missing]").textContent = "local";

  drawChart("monthlyChart", {
    type: "line",
    data: { labels: ["Batch experiment"], datasets: [{ label: "Analyzed rows", data: [total], borderColor: "#22d3ee", backgroundColor: "rgba(34,211,238,.16)", tension: 0.35, fill: true }] },
    options: chartOptions(),
  });
  drawChart("classChart", {
    type: "bar",
    data: { labels: ["Low", "Mid", "High"], datasets: [{ label: "End TRL label distribution", data: [labels.Low || 0, labels.Mid || 0, labels.High || 0], backgroundColor: ["#ff687d", "#f5c84c", "#38d996"] }] },
    options: chartOptions(),
  });
  drawChart("agentChart", {
    type: "radar",
    data: {
      labels: leaderboard.map((row) => row.model.replace("alg", "A")),
      datasets: [{ label: "Algorithm mean confidence", data: leaderboard.map((row) => Number(models[row.model]?.mean_confidence || 0)), borderColor: "#2f80ff", backgroundColor: "rgba(47,128,255,.18)" }],
    },
    options: chartOptions(),
  });
}

async function renderExperimentDashboard() {
  const status = document.getElementById("experimentStatus");
  if (!status) return;
  try {
    const [summary, leaderboardCsv, classwiseCsv, pseudoCsv, explanationsText] = await Promise.all([
      fetch("assets/data/dashboard_summary.json").then((r) => {
        if (!r.ok) throw new Error("dashboard_summary.json not found");
        return r.json();
      }),
      fetchOptionalText("assets/data/model_leaderboard.csv"),
      fetchOptionalText("assets/data/classwise_metrics.csv"),
      fetchOptionalText("assets/data/pseudo_start_distribution.csv"),
      fetchOptionalText("assets/data/sample_explanations.jsonl").catch(() => ""),
    ]);
    const leaderboard = parseCsv(leaderboardCsv);
    const classwise = parseCsv(classwiseCsv);
    const pseudo = parseCsv(pseudoCsv);
    const dataset = summary.dataset || {};
    const labelDistribution = dataset.label_distribution || {};
    const sourceCount = dataset.source_file_count || 1;
    const nTest = Number(dataset.n_test || 0);
    const avgAccuracy = leaderboard.reduce((sum, row) => sum + Number(row.test_accuracy || 0), 0) / Math.max(leaderboard.length, 1);
    const avgMacroF1 = leaderboard.reduce((sum, row) => sum + Number(row.test_macro_f1 || 0), 0) / Math.max(leaderboard.length, 1);
    renderStaticOverviewCharts(summary, leaderboard);
    status.textContent = `${Number(dataset.n_total).toLocaleString()} samples · ${leaderboard.length} algorithms · best safe accuracy: ${summary.best_deployment_safe_model_by_accuracy || summary.best_deployment_safe_model}`;
    document.getElementById("runSummaryStatus").textContent = `Source files: ${sourceCount} · Sheet: ${dataset.sheet || "Projects_Clean/Main_Data"}`;
    document.getElementById("experimentRunCards").innerHTML = [
      ["Raw rows", Number(dataset.n_total).toLocaleString(), "1 Excel workbook"],
      ["Train / Valid / Test", `${Number(dataset.n_train).toLocaleString()} / ${Number(dataset.n_valid).toLocaleString()} / ${Number(dataset.n_test).toLocaleString()}`, "70 / 15 / 15 stratified split"],
      ["Label distribution", `L ${labelDistribution.Low} · M ${labelDistribution.Mid} · H ${labelDistribution.High}`, "End TRL mapped to 3 classes"],
      ["Algorithm runs", `${leaderboard.length} × ${nTest.toLocaleString()}`, `${(leaderboard.length * nTest).toLocaleString()} held-out predictions`],
      ["Avg test accuracy", pct(avgAccuracy), "Mean across four algorithms"],
      ["Avg test Macro-F1", pct(avgMacroF1), "Mean across four algorithms"],
      ["Best upper-bound", summary.best_model_by_accuracy || summary.best_model_by_macro_f1, "Start TRL included"],
      ["Best safe accuracy", summary.best_deployment_safe_model_by_accuracy || summary.best_deployment_safe_model, "Start TRL excluded"],
    ].map(([label, value, note]) => `<div class="kpi"><span>${label}</span><strong>${value}</strong><span class="metric-note">${note}</span></div>`).join("");
    document.getElementById("algorithmRunRows").innerHTML = leaderboard.map((row) => {
      const model = row.model;
      const modelSummary = summary.models?.[model] || {};
      const meanConfidence = modelSummary.test?.calibration_summary?.mean_confidence ?? modelSummary.mean_confidence ?? "";
      return `
        <tr>
          <td>${model}</td>
          <td>${modelRole(model)}</td>
          <td>${row.uses_start_trl === "True" || row.uses_start_trl === "true" ? "Used" : "Excluded"}</td>
          <td>${nTest.toLocaleString()}</td>
          <td>${pct(row.test_accuracy)}</td>
          <td>${pct(row.test_macro_f1)}</td>
          <td>${meanConfidence === "" ? "-" : pct(meanConfidence)}</td>
          <td>${Number(row.test_mae).toFixed(3)}</td>
        </tr>
      `;
    }).join("");
    document.getElementById("leaderboardRows").innerHTML = leaderboard.map((row) => `
      <tr>
        <td>${row.model}</td>
        <td>${row.uses_start_trl === "True" || row.uses_start_trl === "true" ? "Used" : "Excluded"}</td>
        <td>${Number(row.test_accuracy).toFixed(3)}</td>
        <td>${Number(row.test_macro_f1).toFixed(3)}</td>
        <td>${Number(row.test_weighted_f1).toFixed(3)}</td>
        <td>${Number(row.test_mae).toFixed(3)}</td>
      </tr>
    `).join("");

    new Chart(document.getElementById("modelCompareChart"), {
      type: "bar",
      data: {
        labels: leaderboard.map((row) => row.model.replace("alg", "A")),
        datasets: [
          { label: "Accuracy", data: leaderboard.map((row) => Number(row.test_accuracy)), backgroundColor: "#22d3ee" },
          { label: "Macro-F1", data: leaderboard.map((row) => Number(row.test_macro_f1)), backgroundColor: "#38d996" },
        ],
      },
      options: chartOptions(),
    });

    const models = [...new Set(classwise.map((row) => row.model))];
    new Chart(document.getElementById("classwiseChart"), {
      type: "bar",
      data: {
        labels: models.map((x) => x.replace("alg", "A")),
        datasets: ["Low", "Mid", "High"].map((klass, idx) => ({
          label: `${klass} F1`,
          data: models.map((model) => Number(classwise.find((row) => row.model === model && row.class === klass)?.f1 || 0)),
          backgroundColor: ["#ff687d", "#f5c84c", "#38d996"][idx],
        })),
      },
      options: chartOptions(),
    });

    new Chart(document.getElementById("pseudoDistChart"), {
      type: "doughnut",
      data: { labels: pseudo.map((row) => row.bucket), datasets: [{ data: pseudo.map((row) => Number(row.count)), backgroundColor: ["#ff687d", "#f5c84c", "#38d996"] }] },
      options: { responsive: true, plugins: { legend: { labels: { color: "#e7f2ff" } } } },
    });

    const firstExplanation = explanationsText.trim().split(/\r?\n/).filter(Boolean)[0];
    document.getElementById("sampleExplanation").textContent = firstExplanation ? JSON.stringify(JSON.parse(firstExplanation), null, 2) : "No explanation samples exported yet.";
  } catch (error) {
    status.textContent = "Run trl_experiments to populate batch results.";
    document.getElementById("leaderboardRows").innerHTML = `<tr><td colspan="6" class="muted">${error.message}</td></tr>`;
  }
}
