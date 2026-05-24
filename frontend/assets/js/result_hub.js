const resultSubpages = [
  {
    title: "Final TRL Result",
    href: "result/final.html",
    note: "최종 class, TRL range, confidence, fusion 확률, 핵심 근거",
    metric: "Fusion output",
  },
  {
    title: "Description별 알고리즘 결과 탭",
    href: "result/description-tabs.html",
    note: "같은 Description을 Alg1~Alg4가 어떻게 예측했는지 탭으로 비교",
    metric: "Description primary input",
  },
  {
    title: "최종 TRL 판정 Reasoning",
    href: "result/reasoning.html",
    note: "한글 reasoning, 근거 문장, Judge Agent 충돌 분석",
    metric: "Explainable trace",
  },
  {
    title: "Raw Excel Batch Prediction Rows",
    href: "result/batch-rows.html",
    note: "raw Excel 기반 test rows와 알고리즘별 prediction 전체 조회",
    metric: "Batch rows",
  },
];

const resultAlgorithms = [
  ["Alg1 Full Fusion", "algorithms/alg1.html", "Start TRL 포함 upper-bound. 다른 no-start 실험과 분리 해석합니다."],
  ["Alg2 No-start Fusion", "algorithms/alg2.html", "Description 중심 retrieval + pseudo-start. Start TRL 미사용."],
  ["Alg3 Rubric Explainable", "algorithms/alg3.html", "Rubric evidence와 reasoning trace 중심. Start TRL 미사용."],
  ["Alg4 Grid SVC Retrieval", "algorithms/alg4.html", "성능 중심 deployment-safe 모델. Start TRL 미사용."],
];

function renderHubCards() {
  document.getElementById("resultSubpageCards").innerHTML = resultSubpages.map((item) => `
    <a class="lineup-card" href="${item.href}">
      <h3>${item.title}</h3>
      <p><strong>${item.metric}</strong></p>
      <p>${item.note}</p>
      <span class="button" style="display:inline-block;margin-top:8px">Open</span>
    </a>
  `).join("");

  document.getElementById("resultAlgorithmLinks").innerHTML = resultAlgorithms.map(([title, href, note]) => `
    <a class="lineup-card" href="${href}">
      <h3>${title}</h3>
      <p>${note}</p>
      <span class="button secondary" style="display:inline-block;margin-top:8px">View algorithm</span>
    </a>
  `).join("");
}

async function renderHubSummary() {
  renderHubCards();
  const [trace] = await fetchJsonl("assets/data/kotrl_x_reasoning_traces.jsonl", 1);
  const rows = await fetchCsv("assets/data/project_analysis_rows.csv");
  if (trace) {
    const fusion = trace.fusion_agent || {};
    const report = trace.report_agent || {};
    document.querySelector("[data-final-class]").innerHTML = renderCellStatus(trace.predicted_label);
    document.querySelector("[data-range]").textContent = fusion.예측TRL범위 || `${trace.predicted_label} range`;
    document.querySelector("[data-confidence]").textContent = confidencePct(trace.confidence);
    document.querySelector("[data-reason]").textContent = report.최종설명 || "Reasoning trace가 준비되어 있습니다.";
  }
  const targetCounts = rows.reduce((acc, row) => {
    acc[row.target_label] = (acc[row.target_label] || 0) + 1;
    return acc;
  }, {});
  document.getElementById("batchCoverage").innerHTML = `
    <div class="metric-row"><div class="muted">Loaded test rows</div><div>${rows.length.toLocaleString()} rows</div></div>
    <div class="metric-row"><div class="muted">Target distribution</div><div>Low ${targetCounts.Low || 0} · Mid ${targetCounts.Mid || 0} · High ${targetCounts.High || 0}</div></div>
    <div class="metric-row"><div class="muted">Raw source</div><div>Excel Description 기반 batch prediction export</div></div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHubSummary().catch((error) => {
    renderHubCards();
    document.querySelector(".main")?.insertAdjacentHTML("beforeend", `<section class="notice" style="margin-top:16px">${error.message}</section>`);
  });
});
