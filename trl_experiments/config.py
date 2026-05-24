from pathlib import Path


LABELS = ["Low", "Mid", "High"]
ORDINAL_MAP = {"Low": 0, "Mid": 1, "High": 2}
DEFAULT_TOP_K = 5
DEFAULT_RANDOM_STATE = 42
DEFAULT_WORD_MAX_FEATURES = 20000
DEFAULT_CHAR_MAX_FEATURES = 12000

REQUIRED_CANONICAL_COLUMNS = [
    "Project ID",
    "Project Title",
    "Program",
    "Primary TX",
    "Description",
    "Benefits",
    "Start TRL",
    "End TRL",
]

SHEET_FALLBACKS = ["Projects_Clean", "Main_Data", "Clean_Full_1to9"]


def resolve_default_input() -> Path:
    candidates = [
        Path("TechPort_cleaned_for_TRL_rule_search.xlsx"),
        Path("/Users/kimhyojin/Downloads/TechPort_cleaned_for_TRL_rule_search.xlsx"),
        Path("/Users/kimhyojin/Downloads/TRL_NASA_정제데이터.xlsx"),
        Path("/Users/kimhyojin/Downloads/TRL_Clean_Full_1to9_dataset.xlsx"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]
