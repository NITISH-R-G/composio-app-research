"""
Shared schema for the app-research pipeline.
Each researched app is stored as one record matching this shape.
"""

RECORD_KEYS = [
    "app",
    "category",
    "description",
    "auth_method",
    "self_serve",
    "api_surface",
    "mcp_exists",       # true / false / "unclear"
    "buildability_verdict",
    "blocker",
    "evidence",          # list[str] of doc URLs
    "confidence",        # "high" / "medium" / "low"
]

RESEARCH_PROMPT_TEMPLATE = """You are researching the app "{app}" ({hint}) for an AI-agent tool-building
feasibility catalog. Use web search and fetch real developer documentation pages
(search "{app} API docs authentication", "{app} developer API", "{app} OAuth scopes",
"{app} API pricing", "{app} MCP server") to answer, with evidence URLs for every claim:

1. category (one line) and what the app does in one sentence
2. auth_method: OAuth2 / API key / Basic / token / other - be specific
3. self_serve: "self-serve free" | "self-serve trial" | "paid plan required" |
   "admin/partner approval required" | "contact-sales gated" - with a one-line reason
4. api_surface: REST/GraphQL, roughly how broad, and whether an official or
   community MCP server exists
5. buildability_verdict: "buildable today" | "buildable with limitation" | "blocked"
   + the main blocker if any
6. evidence: the real docs URL(s) used
7. confidence: "high" | "medium" | "low" based on how directly you verified vs inferred

Return ONLY a JSON object with keys: {keys}. No markdown fences, no commentary.
If you cannot verify something, say so honestly with confidence "low" rather than guessing.
"""
