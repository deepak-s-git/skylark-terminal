# Skylark Drones — Monday.com Business Intelligence Agent

A conversational BI agent that answers founder-level business questions by querying live monday.com boards (Deals and Work Orders) with deterministic Python analytics and LLM narration.

**[Live App →](https://skylark-bi-agent.vercel.app)** | **[Backend API →](https://skylark-bi-agent.up.railway.app/api/health)**

---

## What It Does

Ask natural language questions like:

- *"What is our current pipeline value?"*
- *"How is the Mining sector performing?"*
- *"Are won deals turning into work orders?"*
- *"Give me a leadership update"*

The agent fetches live data from monday.com, normalizes it, runs deterministic Python calculations, and explains the result clearly — including explicit data quality caveats.

---

## Architecture

```
User question
→ Intent extraction (Gemini — returns structured JSON)
→ monday.com GraphQL API (paginated, both boards)
→ Normalization (dates, amounts, sector names, status values)
→ Deterministic analytics (Python — no LLM math)
→ Response composition (Gemini — explains the result)
→ Founder-friendly answer with data quality notes
```

### Key principle

The LLM does exactly two things: parse the question into a structured intent, and narrate a pre-calculated result. All business calculations are deterministic Python functions that return typed dicts with explicit caveats.

### Components

| Component | Responsibility |
|---|---|
| `monday/client.py` | GraphQL API, cursor-based pagination, retry logic |
| `analytics/normalizer.py` | Field-level normalization: dates, amounts, sectors, status |
| `analytics/engine.py` | Deterministic analytics: pipeline, revenue, sectors, WO, cross-board |
| `agent/intent_router.py` | LLM call #1: question → `QueryIntent` (structured JSON) |
| `agent/composer.py` | LLM call #2: result → narrative explanation |
| `main.py` | FastAPI app, 5-min board cache, error handling |
| `frontend/` | Next.js chat UI with markdown rendering, quality notices |

---

## monday.com Setup

### 1. Import the data

Import the provided Excel files into monday.com as two separate boards:
- `Deal funnel Data.xlsx` → Deals board
- `Work_Order_Tracker Data.xlsx` → Work Orders board

Set column types to match the data (dates, numbers, text). The agent reads column **titles** as returned by the GraphQL API.

### 2. Get your API token

`Avatar → Administration → API → Personal API Token (v2)`

### 3. Get Board IDs

Open each board → URL contains the board ID: `monday.com/boards/XXXXXXXX`

---

## Local Development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy and fill in your credentials
cp .env.example .env

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Set the backend URL
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

npm run dev
```

Open `http://localhost:3000`

### Run tests

```bash
cd backend
source .venv/bin/activate
pytest tests/ -v
```

---

## Deployment

### Backend → Railway

1. Connect your GitHub repo to Railway
2. Set root directory to `backend/`
3. Add environment variables:
   - `MONDAY_API_TOKEN`
   - `WORK_ORDERS_BOARD_ID`
   - `DEALS_BOARD_ID`
   - `GEMINI_API_KEY`
   - `ALLOWED_ORIGINS=https://your-vercel-app.vercel.app`
4. Deploy — Railway detects the `Dockerfile` automatically

### Frontend → Vercel

1. Import the GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL=https://your-railway-app.up.railway.app`
4. Deploy

---

## Environment Variables

### Backend (`.env`)
```
MONDAY_API_TOKEN=your_token_here
WORK_ORDERS_BOARD_ID=123456789
DEALS_BOARD_ID=987654321
GEMINI_API_KEY=your_gemini_key
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app
```

### Frontend (`.env.local`)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Data Schema (Confirmed from Actual Boards)

### Deals Board (346 records)
| Column | Type | Notes |
|---|---|---|
| Deal Name | text | Item name — join key with Work Orders |
| Deal Status | status | Open (49), Won (165), Dead (127), On Hold (2) |
| Deal Stage | text | A–O stages from Lead to Project Completed |
| Masked Deal value | number | INR excl GST; **181/346 null** |
| Sector/service | text | Mining, Powerline, Renewables, Construction, Railways, Aviation, etc. |
| Close Date (A) | date | **318/346 null** (actual close rarely recorded) |
| Tentative Close Date | date | 74/346 null — used for period filtering |
| Created Date | date | 1/346 null |

### Work Orders Board (176 records)
| Column | Type | Notes |
|---|---|---|
| Deal name masked | text | Item name — join key with Deals board |
| Serial # | text | SDPLDEAL-xxx format |
| Execution Status | status | Completed, Ongoing, Not Started, etc. |
| Sector | text | Mining, Powerline, Renewables, Construction, Railways, Others |
| Amount in Rupees (Excl of GST) | number | Contract value; 1/176 null |
| Probable Start/End Date | date | 18–19/176 null |

### Cross-board relationship
- **Join key**: `Deals.Deal Name ↔ WO.Deal name masked` — 52 of 58 WO names confirmed in Deals
- **Client codes**: Different namespaces (`COMPANY_xxx` vs `WOCOMPANY_xxx`) — not used for matching

---

## Known Limitations

- Deal value is missing for ~52% of deals — revenue calculations note this explicitly
- Close Date (A) is missing for ~92% of deals — period filtering uses Tentative Close Date
- The cross-board match works for 52/58 WO names (89%); 6 WO names have no deal match
- Data is cached for 5 minutes — use `DELETE /api/cache` to force refresh
- No user authentication — anyone with the URL can query the agent

---

## Assumptions

See `DECISION_LOG.md` for full assumptions, trade-offs, and what would be improved with more time.
