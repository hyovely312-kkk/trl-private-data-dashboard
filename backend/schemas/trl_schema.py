from typing import Optional

from pydantic import BaseModel, Field


class TRLPredictRequest(BaseModel):
    project_title: str = ""
    description: str = ""
    objective: str = ""
    core_technology: str = ""
    application_area: str = ""
    validation_text: str = ""
    commercialization_plan: str = ""
    program: str = ""
    primary_taxonomy: str = ""
    start_trl_optional: Optional[int] = Field(default=None, ge=1, le=9)
