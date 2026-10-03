from typing import Literal

from pydantic import BaseModel

ColumnTypeName = Literal["boolean", "integer", "float", "string"]


class DetectedColumn(BaseModel):
    name: str
    type: ColumnTypeName
