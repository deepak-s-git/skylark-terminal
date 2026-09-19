# Skylark Drones — Monday.com Business Intelligence Agent

A conversational BI agent featuring a dynamic **Generative UI** that answers founder-level business questions by querying live monday.com boards (Deals and Work Orders) with deterministic Python analytics and LLM orchestration (powered by Groq).

**[Live App →](https://skylark-terminal.vercel.app)** | **[Backend API →](https://skylark-terminal.onrender.com/api/health)**

---

## What It Does

Ask natural language questions like:
- *"Generate a complete leadership update."*
- *"Run a strict data quality audit."*
- *"Compare won deals against operations work orders."*

The agent fetches live data from monday.com, normalizes it, runs deterministic Python calculations, and composes a custom layout of data visualizations (KPIs, BarCharts, PieCharts) rendered instantly on the frontend based purely on the shape of the incoming data matrix.

---

## Architecture (Version 2.0)

```
User question
→ Intent extraction (Groq / gpt-oss-120b)
→ monday.com GraphQL API (paginated, both boards)
→ Normalization (dates, amounts, sectors)
→ Deterministic analytics (Pandas / Python — no LLM math)
→ Response composition (Generative JSON payload & Markdown narrative)
→ Dynamic Frontend (AutoDashboard intercepts JSON and builds Recharts at runtime)
```

### Key principles

1. **LLM interprets; Python calculates:** The LLM does not perform math. It parses the intent into a structured JSON payload, and narrate a pre-calculated Pandas dataframe result. 
2. **Generative UI Engine:** The frontend does not use static layouts. The `<AutoDashboard />` component dynamically reads the incoming data matrix and builds optimized Recharts (Bar, Pie, KPI grids) entirely at runtime based on the payload's structure.
3. **Persistent Context Memory:** Chat history is actively persisted to a local `history.db` SQLite database to maintain multi-turn context and support full dashboard-level conversation management (CRUD).
4. **Brutalist Markdown Routing:** AI generated tabular data is intercepted by `remark-gfm` and automatically mapped to heavily styled HTML tables matching the terminal aesthetic.

### Components

| Component | Responsibility |
|---|---|
| `monday/client.py` | GraphQL API, cursor-based pagination, retry logic |
| `analytics/normalizer.py` | Field-level normalization: dates, amounts, sectors, status |
| `analytics/engine.py` | Deterministic analytics: pipeline, revenue, sectors, WO, cross-board |
| `agent/intent_router.py` | LLM call #1 (Groq): question → `QueryIntent` (structured JSON) |
| `agent/composer.py` | LLM call #2 (Groq): result → narrative explanation & JSON metrics |
| `main.py` | FastAPI app, SQLite memory state, endpoint routing |
| `components/AutoDashboard.tsx` | Next.js engine mapping raw JSON matrices into dynamic Recharts graphics |

---

## monday.com Setup

### 1. Import the data
Import the provided Excel files into monday.com as two separate boards:
- `Deal funnel Data.xlsx` → Deals board
- `Work_Order_Tracker Data.xlsx` → Work Orders board

### 2. Get your API token
`Avatar → Administration → API → Personal API Token (v2)`

### 3. Get Board IDs
Open each board → URL contains the board ID: `monday.com/boards/XXXXXXXX`

---

## Local Development

### Backend (FastAPI / Python)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Setup credentials
cp .env.example .env
# Add MONDAY_API_TOKEN, WORK_ORDERS_BOARD_ID, DEALS_BOARD_ID, GROQ_API_KEY

uvicorn main:app --reload --port 8000
```

### Frontend (Next.js / Tailwind / Recharts)
```bash
# From project root
npm install

# Set the backend URL
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```
Open `http://localhost:3000`

---

## Environment Variables

### Backend (`.env`)
```
MONDAY_API_TOKEN=your_token_here
WORK_ORDERS_BOARD_ID=123456789
DEALS_BOARD_ID=987654321
GROQ_API_KEY=gsk_your_groq_key
ALLOWED_ORIGINS=http://localhost:3000,https://skylark-terminal.vercel.app
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Data Schema & Hygiene Notes

### Cross-board relationship
- **Join key**: `Deals.Deal Name ↔ WO.Deal name masked` (89% match rate confirmed).
- **Client codes**: Different namespaces (`COMPANY_xxx` vs `WOCOMPANY_xxx`) — ignored for matching.

### Known Limitations
- Deal value is missing for ~52% of deals — revenue calculations flag this dynamically in the UI.
- Close Date (A) is missing for ~92% of deals — period filtering falls back to Tentative Close Date.
- Data is cached for 5 minutes — use `DELETE /api/cache` to force refresh.

---

## Architectural Decisions

See `DECISION_LOG.md` for a full breakdown of architecture choices, trade-offs, the Groq migration, and how the Generative UI engine was designed to prevent Recharts infinite rendering loops.
