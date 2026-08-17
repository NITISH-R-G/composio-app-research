# App Toolkit Feasibility Research Pipeline

Takes a list of apps, researches each one against live developer documentation,
produces structured records with cited evidence, and runs an independent
verification pass over a sample.

Applied here to 100 apps across 10 categories: for each one, can Composio build an
agent toolkit today, and if not, what's actually stopping it.

100 apps, 90 buildable in some form, 56 shippable today, 18 independently
re-researched, 5 corrections. Credential access, not API existence, is the
largest practical constraint.

- **Live case study:** https://claude.ai/code/artifact/9d441301-2558-40c0-ad50-79a807fdec45
- **Repository:** https://github.com/NITISH-R-G/composio-app-research
- **Research agent:** [`agent/research.py`](agent/research.py)
- **Verification log:** [`data/verification.json`](data/verification.json), 18-app audit
- **Dataset:** [`data/results.json`](data/results.json), 100 records

---

## Result

| Measure | Apps | What it means |
|---|---|---|
| Documented public API | 97 | Public developer documentation exists |
| Known usable auth | 96 | An auth path could be established from the docs |
| Self-issued credentials | 74 | A developer can get credentials without contacting sales |
| Shippable today | 56 | No material access blocker |

90 of 100 are buildable in some form: 56 today, 34 with a limitation, 10 blocked.
The biggest drop is between credential access and immediate buildability, 18 apps.
Business verification, developer-token approval, sandbox provisioning, access
review, and commercial contracts account for it. None of it is about the APIs
themselves.

---

## Architecture

```
data/apps.json (100 apps: name, category, hint)
  |
  v
Category batching        10 batches of 10. A failed batch reruns without
  |                       touching the other nine.
  v
Parallel research workers   Each searches developer docs, auth pages,
  |                          pricing/access pages, and MCP references, then
  |                          fills the schema.
  v
Structured JSON + evidence   Every claim carries a source URL, or the field
  |                           is marked low confidence.
  v
Schema validation         Malformed output retried once, then recorded as a
  |                        parse error instead of dropped.
  v
data/results.json (100 merged records)
  |
  v
Independent verification   agent/verify.py re-researches a random sample from
  |                         scratch, with no access to the first pass's answers.
  v
Field-level comparison    4 decision-relevant fields per app, diffed.
  |
  v
Correction pass           Disagreements checked against sources, merged back.
  |
  v
Final dataset + audit log
```

### Files

| File | What it does |
|---|---|
| [`agent/schema.py`](agent/schema.py) | The record schema and the research prompt. |
| [`agent/research.py`](agent/research.py) | Runs the research pass: web search per app, JSON extraction, one retry on malformed output, optional Composio toolkit-registry cross-check. |
| [`agent/verify.py`](agent/verify.py) | Samples N records, re-derives each from scratch through the same call path, diffs 4 fields, reports an agreement rate. |
| [`data/apps.json`](data/apps.json) | Pipeline input. Swap this file to research a different app list. |
| [`site/build.js`](site/build.js) | Renders the dataset into the static memo. Every number on the page is computed from the data. |

### Schema

```
app  category  auth_method  self_serve  api_surface
mcp_exists  buildability_verdict  blocker  evidence  confidence
```

`evidence` is a list of URLs the worker actually used. `confidence` lets a worker
say it couldn't establish an answer instead of guessing. 6 of 100 records came back
low confidence.

---

## Running it

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export COMPOSIO_API_KEY=...   # optional, cross-checks Composio's existing toolkit registry

# smoke test against 5 apps
python agent/research.py --input data/apps.json --output data/results.json --limit 5

# full run
python agent/research.py --input data/apps.json --output data/results.json

# independent verification pass (18 apps, the sample used for this submission)
python agent/verify.py --input data/results.json --sample 18 --seed 42 --output data/verification.json

