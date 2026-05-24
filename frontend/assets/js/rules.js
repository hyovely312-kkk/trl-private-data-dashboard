async function renderRules() {
  const rules = await apiGet("/api/v1/trl/rules");
  document.getElementById("rulesBody").innerHTML = Object.entries(rules).map(([category, rule]) => `
    <tr>
      <td>${category}</td>
      <td><input value="${rule.keywords.join(", ")}"></td>
      <td><input type="number" step="0.01" value="${rule.weight}"></td>
      <td><input value="${rule.mapped_trl}"></td>
    </tr>
  `).join("");
  document.getElementById("rulesJson").textContent = formatJson(rules);
}

document.addEventListener("DOMContentLoaded", () => renderRules().catch((error) => {
  document.getElementById("rulesBody").innerHTML = `<tr><td colspan="4" class="muted">${error.message}. Start the backend.</td></tr>`;
}).finally(() => renderRuleAnalysisRows()));

async function renderRuleAnalysisRows() {
  const rows = await fetchCsv("assets/data/rules_analysis_rows.csv");
  document.getElementById("ruleAnalysisRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${row.category}</td>
      <td>${row.keywords}</td>
      <td>${row.purpose}</td>
      <td>${row.mapped_trl_range}</td>
    </tr>
  `).join("");
}
