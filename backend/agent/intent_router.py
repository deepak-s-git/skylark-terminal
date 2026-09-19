"""
Intent extraction — LLM call #1.
Parses a founder's natural language question into a structured QueryIntent.
"""

from __future__ import annotations

import json
import logging
import re
import os
from dataclasses import dataclass
from typing import Optional, Literal

from openai import OpenAI

from agent.prompts import INTENT_EXTRACTION_SYSTEM, INTENT_EXTRACTION_USER

logger = logging.getLogger(__name__)


@dataclass
class QueryIntent:
    intent: Literal[
        "pipeline_metrics", "revenue_metrics", "sector_performance",
        "work_order_metrics", "cross_board_conversion",
        "leadership_update", "data_quality", "clarification_needed"
    ]
    board: Literal["deals", "work_orders", "both"] = "both"
    sector: Optional[str] = None
    date_range: Optional[str] = None
    status_filter: Optional[str] = None
    clarification_question: Optional[str] = None


def _get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set.")
    return OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")


def extract_intent(question: str) -> QueryIntent:
    """
    Use Groq to parse a founder question into a structured QueryIntent.
    Falls back to a safe default (leadership_update) if parsing fails.
    """
    try:
        client = _get_groq_client()
        prompt = INTENT_EXTRACTION_USER.format(question=question)

        response = client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[
                {"role": "system", "content": INTENT_EXTRACTION_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.0
        )
        raw = response.choices[0].message.content.strip()

        # Extract JSON even if there's surrounding text
        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not json_match:
            raise ValueError(f"No JSON found in response: {raw[:200]}")

        data = json.loads(json_match.group())

        return QueryIntent(
            intent=data.get("intent", "leadership_update"),
            board=data.get("board", "both"),
            sector=data.get("sector") or None,
            date_range=data.get("date_range") or None,
            status_filter=data.get("status_filter") or None,
            clarification_question=data.get("clarification_question") or None,
        )

    except Exception as e:
        logger.warning(f"Intent extraction failed ({e}). Falling back to leadership_update.")
        return QueryIntent(intent="leadership_update", board="both")
