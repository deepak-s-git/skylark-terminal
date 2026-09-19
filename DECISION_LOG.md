# Decision Log — Skylark Drones BI Agent

**Assignment:** Monday.com Business Intelligence Agent
**Duration:** ~5 hours | **Date:** September 19, 2026

---

## Key Assumptions

**monday.com as source of truth.** The provided Excel files (`Deal funnel Data.xlsx`, `Work_Order_Tracker Data.xlsx`) are used only to import data into monday.com. The application queries the live boards dynamically via GraphQL API on every request (with a 5-minute cache to avoid redundant fetches). No data is hardcoded or loaded from Excel at runtime.

**Pipeline definition.** "Pipeline" means open deals in active stages (Lead Generated through Negotiations — stages A–F). Deals in Won, Dead, or On-Hold stages are excluded. This is encoded as a constant in the analytics engine, not decided dynamically by the LLM.

**Revenue definition.** Won revenue = `Masked Deal value` for deals where status is Won OR stage is G–K or Project Completed. The deal value field is INR excluding GST. Because 181 of 346 deals have no value recorded, all revenue totals are accompanied by an explicit caveat about the missing data.

**Cross-board matching.** After inspecting both boards, the only defensible join key between Deals and Work Orders is the deal name (`Deal Name` ↔ `Deal name masked`). Client code namespaces differ completely (`COMPANY_xxx` vs `WOCOMPANY_xxx`). 52 of 58 WO deal names appear in the Deals board — this match rate is stated explicitly to the user. Sector-level aggregate comparison is also provided.

**Date handling.** `Close Date (A)` (the actual close date) is missing for 318 of 346 deals. For period filtering on Deals, `Tentative Close Date` is used with a transparent caveat. For Work Orders, `Probable Start Date` is used.

---

## Architecture Choices

**Direct GraphQL API, not MCP.** The monday.com MCP server is designed for interactive AI assistants that need bidirectional workspace access. For a backend service making server-side batch reads, the GraphQL API is simpler, more reliable, and gives full control over pagination and error handling.

**Simple intent router, not LangGraph/ReAct.** The task requires exactly two LLM calls: one to parse intent into a structured JSON object, and one to narrate a pre-calculated result. LangGraph adds a directed graph definition, state serialization, and debugging complexity with no benefit for this fixed two-step pipeline. The simpler design is more reliable within the time constraint.

**LLM interprets; Python calculates.** LLMs are unreliable for arithmetic on real business data, especially with missing values and nuanced definitions. All business metrics (pipeline value, win rates, completion rates, cross-board conversion) are computed by deterministic Python functions. The LLM receives the calculated result and explains it in natural language. This makes the system both more accurate and easier to verify.

**5-minute in-memory cache.** Fetching 300+ deals and 170+ work orders on every query would add 2–4 seconds of latency and exhaust API rate limits. A simple in-memory cache (invalidated after 5 minutes) keeps responses fast while ensuring data stays reasonably fresh. A `DELETE /api/cache` endpoint allows forced refresh.

**Gemini 2.0 Flash.** Free tier, fast response times, reliable JSON output mode for structured intent extraction, and strong multilingual support. The intent extraction call uses `response_mime_type="application/json"` to guarantee parseable output.

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| No streaming (SSE) | Reliable JSON response over potentially-broken streaming. SSE is P2. |
| 5-min cache | Slightly stale data vs. always-live latency. Acceptable for BI use case. |
| No auth on API | Anyone with the URL can query. Acceptable for an assignment demo. |
| In-memory cache | Lost on server restart. Production would use Redis. |
| Approximate sector matching | Handles reasonable variants; edge cases log a caveat and default to "Others". |

---

## Interpretation: Leadership Updates

"The agent should help prepare data for leadership updates" is interpreted as: a structured business summary generated from live data, formatted for a weekly leadership meeting or board deck. When triggered by queries like "give me a leadership update" or "prepare the board summary," the agent runs all analytics functions (pipeline, revenue, sector performance, work orders, cross-board) and composes a unified summary covering:

