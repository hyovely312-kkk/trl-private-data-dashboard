import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


def _read_events(path: Path) -> List[Dict]:
    if not path.exists():
        return []
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            events.append(json.loads(line))
    return events


def next_event_id(path: Path) -> str:
    today = datetime.now().strftime("%Y%m%d")
    count = sum(1 for event in _read_events(path) if str(event.get("event_id", "")).startswith(f"EVT-{today}"))
    return f"EVT-{today}-{count + 1:04d}"


def append_event(path: Path, event: Dict) -> Dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event


def list_events(path: Path) -> List[Dict]:
    return list(reversed(_read_events(path)))


def get_event(path: Path, event_id: str) -> Optional[Dict]:
    for event in _read_events(path):
        if event.get("event_id") == event_id:
            return event
    return None
