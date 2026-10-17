"""Export all exact Pydantic contracts, including otherwise unreferenced requests. Owner B."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic.json_schema import models_json_schema

from app.contracts import (
    AgentResult,
    OfficialContact,
    PageCapture,
    PaymentCheck,
    PaymentRequest,
    Report,
    Signal,
    Source,
    StockXray,
)

MODELS = [
    PageCapture,
    Source,
    Signal,
    OfficialContact,
    Report,
    AgentResult,
    StockXray,
    PaymentRequest,
    PaymentCheck,
]
_, schema = models_json_schema([(model, "validation") for model in MODELS])
schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
schema["title"] = "SecondOpinionContracts"
schema["type"] = "object"
schema["properties"] = {
    model.__name__: {"$ref": f"#/$defs/{model.__name__}"} for model in MODELS
}
(ROOT / "contracts" / "schema.json").write_text(json.dumps(schema, indent=2) + "\n")
print("Exported contracts/schema.json")