1. Pipeline health (total value, deal count, by stage)
2. Revenue/sales performance (won value, win rate, sector breakdown)
3. Work order / execution status (completion rate, active projects)
4. Cross-board conversion (deals turning into projects)
5. Data quality caveats (what's missing and how it affects interpretation)

The LLM formats this as a readable briefing document, not a raw data dump. All numbers are verified against the actual monday.com data.

---

## AI Tools Used

- **Google Gemini (via API):** Intent extraction and response narration
- **Antigravity (Google AI coding assistant):** Code generation, schema inspection, test writing, and implementation planning throughout the development session

---

## What I'd Do With More Time

1. **Caching with Redis.** Replace in-memory dict cache with Redis for persistence across restarts and configurable TTLs per query type.
2. **Richer cross-board matching.** Explore if any invoice numbers (`SDPLDEAL-xxx`) appear in the Deals data to create a more reliable join key.
3. **Chart generation.** Add a `/api/chart` endpoint that returns Plotly-compatible data for sector comparison and pipeline stage funnel charts.
4. **Authentication.** Add an API key or OAuth layer so only authorized users can query the agent.
5. **Conversation memory.** Currently, history is sent back in each request. A persistent session store (PostgreSQL) would enable multi-day conversation context.
6. **SSE streaming.** Once the core pipeline is proven reliable, add token-level streaming for a more responsive feel.
7. **Alert detection.** Proactively flag: deals stuck in a stage too long, work orders overdue against probable end date, sectors with declining win rates.

## Post-Launch Architectural Upgrades (Version 2.0)

**LLM Engine Migration (Gemini -> Groq/OpenAI compatible)**
Due to strict API quota limits on the free Gemini tier during extensive UI testing, the intent router and narration composer were migrated to use the `openai` Python SDK pointed at Groq's high-speed inference endpoints (`gpt-oss-120b`). 
*Technical detail:* Addressed a severe Python 3.13 / `httpx` decompression bug by explicitly forcing `Accept-Encoding: identity` headers to prevent the backend from crashing on gzipped AI responses.

**Generative UI (The AutoDashboard Engine)**
The initial frontend relied on a static, monolithic React grid that rendered the same components regardless of the query. This was entirely replaced with a true **Generative UI engine** built on `Recharts`. 
*   **Dynamic Parsing:** The `<AutoDashboard />` component recursively walks the arbitrary JSON matrix returned by the backend. It maps flat numbers to dense KPI grids, string arrays to custom lists, and object matrices to Bar/Pie charts automatically at runtime.
*   **Aggressive Visualizer:** To ensure that non-financial queries (like Data Quality audits) still produce charts, the engine detects dictionaries consisting solely of numeric values and dynamically synthesizes a `BarChart` comparing them.

**Recharts Infinite Loop Resolution**
Generative charts inside Next.js introduced a notorious React loop (`Maximum update depth exceeded`) because dynamic arrays and inline styles triggered infinite `ResizeObserver` cycles inside the `<ResponsiveContainer>`. This was resolved comprehensively by heavily memoizing (`useMemo`) the parsed chart data and hoisting volatile inline CSS styles to static constants.

**Persistent Conversation Memory & Chat History**
The stateless chat implementation was upgraded to use a persistent SQLite database (`history.db`). The frontend now reliably tracks active sessions, enabling context-aware multi-turn conversations and the ability to selectively delete old sessions via a new `DELETE /api/conversations/{id}` endpoint.

**Brutalist Markdown Table Formatting**
The AI composer often outputs tabular data for unmatched deals or missing sectors. `react-markdown` was enhanced with `remark-gfm` to intercept raw markdown tables (`| Header | Data |`) and automatically map them to brutalist HTML tables matching the terminal aesthetic (Chartreuse/Vanta colors with strict mono typography).
