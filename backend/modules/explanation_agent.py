from typing import Dict


def run_explanation_agent(fusion_log: Dict, rubric_log: Dict, retrieval_log: Dict) -> Dict:
    final_class = fusion_log["final_class"]
    scores = rubric_log.get("rubric_scores", {})
    evidence = [item["sentence"] for item in rubric_log.get("evidence_sentences", [])[:5]]
    risk_factors = rubric_log.get("missing_evidence", [])

    if final_class == "High":
        reason = "The project is classified as High TRL because field, operation, or deployment evidence is strong and similar high-maturity projects were retrieved."
        next_actions = ["Collect long-term operational KPI data.", "Prepare production-scale validation documentation."]
    elif final_class == "Mid":
        reason = "The project is classified as Mid TRL because prototype, laboratory, or relevant environment evidence is detected while operational deployment evidence remains limited."
        next_actions = ["Conduct field demonstration in a relevant environment.", "Collect operational validation data."]
    else:
        reason = "The project is classified as Low TRL because the evidence is mostly principle-level or lacks validation and prototype maturity signals."
        next_actions = ["Define measurable laboratory validation criteria.", "Build and test an initial prototype or breadboard."]

    if scores.get("operation", 0) < 0.2 and "No operational environment or commercialization deployment evidence was detected." not in risk_factors:
        risk_factors.append("Operational deployment evidence is weak.")

    return {
        "agent_name": "Explanation Agent",
        "final_reason": reason,
        "key_evidence": evidence,
        "risk_factors": risk_factors,
        "recommended_next_action": next_actions,
        "retrieval_summary": f"Top similar projects averaged {retrieval_log.get('mean_similarity', 0):.2f} cosine similarity.",
    }
