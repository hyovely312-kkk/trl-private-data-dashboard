import json
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from modules.event_store import append_event, get_event, list_events, next_event_id
from modules.explanation_agent import run_explanation_agent
from modules.fusion_agent import run_fusion_agent
from modules.preprocessing import project_to_log_input
from modules.pseudo_start_agent import run_pseudo_start_agent
from modules.retrieval_agent import run_retrieval_agent
from modules.rubric_agent import run_rubric_agent
from schemas.trl_schema import TRLPredictRequest


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SAMPLE_PROJECTS = DATA_DIR / "sample_projects.csv"
RULES_PATH = DATA_DIR / "sample_rules.json"
EVENT_LOGS = DATA_DIR / "event_logs.jsonl"

app = FastAPI(title="TRL Agentic Reasoning Dashboard API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "TRL Agentic Reasoning Dashboard API"}


@app.post("/api/v1/trl/predict")
def predict(payload: TRLPredictRequest):
    project = payload.model_dump()
    retrieval_log = run_retrieval_agent(project, SAMPLE_PROJECTS)
    pseudo_start_log = run_pseudo_start_agent(project)
    rubric_log = run_rubric_agent(project, RULES_PATH)
    fusion_log = run_fusion_agent(retrieval_log, pseudo_start_log, rubric_log)
    explanation = run_explanation_agent(fusion_log, rubric_log, retrieval_log)
    event_id = next_event_id(EVENT_LOGS)

    event = {
        "event_id": event_id,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "input": project_to_log_input(project),
        "retrieval_log": retrieval_log,
        "pseudo_start_log": pseudo_start_log,
        "rubric_log": rubric_log,
        "fusion_log": fusion_log,
        "explanation": explanation,
        "final_class": fusion_log["final_class"],
        "predicted_trl_range": fusion_log["predicted_trl_range"],
        "confidence": fusion_log["probabilities"][fusion_log["final_class"]],
    }
    append_event(EVENT_LOGS, event)
    return event


@app.get("/api/v1/trl/events")
def events():
    return list_events(EVENT_LOGS)


@app.get("/api/v1/trl/events/{event_id}")
def event_detail(event_id: str):
    event = get_event(EVENT_LOGS, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@app.get("/api/v1/trl/rules")
def rules():
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


@app.get("/api/v1/trl/agents")
def agents():
    return {
        "system_name": "TRL Agentic Reasoning Dashboard",
        "agents": [
            {
                "name": "Retrieval Similarity Agent",
                "purpose": "Calculate TF-IDF cosine similarity against historical projects and produce TRL label distribution.",
                "main_inputs": ["project_title", "description", "objective", "core_technology", "application_area", "validation_text"],
            },
            {
                "name": "Pseudo-Start TRL Agent",
                "purpose": "Infer pseudo-start maturity from text without directly using optional Start TRL.",
                "main_inputs": ["description", "objective", "validation_text", "commercialization_plan"],
            },
            {
                "name": "Rubric Evidence Agent",
                "purpose": "Detect TRL rubric evidence by category and sentence.",
                "main_inputs": ["description", "objective", "validation_text", "commercialization_plan"],
            },
            {
                "name": "Fusion Decision Agent",
                "purpose": "Fuse retrieval distribution, pseudo-start score, and rubric scores into final class probabilities.",
            },
            {
                "name": "Explanation Agent",
                "purpose": "Generate professor-readable explanation, risks, and recommended next actions.",
            },
        ],
    }
