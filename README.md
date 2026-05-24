# TRL Agentic Reasoning Dashboard

TRL Agentic Reasoning Dashboard v0.1 is a full-stack prototype for explaining Technology Readiness Level decisions from raw R&D project data.

The goal is not only to output a final class. The system exposes how raw project fields are transformed into intermediate Agent logs, including TF-IDF similarity, pseudo-start maturity signals, rubric evidence scores, weighted Fusion probabilities, and event-level replay logs.

## System Flow

Raw R&D Project Data  
→ Preprocessing Layer  
→ Retrieval Similarity Agent  
→ Pseudo-Start TRL Agent  
→ Rubric Evidence Agent  
→ Fusion Decision Agent  
→ Explanation Agent  
→ Dashboard / Event Log

## Backend

FastAPI endpoints:

- `POST /api/v1/trl/predict`
- `GET /api/v1/trl/events`
- `GET /api/v1/trl/events/{event_id}`
- `GET /api/v1/trl/rules`
- `GET /api/v1/trl/agents`

Run:

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Events are stored in `backend/data/event_logs.jsonl`. This keeps v0.1 simple while leaving a clear path to SQLite or PostgreSQL.

## Frontend

Static HTML/CSS/JavaScript with Chart.js and Mermaid.js.

Run:

```bash
cd frontend
python -m http.server 5500
```

Open:

```text
http://localhost:5500
```

The API base URL can be edited from the top-right API field on each page. The default is `http://localhost:8000`.

## GitHub Pages

The `frontend/` directory is static and can be deployed to GitHub Pages.

Recommended options:

- Push this repository to GitHub.
- Configure GitHub Pages to serve from the `frontend/` folder, or copy `frontend/` contents to a `gh-pages` branch.
- For hosted demos, point the API field to a reachable FastAPI backend URL.

## v0.1 Limitations

- Embedding is TF-IDF based, not Sentence-BERT.
- Pseudo-start TRL is rule-based keyword scoring.
- Fusion is rule-weighted, not a trained model.
- Rule editing UI is visual only. Persistence is planned for v0.2.
- JSONL storage is used instead of SQLite/PostgreSQL.

## PhD Dissertation Explanation Points

- Each Agent produces an explicit intermediate output.
- The dashboard makes the path visible: raw data → vector/score/distribution → Fusion feature vector → final class.
- The main model does not require Start TRL. If `start_trl_optional` is provided, it is isolated as a reference signal only.
- Event replay allows historical decisions to be inspected with the original input, Agent logs, Fusion values, and natural-language explanation.

## Sample Request

```json
{
  "project_title": "AI-based autonomous inspection robot",
  "description": "The prototype was validated in a laboratory environment.",
  "objective": "Develop an autonomous inspection robot.",
  "core_technology": "Edge AI vision system",
  "application_area": "Industrial safety",
  "validation_text": "No field demonstration has been conducted.",
  "commercialization_plan": "Pilot deployment is planned.",
  "program": "Sample Program",
  "primary_taxonomy": "AI / Robotics"
}
```
