# App Toolkit Feasibility Research Pipeline

A reusable research pipeline that takes a list of apps, researches each one against
live developer documentation, produces structured records with cited evidence, and
runs an independent verification pass over a sample.

Applied here to 100 apps across 10 categories, answering the question Composio asks
before building a toolkit: **can we build an agent toolkit for this app today, and if
not, what is actually stopping us?**

- **Live memo:** the published case study (link in the submission)
- **Dataset:** [`data/results.json`](data/results.json) — 100 records
- **Verification log:** [`data/verification.json`](data/verification.json) — 18-app audit

---

## Headline result

**Credential access is a larger practical constraint than API availability.**

| Measure | Apps | What it means |
|---|---|---|
| Documented public API | 97 | Public developer documentation exists |
| Known usable auth | 96 | An auth path could be established from the docs |
| Self-issued credentials | 74 | A developer can get credentials without contacting sales |
| Shippable today | 56 | No material access blocker |

90 of 100 are buildable in some form: 56 today, 34 with a limitation, 10 blocked.
The largest drop is between credential access and immediate buildability — business
verification, developer-token approval, sandbox provisioning, access review, and
commercial contracts, not anything about the APIs themselves.

---

## Architecture

```
Input:  data/apps.json  (100 apps, name + category + hint)
   |
   v
Category batching            10 batches of 10 — bounded context per unit of work,
   |                         and a clean re-run boundary if one batch fails
   v
Parallel research workers    each searches developer docs, auth pages, pricing/access
   |                         pages and MCP references; judges evidence; fills the schema
   v
Structured JSON + evidence   every claim carries a source URL, or is marked low confidence
   |
   v
Schema validation            malformed output retried once, then recorded as a parse error
   |                         rather than silently dropped
   v
data/results.json            100 merged records
   |
   v
Independent verification     agent/verify.py re-researches a random sample from scratch,
   |                         with no access to the first pass's answers
   v
Field-level comparison       4 decision-relevant fields per app, diffed
   |
   v
Correction pass              disagreements resolved against sources, merged back
   |
   v
Final dataset + audit log
```

### Components

| File | Responsibility |
|---|---|
| [`agent/schema.py`](agent/schema.py) | The record schema and the research prompt template. This is the control surface — constraining output shape limits what a worker can claim. |
| [`agent/research.py`](agent/research.py) | Runs the research pass: web search per app, strict JSON extraction, one retry on malformed output, optional Composio toolkit-registry cross-check. |
| [`agent/verify.py`](agent/verify.py) | Runs the independent pass: samples N records, re-derives each from scratch via the same call path, diffs 4 fields, reports an agreement rate. |
| [`data/apps.json`](data/apps.json) | Pipeline input. Swap this file to research a different set. |
| [`site/build.js`](site/build.js) | Renders the dataset into the static memo. All figures are computed from the data, never hardcoded. |

### The schema

```
app  category  auth_method  self_serve  api_surface
mcp_exists  buildability_verdict  blocker  evidence  confidence
```

`evidence` is a list of URLs the worker actually used. `confidence` lets a worker say
*I could not establish this* instead of producing a fluent guess — 6 of 100 records
came back low confidence, which is a correct outcome, not a failure.

---

## Running it

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...
export COMPOSIO_API_KEY=...   # optional — cross-checks Composio's existing toolkit registry

# smoke test against 5 apps
python agent/research.py --input data/apps.json --output data/results.json --limit 5

# full run
python agent/research.py --input data/apps.json --output data/results.json

# independent verification pass
python agent/verify.py --input data/results.json --sample 20 --output data/verification.json

# rebuild the memo from the dataset
node site/build.js
```

### How this submission was actually run

`agent/research.py` is written against the Anthropic API's `web_search` tool — the
path above. For this submission the same task, schema, and prompts were executed as
**10 parallel Claude Code subagents**, one per category, because that runtime was
what this environment provided. Same architecture — LLM plus web search under a fixed
cited-JSON schema — different orchestration. An 11th agent then ran the verification
pass. This is stated plainly rather than implied, because the two paths are not
identical and the interview should be able to probe either.

---

## Verification: what the number means

| | |
|---|---|
| Apps independently re-researched | 18 / 100 |
| Fields checked | 72 |
| Matched on first pass | 67 |
| Required correction | 5 |
| Agreement after correction | 72 / 72 |

**93.1% first-pass agreement on the sampled fields, reaching full agreement after the
five disagreements were investigated and corrected.**

This is **not** a claim that all 100 records are accurate. The other 82 retain only
their first-pass confidence rating. The second pass re-researched each sampled app
independently rather than hand-checking every claim against first-party documentation,
so some corrections rest on credible secondary sources — each is linked in the log.

**Why 18, and why 4 fields?** This was an engineering verification sample, not a
statistically powered audit. 18 gave coverage across all 10 categories within the time
budget and was enough to expose failure modes. The 4 fields are the ones that drive the
buildability decision — auth, credential access, API/MCP surface, and the verdict —
so checking descriptive fields would have added checks without adding confidence in the
decision. A production version would stratify sampling by category and confidence, and
size the sample from the observed error rate.

### What the second pass caught

| App | Field | First-pass issue | Correction |
|---|---|---|---|
| Zendesk | `mcp_exists` | Recorded as having no official MCP server | A first-party MCP endpoint had shipped since |
| Harvest | `mcp_exists` | Recorded as having no MCP server | Several community MCP servers already existed |
| Ahrefs | `self_serve` | Described as Enterprise-only at $1,499/mo | Lower tiers get limited API access; Enterprise is ~$1,249/mo |
| Ramp | `self_serve` | Sandbox described as self-serve | Sandbox provisioning requires an account manager |
| fanbasis | `api_surface` | Described as having no public documentation | A public API reference and SDK exist outside the gated portal |

The errors cluster in two fields, and that is the useful finding. **Ramp** is the
clearest: the worker found the API documentation correctly but conflated *API exists*
with *credentials are obtainable*. That is exactly the distinction this research is
supposed to make, which is why they are separate fields rather than one broad
"API available" judgment. **Ahrefs** shows the other mode — pricing and access tiers
are volatile, and a confident number can be stale within months.

---

## Known limitations

- **The dataset is a dated snapshot** (August 2026). Access conditions, pricing, and
  MCP availability change. `mcp_exists` in particular decays fast — vendors ship
  official MCP servers monthly.
- **6 records need human review**, listed on the memo. Public web evidence was
  insufficient; confirming them requires account access, direct outreach, or a gated
  developer portal.
- **Source quality is not yet graded.** First-party documentation and credible
  secondary sources are both recorded in `evidence` without being distinguished.
- **The build order is a feasibility ranking, not a roadmap.** Customer demand and
  strategic value are a separate layer to apply on top.

## What I would build next

1. **Freshness metadata** — `retrieved_at` and `source_type` per evidence URL, so
   staleness is queryable instead of assumed.
2. **A source hierarchy** — official docs > official pricing/access pages > official
   announcements > credible secondary > unresolved, with the tier recorded.
3. **Contradiction detection** — when two sources disagree, mark the conflict and queue
   it rather than silently picking one.
4. **Adaptive verification** — target the sample at low-confidence records, conflicting
   sources, and claims that decide a tier, instead of sampling uniformly.
5. **Incremental re-research** — re-run only records whose evidence has gone stale,
   which is what makes this scale past 100 apps.
