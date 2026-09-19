# Decision Log — Skylark Drones BI Agent

**Assignment:** Monday.com Business Intelligence Agent
**Status:** Version 2.0 (Generative UI & Groq Migration)

---

## Key Assumptions

**monday.com as source of truth.** The provided Excel files (`Deal funnel Data.xlsx`, `Work_Order_Tracker Data.xlsx`) were used only to initially import data into monday.com. The application queries the live boards dynamically via GraphQL API on every request (with a 5-minute cache to avoid redundant fetches). No data is hardcoded or loaded from Excel at runtime.

**Pipeline definition.** "Pipeline" means open deals in active stages (Lead Generated through Negotiations — stages A–F). Deals in Won, Dead, or On-Hold stages are excluded. This is encoded as a constant in the analytics engine, not decided dynamically by the LLM.

**Revenue definition.** Won revenue = `Masked Deal value` for deals where status is Won OR stage is G–K or Project Completed. The deal value field is INR excluding GST. Because 181 of 346 deals have no value recorded, all revenue totals are accompanied by an explicit caveat about the missing data.

**Cross-board matching.** After inspecting both boards, the only defensible join key between Deals and Work Orders is the deal name (`Deal Name` ↔ `Deal name masked`). Client code namespaces differ completely (`COMPANY_xxx` vs `WOCOMPANY_xxx`). 52 of 58 WO deal names appear in the Deals board — this match rate is stated explicitly to the user.

---

## Architecture Choices

**Direct GraphQL API, not MCP.** The monday.com MCP server is designed for interactive AI assistants that need bidirectional workspace access. For a backend service making server-side batch reads, the GraphQL API is simpler, more reliable, and gives full control over pagination and error handling.

**Simple intent router, not LangGraph/ReAct.** The task requires exactly two LLM calls: one to parse intent into a structured JSON object, and one to narrate a pre-calculated result. LangGraph adds a directed graph definition, state serialization, and debugging complexity with no benefit for this fixed two-step pipeline.

**LLM interprets; Python calculates.** LLMs are unreliable for arithmetic on real business data, especially with missing values and nuanced definitions. All business metrics (pipeline value, win rates, completion rates, cross-board conversion) are computed by deterministic Python/Pandas functions. The LLM simply narrates the mathematically proven results.

**Groq Inference Engine (Migrated from Gemini).** To bypass API rate limits and maximize generation speed, the intelligence engine was migrated to Groq (running `gpt-oss-120b` via the OpenAI SDK). 
*Technical detail: Addressed a severe Python 3.13 / `httpx` decompression bug by explicitly forcing `Accept-Encoding: identity` headers to prevent the backend from crashing on gzipped AI responses.*

**Generative UI (The AutoDashboard).** The frontend completely avoids hardcoded grid layouts. A custom `<AutoDashboard />` component dynamically parses the arbitrary JSON metric payloads returned by the backend at runtime. It translates flat numbers into dense KPI grids, string arrays into custom text lists, and automatically synthesizes numeric matrices into interactive `Recharts` (Bar and Pie charts).
*Technical detail: Resolved a notorious Recharts `Maximum update depth exceeded` infinite loop paradox by heavily memoizing the dynamically parsed data arrays and hoisting volatile CSS inline styles to static constants.*

**Persistent SQLite Memory.** The chat architecture uses a local `history.db` SQLite database instead of stateless arrays. This maintains active multi-turn context across sessions and supports full CRUD capabilities (e.g., deleting old conversations directly from the UI).

**Brutalist Markdown Table Interception.** AI-generated tabular data is intercepted by `react-markdown` via the `remark-gfm` plugin. It completely overrides standard HTML tables to render properly formatted, styled matrices matching the application's Vanta/Chartreuse terminal aesthetic.

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| No streaming (SSE) | Reliable JSON payload delivery (vital for the Generative UI to parse the exact layout) over a potentially broken stream. |
| 5-min in-memory cache | Slightly stale data vs. always-live latency. Acceptable for BI use case. Lost on server restart. |
| No auth on API | Anyone with the URL can query. Acceptable for an assignment demo. |
| Approximate matching | Handles reasonable sector name variants; edge cases log a caveat and default to "Others". |

---

## AI Tools Used

- **Groq API (`gpt-oss-120b`):** Intent extraction and conversational response narration.
- **Antigravity (Google AI coding assistant):** Generative UI design, backend model migration, codebase refactoring, and resolution of complex rendering loops.

---

## Future Roadmap (What I'd Do With More Time)

1. **Caching with Redis:** Replace the in-memory dictionary cache with Redis for persistence across API restarts and configurable TTLs per query type.
2. **Richer cross-board matching:** Explore if any invoice numbers (`SDPLDEAL-xxx`) appear in the Deals data to create a more reliable join key than exact string matching.
3. **Authentication:** Add an API key or OAuth layer so only authorized users can query the agent.
4. **SSE streaming:** Once the generative payload parser is hardened on the frontend, add token-level streaming for the narrative text while waiting for the heavier chart data to calculate.
5. **Automated Alerts:** Proactively flag deals stuck in a stage too long, or work orders overdue against probable end dates.
