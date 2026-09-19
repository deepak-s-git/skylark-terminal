"""
Response composer — LLM call #2.
Takes a structured analytics result and produces a founder-friendly narrative.
The LLM narrates only — it does not recalculate anything.
"""

from __future__ import annotations

import json
import logging
import os

import google.generativeai as genai

from agent.prompts import RESPONSE_COMPOSITION_SYSTEM, RESPONSE_COMPOSITION_USER

logger = logging.getLogger(__name__)


def _configure_gemini():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is not set.")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(
        "gemini-3.6-flash",
        generation_config=genai.GenerationConfig(
            temperature=0.3,  # slight creativity for natural prose
        ),
        system_instruction=RESPONSE_COMPOSITION_SYSTEM,
    )


def compose_response(question: str, analytics_result: dict, caveats: list[str]) -> str:
    """
    Generate a founder-friendly narrative explanation of the analytics result.

    Returns plain markdown text.
    Falls back to a structured JSON dump if LLM fails.
    """
    model = _configure_gemini()

    # Serialize the result, keeping it readable
    result_json = json.dumps(analytics_result, indent=2, default=str)
    caveats_text = "\n".join(f"- {c}" for c in caveats) if caveats else "No significant data quality issues."

    prompt = RESPONSE_COMPOSITION_USER.format(
        question=question,
        result_json=result_json,
        caveats=caveats_text,
    )

    try:
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"Response composition failed: {e}")
        # Fallback: return a minimal structured response
        return (
            f"**Data retrieved successfully.** Here is a summary:\n\n"
            f"```json\n{result_json[:2000]}\n```\n\n"
            f"⚠️ *The narrative explanation could not be generated due to an error: {e}*"
        )
