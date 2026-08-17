#!/usr/bin/env python3
"""
Independent verification pass.

Takes a random sample of already-researched records, re-derives each one from
scratch (fresh web_search calls, no knowledge of the first pass's answer), and
diffs the two on auth_method / self_serve / mcp_exists / buildability_verdict.
Reports an agreement rate per field -- this is the accuracy check, not a second
opinion that gets silently trusted.

Usage:
    python agent/verify.py --input data/results.json --sample 20 --output data/verification.json
"""
import argparse
import json
import random
import sys

from research import research_one, extract_json  # reuse the same call path
from schema import RECORD_KEYS

try:
    import anthropic
except ImportError:
    anthropic = None

FIELDS_TO_DIFF = ["auth_method", "self_serve", "mcp_exists", "buildability_verdict"]


def normalize(value):
    return str(value).strip().lower()[:40]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="data/results.json")
    ap.add_argument("--output", default="data/verification.json")
    ap.add_argument("--sample", type=int, default=20)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    if anthropic is None:
        sys.exit("pip install anthropic first")

    with open(args.input) as f:
        records = json.load(f)

    random.seed(args.seed)
    sample = random.sample(records, min(args.sample, len(records)))

    client = anthropic.Anthropic()
    report = []
    for original in sample:
        app_record = {"app": original["app"], "category": original["category"], "hint": ""}
        redo = research_one(client, app_record)

        diffs = {}
        for field in FIELDS_TO_DIFF:
            a, b = normalize(original.get(field)), normalize(redo.get(field))
            diffs[field] = "match" if a == b else f"MISMATCH: '{original.get(field)}' vs '{redo.get(field)}'"

        agree = sum(1 for v in diffs.values() if v == "match")
        report.append({
            "app": original["app"],
            "agreement": f"{agree}/{len(FIELDS_TO_DIFF)}",
            "diffs": diffs,
        })
        print(f"{original['app']}: {agree}/{len(FIELDS_TO_DIFF)} fields agree", file=sys.stderr)

    total_fields = len(sample) * len(FIELDS_TO_DIFF)
    total_match = sum(sum(1 for v in r["diffs"].values() if v == "match") for r in report)
    print(f"\noverall field agreement: {total_match}/{total_fields} ({100*total_match/total_fields:.0f}%)", file=sys.stderr)

    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)


if __name__ == "__main__":
    main()
