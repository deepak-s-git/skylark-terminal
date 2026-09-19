"""
monday.com GraphQL API client.

Handles authentication, pagination, and error handling.
Returns raw item dicts — normalization is done in analytics/normalizer.py.
"""

import os
import time
import logging
from typing import Optional
import requests

from monday.queries import FETCH_BOARD_ITEMS, BOARD_METADATA, WHOAMI

logger = logging.getLogger(__name__)

MONDAY_API_URL = "https://api.monday.com/v2"
PAGE_LIMIT = 100  # items per page (monday.com max)
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


class MondayAPIError(Exception):
    """Raised when the monday.com API returns an error."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class MondayClient:
    """
    Client for the monday.com GraphQL API.

    Config is loaded from environment variables:
      MONDAY_API_TOKEN      — personal API token
      WORK_ORDERS_BOARD_ID  — board ID of Work Orders board
      DEALS_BOARD_ID        — board ID of Deals board
    """

    def __init__(self):
        self.token = os.environ.get("MONDAY_API_TOKEN", "")
        self.work_orders_board_id = os.environ.get("WORK_ORDERS_BOARD_ID", "")
        self.deals_board_id = os.environ.get("DEALS_BOARD_ID", "")

        if not self.token:
            raise MondayAPIError("MONDAY_API_TOKEN environment variable is not set.")
        if not self.work_orders_board_id or not self.deals_board_id:
            raise MondayAPIError(
                "WORK_ORDERS_BOARD_ID and DEALS_BOARD_ID environment variables must be set."
            )

        self._headers = {
            "Authorization": self.token,
            "Content-Type": "application/json",
            "API-Version": "2024-01",
        }

    def _execute(self, query: str, variables: Optional[dict] = None) -> dict:
        """
        Execute a GraphQL query against monday.com API.
        Retries on 429 (rate limit) and transient 5xx errors.
        Raises MondayAPIError on unrecoverable failures.
        """
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.post(
                    MONDAY_API_URL,
                    json=payload,
                    headers=self._headers,
                    timeout=30,
                )
            except requests.exceptions.Timeout:
                if attempt == MAX_RETRIES:
                    raise MondayAPIError("Request timed out after multiple attempts.")
                time.sleep(RETRY_DELAY * attempt)
                continue
            except requests.exceptions.ConnectionError as e:
                if attempt == MAX_RETRIES:
                    raise MondayAPIError(f"Connection error: {e}")
                time.sleep(RETRY_DELAY * attempt)
                continue

            if resp.status_code == 401:
                raise MondayAPIError("Invalid monday.com API token (401 Unauthorized).", status_code=401)

            if resp.status_code == 429:
                wait = RETRY_DELAY * (2 ** attempt)
                logger.warning(f"Rate limited by monday.com. Waiting {wait}s (attempt {attempt}).")
                time.sleep(wait)
                continue

            if resp.status_code >= 500:
                if attempt == MAX_RETRIES:
                    raise MondayAPIError(
                        f"monday.com server error ({resp.status_code}).", status_code=resp.status_code
                    )
                time.sleep(RETRY_DELAY * attempt)
                continue

            if resp.status_code != 200:
                raise MondayAPIError(
                    f"Unexpected HTTP status {resp.status_code}: {resp.text[:200]}",
                    status_code=resp.status_code,
                )

            data = resp.json()

            # GraphQL-level errors (200 but contains errors key)
            if "errors" in data and data["errors"]:
                messages = "; ".join(e.get("message", str(e)) for e in data["errors"])
                raise MondayAPIError(f"GraphQL error: {messages}")

            return data.get("data", {})

        raise MondayAPIError("Max retries exceeded.")

    def health_check(self) -> dict:
        """
        Verify connection and token validity.
        Returns account info dict on success.
        Raises MondayAPIError on failure.
        """
        data = self._execute(WHOAMI)
        me = data.get("me", {})
        return {
            "user": me.get("name"),
            "email": me.get("email"),
            "account": me.get("account", {}).get("name"),
        }

    def get_board_metadata(self, board_id: str) -> dict:
        """Return board name and item count without fetching all items."""
        data = self._execute(BOARD_METADATA, {"board_id": board_id})
        boards = data.get("boards", [])
        if not boards:
            raise MondayAPIError(f"Board {board_id} not found or not accessible.")
        board = boards[0]
        return {
            "id": board.get("id"),
            "name": board.get("name"),
            "items_count": board.get("items_count", 0),
            "columns": board.get("columns", []),
        }

    def fetch_board_items(self, board_id: str) -> list[dict]:
        """
        Fetch ALL items from a board using cursor-based pagination.

        Returns a flat list of raw item dicts:
          {
            "id": "...",
            "name": "...",
            "created_at": "...",
            "updated_at": "...",
            "columns": { "column_title": "text_value", ... }
          }

        Empty boards return [].
        API errors raise MondayAPIError.
        """
        all_items = []
        cursor = None
        page_num = 0

        while True:
            page_num += 1
            variables = {
                "board_id": board_id,
                "limit": PAGE_LIMIT,
                "cursor": cursor,
            }

            data = self._execute(FETCH_BOARD_ITEMS, variables)
            boards = data.get("boards", [])

            if not boards:
                logger.warning(f"Board {board_id} returned no data on page {page_num}.")
                break

            board_data = boards[0]
            items_page = board_data.get("items_page", {})
            items = items_page.get("items", [])
            next_cursor = items_page.get("cursor")

            if not items:
                break

            for item in items:
                # Flatten column_values into a dict keyed by column title
                columns = {}
                for cv in item.get("column_values", []):
                    title = cv.get("column", {}).get("title", "")
                    text = cv.get("text", "")  # human-readable string value
                    columns[title] = text if text else None

                all_items.append({
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "created_at": item.get("created_at"),
                    "updated_at": item.get("updated_at"),
                    "columns": columns,
                })

            logger.info(
                f"Board {board_id}: fetched page {page_num} ({len(items)} items, "
                f"total so far: {len(all_items)})"
            )

            if not next_cursor or len(items) < PAGE_LIMIT:
                break

            cursor = next_cursor

        logger.info(f"Board {board_id}: fetch complete. Total items: {len(all_items)}")
        return all_items

    def fetch_deals(self) -> list[dict]:
        """Fetch all items from the Deals board."""
        return self.fetch_board_items(self.deals_board_id)

    def fetch_work_orders(self) -> list[dict]:
        """Fetch all items from the Work Orders board."""
        return self.fetch_board_items(self.work_orders_board_id)
