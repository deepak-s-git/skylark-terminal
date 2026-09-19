"""
FastAPI application — Skylark BI Agent backend.

Data flow per request:
  POST /api/chat
    → Intent extraction (LLM #1)
    → Monday.com GraphQL fetch (both boards, cached 5 min)
    → Normalization
    → Deterministic analytics
    → Response composition (LLM #2)
    → JSON response

Endpoints:
  POST /api/chat         — main BI query endpoint
  GET  /api/health       — monday.com connection check
  GET  /api/boards/info  — board metadata (names, item counts)
"""

from __future__ import annotations
from database import create_conversation, add_message, get_user_conversations, get_conversation_history, update_conversation_title
import uuid


import json
import logging
import os
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from agent.composer import compose_response
from agent.intent_router import QueryIntent, extract_intent
from analytics.engine import (
    cross_board_conversion,
    data_quality_summary,
    generate_leadership_update,
    pipeline_metrics,
    revenue_metrics,
    sector_performance,
    work_order_metrics,
)
from analytics.normalizer import normalize_deals, normalize_work_orders
from models import AgentResponse, BoardInfoResponse, ChatRequest, HealthResponse
from monday.client import MondayAPIError, MondayClient

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── In-memory cache ───────────────────────────────────────────────────────────
# Caches normalized DataFrames for 5 minutes to avoid fetching all monday.com
# data on every single request. Cache is invalidated after TTL.

_cache: dict = {}
CACHE_TTL_SECONDS = 300  # 5 minutes


def _get_cached_boards() -> tuple[Optional[pd.DataFrame], Optional[pd.DataFrame], Optional[object], Optional[object]]:
    """Return (deals_df, wo_df, deals_quality, wo_quality) from cache if fresh."""
    cached = _cache.get("boards")
    if cached and (time.time() - cached["ts"]) < CACHE_TTL_SECONDS:
        return cached["deals_df"], cached["wo_df"], cached["deals_quality"], cached["wo_quality"]
    return None, None, None, None


def _set_cache(deals_df, wo_df, deals_quality, wo_quality):
    _cache["boards"] = {
        "deals_df": deals_df,
        "wo_df": wo_df,
        "deals_quality": deals_quality,
        "wo_quality": wo_quality,
        "ts": time.time(),
    }


def _fetch_and_normalize() -> tuple[pd.DataFrame, pd.DataFrame, object, object]:
    """
    Fetch both boards from monday.com and normalize them.
    Returns (deals_df, wo_df, deals_quality, wo_quality).
    Raises MondayAPIError on failure.
    """
    # Check cache first
    deals_df, wo_df, deals_quality, wo_quality = _get_cached_boards()
    if deals_df is not None:
        logger.info("Serving from cache.")
        return deals_df, wo_df, deals_quality, wo_quality

    client = MondayClient()

    logger.info("Fetching Deals board from monday.com...")
    raw_deals = client.fetch_deals()

    logger.info("Fetching Work Orders board from monday.com...")
    raw_wo = client.fetch_work_orders()

    logger.info(f"Normalizing {len(raw_deals)} deals, {len(raw_wo)} work orders...")
    deals_df, deals_quality = normalize_deals(raw_deals)
    wo_df, wo_quality = normalize_work_orders(raw_wo)

    _set_cache(deals_df, wo_df, deals_quality, wo_quality)
    logger.info(
        f"Normalized: {len(deals_df)} deals ({deals_quality.total_records} valid), "
        f"{len(wo_df)} work orders ({wo_quality.total_records} valid)."
    )
    return deals_df, wo_df, deals_quality, wo_quality


def _run_analytics(intent: QueryIntent, deals_df: pd.DataFrame,
                   wo_df: pd.DataFrame) -> tuple[dict, list[str]]:
    """
    Dispatch to the correct deterministic analytics function based on intent.
    Returns (result_dict, caveats_list).
    """
    sector = intent.sector
    date_range = intent.date_range

    if intent.intent == "pipeline_metrics":
        result = pipeline_metrics(deals_df, sector=sector, date_range=date_range)
    elif intent.intent == "revenue_metrics":
        result = revenue_metrics(deals_df, sector=sector, date_range=date_range)
    elif intent.intent == "sector_performance":
        result = sector_performance(deals_df, date_range=date_range)
    elif intent.intent == "work_order_metrics":
        result = work_order_metrics(wo_df, sector=sector, date_range=date_range)
    elif intent.intent == "cross_board_conversion":
        result = cross_board_conversion(deals_df, wo_df, sector=sector)
    elif intent.intent == "data_quality":
        deals_quality = _cache.get("boards", {}).get("deals_quality")
        wo_quality = _cache.get("boards", {}).get("wo_quality")
        result = data_quality_summary(deals_quality, wo_quality)
    else:
        # leadership_update — fetch fresh quality reports from cache
        deals_quality = _cache.get("boards", {}).get("deals_quality")
        wo_quality = _cache.get("boards", {}).get("wo_quality")
        result = generate_leadership_update(deals_df, wo_df, deals_quality, wo_quality)

    caveats = result.get("metadata", {}).get("caveats", [])
    return result, caveats


# ── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up: verify monday.com connection on startup."""
    try:
        client = MondayClient()
        info = client.health_check()
        logger.info(f"monday.com connected: {info['user']} @ {info['account']}")
    except Exception as e:
        logger.warning(f"monday.com connection check on startup failed: {e}")
    yield


