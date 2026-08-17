#!/usr/bin/env python3
"""
Composio App-Research Agent
============================
Researches auth model, self-serve status, API surface, MCP availability, and
agent-toolkit buildability for a list of apps, using the Anthropic API's
web_search tool (or, if COMPOSIO_API_KEY is set, cross-checks against
Composio's own toolkit registry to flag apps Composio has already integrated).

Usage:
    pip install anthropic requests
    export ANTHROPIC_API_KEY=sk-ant-...
    export COMPOSIO_API_KEY=...   # optional, enables the Composio cross-check
    python agent/research.py --input data/apps.json --output data/results.json
    python agent/research.py --input data/apps.json --output data/results.json --limit 5   # smoke test

What this script does:
  1. Loads the 100-app list (data/apps.json).
  2. For each app, calls Claude with the web_search tool and a strict JSON
     schema prompt (agent/schema.py), asking it to find and cite real docs
     pages for auth method, self-serve status, API surface, and MCP existence.
  3. Retries once on malformed JSON.
  4. (Optional) If COMPOSIO_API_KEY is set, looks up the app by slug against
     Composio's /api/v3/toolkits endpoint and attaches `composio_toolkit_exists`.
  5. Writes data/results.json (array of records matching schema.RECORD_KEYS).

Where a human is needed:
  - Apps with no public docs at all (contact-sales-only tools) come back with
    confidence="low" and an explicit blocker — a human should verify these by
    directly emailing/requesting a sales demo rather than trusting search results.
  - Ambiguous MCP existence (unofficial/community servers with no clear
    maintenance signal) should be spot-checked by a human before being marked
    "buildable today".
  - This script does NOT verify results — that's a separate pass, see
    agent/verify.py, which independently re-derives a sample and diffs it
    against this output to produce an accuracy score.
"""
import argparse
import json
import os
import re
import sys
import time

from schema import RECORD_KEYS, RESEARCH_PROMPT_TEMPLATE

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    import requests
except ImportError:
    requests = None


def extract_json(text):
    text = text.strip()
    text = re.sub(r"^```(json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON object found in model output")
    return json.loads(match.group(0))


def research_one(client, app_record, model="claude-sonnet-4-5"):
    prompt = RESEARCH_PROMPT_TEMPLATE.format(
        app=app_record["app"], hint=app_record["hint"], keys=", ".join(RECORD_KEYS)
    )
    for attempt in range(2):
        resp = client.messages.create(
            model=model,
            max_tokens=2000,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if b.type == "text")
        try:
            data = extract_json(text)
            data["app"] = app_record["app"]
            data.setdefault("category", app_record["category"])
            return data
        except Exception as e:
            if attempt == 0:
                continue
            return {
                "app": app_record["app"],
                "category": app_record["category"],
                "description": "PARSE_ERROR",
                "auth_method": "unknown",
                "self_serve": "unknown",
                "api_surface": "unknown",
                "mcp_exists": "unclear",
                "buildability_verdict": "unclear",
                "blocker": f"agent output could not be parsed: {e}",
                "evidence": [],
                "confidence": "low",
            }


def composio_toolkit_lookup(app_name, api_key):
    if not requests or not api_key:
        return "unchecked"
    slug = app_name.lower().split(" (")[0].strip().replace(" ", "_").replace(".", "")
    try:
        r = requests.get(
            f"https://backend.composio.dev/api/v3/toolkits/{slug}",
            headers={"x-api-key": api_key},
            timeout=10,
        )
        return r.status_code == 200
    except Exception:
        return "unchecked"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="data/apps.json")
    ap.add_argument("--output", default="data/results.json")
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--model", default="claude-sonnet-4-5")
    args = ap.parse_args()

    if anthropic is None:
        sys.exit("pip install anthropic first")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("set ANTHROPIC_API_KEY")

    client = anthropic.Anthropic(api_key=api_key)
    composio_key = os.environ.get("COMPOSIO_API_KEY")

    with open(args.input) as f:
        apps = json.load(f)
    if args.limit:
        apps = apps[: args.limit]

    results = []
    for i, app in enumerate(apps, 1):
        print(f"[{i}/{len(apps)}] researching {app['app']}...", file=sys.stderr)
        record = research_one(client, app, model=args.model)
        record["composio_toolkit_exists"] = composio_toolkit_lookup(app["app"], composio_key)
        results.append(record)
        time.sleep(0.5)

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
    print(f"wrote {len(results)} records to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
