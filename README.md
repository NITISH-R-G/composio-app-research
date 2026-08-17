# Composio App-Research Pipeline

Research pass over 100 apps (10 categories) to answer: **auth method, self-serve vs
gated, API surface breadth, MCP availability, and agent-toolkit buildability** —
the questions Composio asks before building a toolkit for a new app.

**Live case study:** see the published Artifact link in the submission.
**Dataset:** [`data/results.json`](data/results.json) (100 records)
**Verification:** [`data/verification.json`](data/verification.json) (18-app independent audit)

## How this was actually run

The reference pipeline (`agent/research.py`) is written to call the Anthropic API's
`web_search` tool directly — that's the "run it yourself with an API key" path
described below. For this submission, the same research task (identical schema
and prompts, see `agent/schema.py`) was instead executed as **10 parallel Claude
Code subagents**, one per category, each independently researching its 10 apps with
real web search + doc fetches and returning cited JSON. That's the same
architecture (LLM + web search + strict schema), just orchestrated via the agent
runtime present in this environment instead of a bare API key loop. A separate
11th agent then re-verified 18 of those records from scratch, blind to the first
pass's reasoning, to produce the accuracy numbers below.

## Repo layout

```
agent/
  schema.py       # shared record schema + prompt template
  research.py     # reference pipeline: Anthropic API + web_search -> data/results.json
  verify.py       # samples N records, re-derives them independently, diffs vs original
data/
  apps.json       # the 100-app input list
  results.json    # 100 researched records (the dataset)
  verification.json  # 18-record independent audit output
site/
  case_study.html # the self-contained case-study page (also published as an Artifact)
```

## Running the research agent yourself

```bash
pip install anthropic requests
export ANTHROPIC_API_KEY=sk-ant-...
export COMPOSIO_API_KEY=...          # optional: cross-checks Composio's own toolkit registry

python agent/research.py --input data/apps.json --output data/results.json --limit 5   # smoke test
python agent/research.py --input data/apps.json --output data/results.json             # full 100
python agent/verify.py   --input data/results.json --sample 20 --output data/verification.json
```

Each call to `research_one()` gives Claude the `web_search` tool and a strict
JSON-schema prompt (`agent/schema.py`), asks for cited evidence URLs for every
claim, and retries once on malformed JSON. `verify.py` runs the same research
independently on a random sample and diffs the two answers per field, reporting
an agreement rate — this is the accuracy loop, not a single trusted pass.

## Where a human is needed

- **No public docs at all** (fanbasis, Paygent Connect): the agent correctly
  reports "couldn't find it" rather than guessing — but confirming an app truly
  has *no* public API (vs. just hard-to-find docs) needs a human to actually try
  signing up / emailing sales.
- **MCP existence** is the single most error-prone field — "unofficial community
  MCP servers exist" vs "official first-party MCP" is a nuance the agent
  sometimes blurs, and it's exactly the kind of claim that decays fast (new
  official MCP servers ship monthly). Treat `mcp_exists` as a lead to re-check,
  not a final answer, for anything not "confidence: high".
- **Self-serve classification for ad platforms and enterprise SaaS** (Google Ads,
  Meta Ads, Salesforce Commerce Cloud, DealCloud) involves judgment calls about
  what counts as "approval" vs "review" — a human should sanity-check the
  boundary cases before using this to prioritize build order.

## Honesty notes

- 6 of 100 records are `confidence: low` — the agent flagged these itself rather
  than guessing (MrScraper, Waterfall.io, higgsfield, Sherlock's MCP status,
  fanbasis, Paygent Connect). These are the apps that "defeated" straightforward
  research and need direct outreach.
- The independent verification pass (18 apps) found the agent's `buildability_verdict`
  and `self_serve` classification reliable, with the main error mode being
  `mcp_exists` drifting between "official" and "community-only" — see
  `data/verification.json` and the case-study page's verification section for
  the exact hit/miss breakdown.