app = FastAPI(
    title="Skylark BI Agent",
    description="Business intelligence agent for Skylark Drones monday.com boards",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — configured from env var for production, permissive for local dev
origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """
    Verify monday.com authentication and board access.
    Returns connection status, user info, and board names.
    """
    try:
        client = MondayClient()
        info = client.health_check()

        deals_meta = client.get_board_metadata(client.deals_board_id)
        wo_meta = client.get_board_metadata(client.work_orders_board_id)

        return HealthResponse(
            status="ok",
            monday_connected=True,
            user=info.get("user"),
            account=info.get("account"),
            deals_board=deals_meta.get("name"),
            work_orders_board=wo_meta.get("name"),
        )
    except MondayAPIError as e:
        return HealthResponse(
            status="error",
            monday_connected=False,
            error=str(e),
        )
    except Exception as e:
        return HealthResponse(
            status="error",
            monday_connected=False,
            error=f"Unexpected error: {str(e)}",
        )


@app.get("/api/boards/info", response_model=BoardInfoResponse)
def boards_info():
    """Return board names and item counts."""
    try:
        client = MondayClient()
        deals_meta = client.get_board_metadata(client.deals_board_id)
        wo_meta = client.get_board_metadata(client.work_orders_board_id)
        return BoardInfoResponse(
            deals_board_name=deals_meta["name"],
            deals_item_count=deals_meta["items_count"],
            work_orders_board_name=wo_meta["name"],
            work_orders_item_count=wo_meta["items_count"],
        )
    except MondayAPIError as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/chat", response_model=AgentResponse)
def chat(request: ChatRequest):
    question = request.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")
        
    user_id = request.user_id or "anonymous_user"
    conv_id = request.conversation_id
    
    if not conv_id:
        title = question[:40] + ("..." if len(question) > 40 else "")
        conv_id = create_conversation(user_id, title)
        
    # Save user message
    add_message(conv_id, "user", question)


    # Step 1: Extract intent
    try:
        intent = extract_intent(question)
        logger.info(f"Intent: {intent.intent} | sector={intent.sector} | date_range={intent.date_range}")
    except Exception as e:
        logger.error(f"Intent extraction error: {e}")
        return AgentResponse(
            answer="I couldn't understand that question. Could you rephrase it?",
            error=str(e),
        )

    # Step 2: Return clarification if needed
    if intent.intent == "clarification_needed" and intent.clarification_question:
        response = AgentResponse(
            answer=intent.clarification_question,
            intent="clarification_needed",
            is_clarification=True,
            conversation_id=conv_id,
        )
        add_message(conv_id, "assistant", response.answer)
        return response

    # Step 3: Fetch and normalize boards
    try:
        deals_df, wo_df, deals_quality, wo_quality = _fetch_and_normalize()
    except MondayAPIError as e:
        logger.error(f"monday.com fetch failed: {e}")
        return AgentResponse(
            answer=(
                f"I couldn't retrieve data from monday.com right now.\n\n"
                f"**Error:** {str(e)}\n\n"
                f"Please check that the API token and board IDs are configured correctly."
            ),
            error=str(e),
        )
    except Exception as e:
        logger.error(f"Unexpected fetch error: {e}")
        return AgentResponse(
            answer="An unexpected error occurred while fetching board data. Please try again.",
            error=str(e),
        )

    # Step 4: Run analytics for the specific intent
    try:
        analytics_result, caveats = _run_analytics(intent, deals_df, wo_df)
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        return AgentResponse(
            answer="I retrieved the data but encountered an error calculating the metrics. Please try a different question.",
            intent=intent.intent,
            error=str(e),
        )

    # Add board-level quality caveats
    if deals_quality:
        caveats = deals_quality.summary_lines() + wo_quality.summary_lines() + caveats
    # Deduplicate
    seen = set()
    unique_caveats = []
    for c in caveats:
        if c not in seen:
            seen.add(c)
            unique_caveats.append(c)

    # Step 5: Compose response (Narrative based ONLY on the specific intent)
    try:
        answer = compose_response(question, analytics_result.get("result", {}), unique_caveats)
    except Exception as e:
        logger.error(f"Composition error: {e}")
        answer = f"Data retrieved but narrative generation failed.\n\n```json\n{json.dumps(analytics_result.get('result', {}), indent=2, default=str)[:1500]}\n```"

    import numpy as np
    def clean_for_json(obj):
        if isinstance(obj, dict):
            return {k: clean_for_json(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean_for_json(i) for i in obj]
        elif isinstance(obj, (np.int64, np.int32)):
            return int(obj)
        elif isinstance(obj, (np.float64, np.float32)):
            return float(obj)
        elif pd.isna(obj):
            return None
        return obj

    # Build quality report for UI
    quality_report = None
    if unique_caveats:
        quality_report = {
            "issues": unique_caveats,
            "excluded": analytics_result.get("metadata", {}).get("excluded", 0),
        }

    cleaned_metrics = clean_for_json(analytics_result.get("result"))
    cleaned_quality = clean_for_json(quality_report)
    
    # Save AI message to DB
    add_message(conv_id, "assistant", answer, cleaned_metrics, cleaned_quality)

    return AgentResponse(
        answer=answer,
        intent=intent.intent,
        metrics=cleaned_metrics,
        quality_report=cleaned_quality,
        is_clarification=False,
        conversation_id=conv_id,
    )


@app.delete("/api/cache")
def clear_cache():
    """Clear the board data cache. Forces fresh fetch on next request."""
    _cache.clear()
    return {"status": "cache cleared"}


@app.get("/api/conversations")
def list_conversations(user_id: str):
    return get_user_conversations(user_id)

@app.get("/api/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    return get_conversation_history(conversation_id)

