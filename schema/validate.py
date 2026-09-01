#!/usr/bin/env python3
"""Minimal, dependency-free validator for schema/releases/*/ai-ml-landscape.schema.json.

Deliberately not a full JSON Schema implementation and deliberately not wrapped in Docker (unlike
dome-schema's validator) -- this only needs to check one thing well: does a record have the right
top-level shape (required keys present, types match, enums respected)? That's enough to catch the
real failure mode here (a record missing a group, or a field with the wrong type), without taking
on a jsonschema dependency for a repo that otherwise has none.

Usage:
    python3 schema/validate.py schema/releases/v1.1.0/ai-ml-landscape.example.json
    python3 schema/validate.py schema/releases/v1.1.0/ai-ml-landscape.example.json --schema schema/releases/v1.1.0/ai-ml-landscape.schema.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCHEMA_DIR = Path(__file__).parent

_TYPE_MAP = {
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "array": list,
    "object": dict,
    "null": type(None),
}


def _check_type(value, type_spec) -> bool:
    types = type_spec if isinstance(type_spec, list) else [type_spec]
    for t in types:
        py_type = _TYPE_MAP.get(t)
        if py_type is None:
            continue
        # bool is a subclass of int in Python -- only accept it where "boolean" was actually listed
        if isinstance(value, bool) and py_type is int and "boolean" not in types:
            continue
        if isinstance(value, py_type):
            return True
    return False


def validate_node(value, spec: dict, path: str, errors: list[str]) -> None:
    if "type" in spec and not _check_type(value, spec["type"]):
        errors.append(f"{path}: expected type {spec['type']}, got {type(value).__name__}")
        return

    if "enum" in spec and value not in spec["enum"]:
        errors.append(f"{path}: {value!r} not in enum {spec['enum']}")

    if isinstance(value, dict) and spec.get("type") == "object":
        for req in spec.get("required", []):
            if req not in value:
                errors.append(f"{path}: missing required field '{req}'")
        for key, subspec in spec.get("properties", {}).items():
            if key in value:
                validate_node(value[key], subspec, f"{path}.{key}", errors)

    if isinstance(value, list) and spec.get("type") == "array" and "items" in spec:
        for i, item in enumerate(value):
            validate_node(item, spec["items"], f"{path}[{i}]", errors)


def validate(record: dict, schema: dict) -> list[str]:
    errors: list[str] = []
    validate_node(record, schema, "$", errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("record", type=Path, help="JSON file to validate (one record)")
    parser.add_argument(
        "--schema",
        type=Path,
        default=None,
        help="Schema file to validate against (default: CURRENT release's schema)",
    )
    args = parser.parse_args()

    if args.schema is None:
        current = (SCHEMA_DIR / "CURRENT").read_text().strip()
        args.schema = SCHEMA_DIR / "releases" / current / "ai-ml-landscape.schema.json"

    schema = json.loads(args.schema.read_text())
    record = json.loads(args.record.read_text())

    errors = validate(record, schema)
    if errors:
        print(f"NON-COMPLIANT: {args.record} against {args.schema}")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"COMPLIANT: {args.record} against {args.schema}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
