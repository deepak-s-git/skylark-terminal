"""
Pydantic request/response models for the FastAPI API.
"""

from __future__ import annotations

from typing import Optional, Any
from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: str   # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    conversation_id: Optional[str] = None

class DataQualityInfo(BaseModel):
    issues: list[str]
    assumptions: list[str]
    excluded_count: int

class AgentResponse(BaseModel):
    answer: str                              # Markdown narrative
    intent: Optional[str] = None            # Detected intent
    metrics: Optional[dict[str, Any]] = None # Structured numbers for UI
    quality_report: Optional[dict] = None   # Data quality issues
    follow_up_suggestions: list[str] = []   # Suggested follow-up questions
    is_clarification: bool = False           # True if agent is asking a question
    error: Optional[str] = None             # Non-null if something went wrong
    conversation_id: Optional[str] = None   # Database ID for history


class HealthResponse(BaseModel):
    status: str
    monday_connected: bool
    user: Optional[str] = None
    account: Optional[str] = None
    deals_board: Optional[str] = None
    work_orders_board: Optional[str] = None
    error: Optional[str] = None


class BoardInfoResponse(BaseModel):
    deals_board_name: str
    deals_item_count: int
    work_orders_board_name: str
    work_orders_item_count: int
