"""
Response composer — LLM call #2.
Takes a structured analytics result and produces a founder-friendly narrative.
The LLM narrates only — it does not recalculate anything.
"""

from __future__ import annotations

import json
import logging
import os

from openai import OpenAI

from agent.prompts import RESPONSE_COMPOSITION_SYSTEM, RESPONSE_COMPOSITION_USER

logger = logging.getLogger(__name__)


def _get_groq_client():
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY environment variable is not set.")
    return OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")


def compose_response(question: str, analytics_result: dict, caveats: list[str]) -> str:
    """
    Generate a founder-friendly narrative explanation of the analytics result.

    Returns plain markdown text.
    Falls back to a structured JSON dump if LLM fails.
    """
    # Serialize the result, keeping it readable
    result_json = json.dumps(analytics_result, indent=2, default=str)
    caveats_text = "\n".join(f"- {c}" for c in caveats) if caveats else "No significant data quality issues."

    prompt = RESPONSE_COMPOSITION_USER.format(
        question=question,
        result_json=result_json,
        caveats=caveats_text,
    )

    try:
        client = _get_groq_client()
        response = client.chat.completions.create(
            model="llama3-70b-8192",
            messages=[
                {"role": "system", "content": RESPONSE_COMPOSITION_SYSTEM},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Response composition failed: {e}")
        # Fallback: return a minimal structured response
        return (
            f"**Data retrieved successfully.** Here is a summary:\n\n"
            f"```json\n{result_json[:2000]}\n```\n\n"
            f"⚠️ *The narrative explanation could not be generated due to an error: {e}*"
        )