# rebuild the memo from the dataset
node site/build.js
```

### How this run differs from the reference script

`agent/research.py` calls the Anthropic API's `web_search` tool directly, the path
above. This submission's run used 10 parallel Claude Code subagents against the
same schema instead, because that's what was available in this environment. An
11th agent ran the independent re-research on 18 apps. Same schema and prompts,
different runtime.

---

## Verification

| | |
|---|---|
| Apps independently re-researched | 18 / 100 |
| Fields checked | 72 |
| Matched on first pass | 67 |
| Required correction | 5 |
| Agreement after correction | 72 / 72 |

93.1% first-pass agreement on the sampled fields, reaching full agreement after
the five disagreements were checked and corrected.

This does not mean all 100 records are accurate. The other 82 retain only their
first-pass confidence rating. The second pass re-researched each sampled app
independently rather than hand-checking every claim against first-party
documentation, so some corrections rest on credible secondary sources, each
linked in the log.

**Why 18 apps and 4 fields.** This was an engineering sample sized to the time
budget, not a statistically powered audit. 18 gave coverage across all 10
categories and was enough to expose failure modes. The 4 fields drive the
buildability decision (auth, credential access, API/MCP surface, verdict);
checking descriptive fields would have added checks without adding confidence
in the decision. A production version would stratify by category and confidence
and size the sample from the observed error rate.

### What the second pass caught

| App | Field | First-pass issue | Correction |
|---|---|---|---|
| Zendesk | `mcp_exists` | Recorded as having no official MCP server | A first-party MCP endpoint had shipped since |
| Harvest | `mcp_exists` | Recorded as having no MCP server | Several community MCP servers already existed |
| Ahrefs | `self_serve` | Described as Enterprise-only at $1,499/mo | Lower tiers get limited API access; Enterprise is about $1,249/mo |
| Ramp | `self_serve` | Sandbox described as self-serve | Sandbox provisioning requires an account manager |
| fanbasis | `api_surface` | Described as having no public documentation | A public API reference and SDK exist outside the gated portal |

Ramp is the clearest case: the worker found the API documentation correctly but
read "API exists" as "credentials are obtainable." Those are separate fields for
that reason. Ahrefs is a different failure mode: pricing and access tiers move,
so a confident number can go stale within months.

---

## Build-order tiers

Computed in [`site/build.js`](site/build.js) from `results.json`, not assigned by hand.

| Tier | Rule | Apps |
|---|---|---|
| P0: Build first | `buildable today` + free self-serve + MCP exists + not low confidence | 29 |
| P1: Fast follow | `buildable today`, not low confidence, not already P0 | 27 |
| P2: Build on demand | `buildable with limitation`, not low confidence | 30 |
| P3: Customer-led only | `blocked`, not low confidence | 8 |
| P4: Human validation first | `confidence: low` | 6 |

This ranks integration difficulty, not product priority. Customer demand,
revenue, and strategic value aren't in the dataset and would sit on top of this
before it becomes an actual roadmap.

---

## Limitations

- The dataset is a snapshot from August 2026. Access conditions, pricing, and MCP
  availability change. `mcp_exists` decays fastest since vendors ship official MCP
  servers monthly.
- 6 records need human review (listed on the memo). Public web evidence wasn't
  enough; confirming them needs account access, direct outreach, or a gated portal.
- Source quality isn't graded. First-party documentation and secondary sources are
  both recorded in `evidence` without being distinguished.
- The build order ranks integration difficulty, not product priority. Customer
  demand and strategic value aren't in the data.

## What I would build next

1. Freshness metadata: `retrieved_at` and `source_type` per evidence URL, so
   staleness is queryable instead of assumed.
2. A source hierarchy: official docs, official pricing/access pages, official
   announcements, credible secondary, unresolved, with the tier recorded.
3. Contradiction detection: when two sources disagree, flag it and queue for
   review instead of picking one silently.
4. Adaptive verification: sample low-confidence records, conflicting sources,
   and claims that decide a tier, instead of sampling uniformly.
5. Incremental re-research: rerun only records whose evidence has gone stale.
   This is what would let it scale past 100 apps.
