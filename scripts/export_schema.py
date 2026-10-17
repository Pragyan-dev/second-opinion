"""Export every Pydantic contract directly from the source of truth. Owner B."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

from app import contracts

MODELS = [
    value
    for value in vars(contracts).values()
    if isinstance(value, type)
    and issubclass(value, BaseModel)
    and value.__module__ == contracts.__name__
]
_, schema = models_json_schema([(model, "validation") for model in MODELS])
schema.update(
    {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "SecondOpinionContracts",
        "type": "object",
        "properties": {model.__name__: {"$ref": f"#/$defs/{model.__name__}"} for model in MODELS},
    }
)
(ROOT / "contracts/schema.json").write_text(json.dumps(schema, indent=2) + "\n")
print("Exported contracts/schema.json")
