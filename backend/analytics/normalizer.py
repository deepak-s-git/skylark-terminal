"""
Data normalization for monday.com board items.

Built against the ACTUAL schema confirmed from Excel inspection:

DEALS board:
  - Dates: already proper timestamps from monday.com (ISO strings)
  - Deal value: numeric float (INR excl GST); 181/346 null
  - Status: 'Open', 'Won', 'Dead', 'On Hold' (+ header-row junk values)
  - Sector: 'Mining', 'Powerline', 'Renewables', 'Construction', 'Railways',
            'Aviation', 'DSP', 'Manufacturing', 'Security and Surveillance',
            'Others', 'Tender' (+ header-row junk)
  - Stage: 'A. Lead Generated', 'B. Sales Qualified Leads', ..., 'H. Work Order Received'

WORK ORDERS board:
  - Dates: proper timestamps from monday.com
  - Amounts: numeric (INR); very few nulls on core amount fields
  - Execution Status: 'Completed', 'Ongoing', 'Not Started',
                      'Partial Completed', 'Pause / struck',
                      'Details pending from Client', 'Executed until current month'
  - Sector: 'Mining', 'Powerline', 'Construction', 'Railways', 'Renewables', 'Others'
  - WO Status: 'Open', 'Closed' (74/176 null)

All normalizer functions return (value | None, caveat | None).
Caveats are human-readable strings suitable for display to a founder.
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Optional
import pandas as pd

logger = logging.getLogger(__name__)

# ── Canonical lookup tables ───────────────────────────────────────────────────

# Confirmed from actual data inspection. Keys are lowercased stripped variants.
SECTOR_CANONICAL = {
    "mining": "Mining",
    "powerline": "Powerline",
    "renewables": "Renewables",
    "renewable": "Renewables",
    "construction": "Construction",
    "railways": "Railways",
    "railway": "Railways",
    "aviation": "Aviation",
    "dsp": "DSP",
    "manufacturing": "Manufacturing",
    "security and surveillance": "Security & Surveillance",
    "security & surveillance": "Security & Surveillance",
    "surveillance": "Security & Surveillance",
    "others": "Others",
    "other": "Others",
    "tender": "Tender",
}

# Deal status normalization (header-row junk values are excluded at row level)
DEAL_STATUS_CANONICAL = {
    "open": "Open",
    "won": "Won",
    "dead": "Dead",
    "lost": "Dead",
    "on hold": "On Hold",
    "onhold": "On Hold",
    "hold": "On Hold",
}

# Execution status groupings for analytics
EXECUTION_STATUS_CANONICAL = {
    "completed": "Completed",
    "ongoing": "Ongoing",
    "not started": "Not Started",
    "partial completed": "Partially Completed",
    "partial": "Partially Completed",
    "pause / struck": "Paused",
    "paused": "Paused",
    "details pending from client": "Pending Client",
    "details pending": "Pending Client",
    "executed until current month": "Ongoing",  # same as ongoing for analytics
}

# Deal stages — pipeline stages that indicate an active open deal
ACTIVE_PIPELINE_STAGES = {
    "A. Lead Generated",
    "B. Sales Qualified Leads",
    "C. Demo Done",
    "D. Feasibility",
    "E. Proposal/Commercials Sent",
    "F. Negotiations",
}

WON_STAGES = {
    "G. Project Won",
    "H. Work Order Received",
    "I. POC",
    "J. Invoice sent",
    "K. Amount Accrued",
    "Project Completed",
}


# ── Data quality report ───────────────────────────────────────────────────────

@dataclass
class DataQualityReport:
    """
    Tracks data quality issues found during normalization.
    Only meaningful issues are surfaced — not every parse event.
    """
    board_name: str
    total_records: int = 0
    header_rows_removed: int = 0         # rows that were column headers duplicated in data
    missing_sector: int = 0              # records with no usable sector value
    missing_deal_value: int = 0          # deals with no value (Deals board only)
    missing_close_date: int = 0          # deals with no actual close date
    missing_execution_status: int = 0    # WO records with no status
    ambiguous_sector: int = 0            # sector values that couldn't be mapped
    excluded_from_pipeline: int = 0      # records excluded from pipeline calcs
    caveats: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)

    def add_caveat(self, msg: str):
        if msg not in self.caveats:
            self.caveats.append(msg)

    def add_assumption(self, msg: str):
        if msg not in self.assumptions:
            self.assumptions.append(msg)

    def summary_lines(self) -> list[str]:
        """Return only meaningful quality lines for display."""
        lines = []
        if self.header_rows_removed:
            lines.append(f"{self.header_rows_removed} header/junk rows removed from {self.board_name} data.")
        if self.missing_sector:
            lines.append(f"{self.missing_sector} of {self.total_records} {self.board_name} records are missing a sector.")
        if self.missing_deal_value:
            lines.append(f"{self.missing_deal_value} of {self.total_records} deals have no deal value — excluded from revenue calculations.")
        if self.missing_close_date:
            lines.append(f"{self.missing_close_date} deals have no actual close date — period-based close-date filters may be limited.")
        if self.missing_execution_status:
            lines.append(f"{self.missing_execution_status} work orders have no execution status.")
        if self.ambiguous_sector:
            lines.append(f"{self.ambiguous_sector} records had unrecognized sector values — treated as 'Others'.")
        lines.extend(self.caveats)
        return lines


# ── Field-level parsers ───────────────────────────────────────────────────────

def parse_date(raw) -> Optional[date]:
    """
    Parse a date value from monday.com.
    monday.com returns dates as ISO strings ("2025-05-31") or None.
    Timestamps come as "2025-05-31 00:00:00" or similar.
    Returns None for missing/unparseable values.
    """
    if raw is None or (isinstance(raw, str) and raw.strip() == ""):
        return None
    if isinstance(raw, (datetime,)):
        return raw.date()
    if isinstance(raw, date):
        return raw
    if isinstance(raw, str):
        raw = raw.strip()
        for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(raw.split(".")[0], fmt).date()
            except ValueError:
                continue
    return None


def parse_float(raw) -> Optional[float]:
    """
    Parse a numeric/money value.
    monday.com returns numbers as strings or floats.
    Values like '', 'N/A', None → None (not 0).
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if not pd.isna(raw) else None
    if isinstance(raw, str):
        raw = raw.strip()
        if not raw or raw.lower() in ("n/a", "na", "-", "nil"):
            return None
        # Remove currency symbols and commas
        raw = re.sub(r"[₹$,\s]", "", raw)
        # Handle multiplier suffixes
        multipliers = {"k": 1_000, "l": 100_000, "m": 1_000_000, "cr": 10_000_000}
        for suffix, mult in multipliers.items():
            if raw.lower().endswith(suffix):
                try:
                    return float(raw[: -len(suffix)]) * mult
                except ValueError:
                    return None
        try:
            return float(raw)
        except ValueError:
            return None
    return None


def normalize_sector(raw: Optional[str]) -> tuple[Optional[str], bool]:
    """
    Map raw sector text to a canonical sector name.
    Returns (canonical_name, was_ambiguous).
    was_ambiguous=True means the value was not in our lookup table.
    """
    if not raw or (isinstance(raw, str) and raw.strip() == ""):
        return None, False
    key = raw.strip().lower()
    canonical = SECTOR_CANONICAL.get(key)
    if canonical:
        return canonical, False
    # Partial match attempt
    for k, v in SECTOR_CANONICAL.items():
        if k in key or key in k:
            return v, False
    return "Others", True  # unknown → Others, flagged as ambiguous


def normalize_deal_status(raw: Optional[str]) -> Optional[str]:
    """Normalize deal status to canonical form. Returns None for junk/header values."""
    if not raw:
        return None
    key = raw.strip().lower()
    # Filter out header-row pollution
    if key in ("deal status", "status"):
        return None
    return DEAL_STATUS_CANONICAL.get(key)


def normalize_execution_status(raw: Optional[str]) -> Optional[str]:
    """Normalize work order execution status."""
    if not raw:
        return None
    key = raw.strip().lower()
    return EXECUTION_STATUS_CANONICAL.get(key, raw.strip())  # keep as-is if unknown


# ── Board-level normalizers ───────────────────────────────────────────────────

def normalize_deals(raw_items: list[dict]) -> tuple[pd.DataFrame, DataQualityReport]:
    """
    Normalize raw Deals board items from monday.com into a clean DataFrame.

    Confirmed columns (from actual Excel inspection mapped to monday.com titles):
      item.name          → deal_name
      'Owner code'       → owner_code
      'Client Code'      → client_code
      'Deal Status'      → deal_status   (canonical)
      'Close Date (A)'   → close_date    (date | None)
      'Closure Probability' → closure_probability
      'Masked Deal value'→ deal_value_inr (float | None)
      'Tentative Close Date' → tentative_close_date (date | None)
      'Deal Stage'       → deal_stage
      'Product deal'     → product_deal
      'Sector/service'   → sector        (canonical)
      'Created Date'     → created_date  (date | None)
    """
    report = DataQualityReport(board_name="Deals")
    rows = []

    JUNK_NAMES = {"deal name", "deal name masked", "name"}  # header rows

    for item in raw_items:
        cols = item.get("columns", {})
        name = (item.get("name") or "").strip()

        # Remove header/junk rows (Monday sometimes imports header row as an item)
        if name.lower() in JUNK_NAMES or cols.get("Deal Name", "").lower() == "deal name":
            report.header_rows_removed += 1
            continue

        report.total_records += 1

        # Sector
        sector_raw = cols.get("Sector/service") or cols.get("Sector") or ""
        # Filter out header-row pollution
        if sector_raw.strip().lower() in ("sector/service", "sector"):
            sector_raw = ""
        sector, ambiguous = normalize_sector(sector_raw)
        if sector is None:
            report.missing_sector += 1
        if ambiguous:
            report.ambiguous_sector += 1

        # Deal status
        status = normalize_deal_status(cols.get("Deal Status"))

        # Deal value
        deal_value = parse_float(cols.get("Masked Deal value"))
        if deal_value is None:
            report.missing_deal_value += 1

        # Dates
        close_date = parse_date(cols.get("Close Date (A)"))
        tentative_close = parse_date(cols.get("Tentative Close Date"))
        created_date = parse_date(cols.get("Created Date")) or parse_date(item.get("created_at"))

        if close_date is None and status == "Won":
            report.missing_close_date += 1

        # Closure probability — filter header junk
        prob_raw = cols.get("Closure Probability") or ""
        closure_prob = prob_raw if prob_raw.lower() not in ("closure probability", "") else None

        # Deal stage
        stage = cols.get("Deal Stage") or None
        if stage and stage.lower() == "deal stage":
            stage = None

        rows.append({
            "id": item.get("id"),
            "deal_name": name,
            "owner_code": cols.get("Owner code"),
            "client_code": cols.get("Client Code"),
            "deal_status": status,
            "close_date": close_date,
            "tentative_close_date": tentative_close,
            "created_date": created_date,
            "closure_probability": closure_prob,
            "deal_value_inr": deal_value,
            "deal_stage": stage,
            "product_deal": cols.get("Product deal"),
            "sector": sector,
        })

    df = pd.DataFrame(rows)

    # Add meaningful caveats
    if report.missing_deal_value > 0:
        report.add_caveat(
            f"{report.missing_deal_value} of {report.total_records} deals have no deal value "
            f"and are excluded from revenue/value calculations."
        )
    if report.missing_close_date > 0:
        report.add_caveat(
            f"{report.missing_close_date} won deals have no actual close date. "
            f"'Tentative Close Date' is used for period filtering where available."
        )
    if report.missing_sector > 0:
        report.add_caveat(
            f"{report.missing_sector} deals have no sector — they appear in totals but not sector breakdowns."
        )

    report.add_assumption(
        "Pipeline value = sum of 'Masked Deal value' for Open deals "
        "(stages A–F: Lead Generated through Negotiations)."
    )
    report.add_assumption(
        "Won deals = Deal Status is 'Won' OR Deal Stage is G/H/I/J/K/Project Completed."
    )

    return df, report


def normalize_work_orders(raw_items: list[dict]) -> tuple[pd.DataFrame, DataQualityReport]:
    """
    Normalize raw Work Orders board items from monday.com into a clean DataFrame.

    Confirmed columns (from actual Excel inspection):
      item.name                        → deal_name_masked (join key with Deals)
      'Customer Name Code'             → customer_code
      'Serial #'                       → serial_number
      'Nature of Work'                 → nature_of_work
      'Execution Status'               → execution_status (canonical)
      'Data Delivery Date'             → data_delivery_date (date | None)
      'Date of PO/LOI'                 → po_date (date | None)
      'Document Type'                  → document_type
      'Probable Start Date'            → start_date (date | None)
      'Probable End Date'              → end_date (date | None)
      'BD/KAM Personnel code'          → owner_code
      'Sector'                         → sector (canonical)
      'Type of Work'                   → type_of_work
      'Amount in Rupees (Excl of GST)' → contract_value_excl_gst (float | None)
      'Amount in Rupees (Incl of GST)' → contract_value_incl_gst (float | None)
      'Billed Value in Rupees (Excl)'  → billed_excl_gst (float | None)
      'Collected Amount (Incl of GST)' → collected_incl_gst (float | None)
      'Amount Receivable'              → amount_receivable (float | None)
      'Invoice Status'                 → invoice_status
      'WO Status (billed)'             → wo_status (Open/Closed)
      'Billing Status'                 → billing_status
    """
    report = DataQualityReport(board_name="Work Orders")
    rows = []

    JUNK_NAMES = {"deal name masked", ""}

    for item in raw_items:
        cols = item.get("columns", {})
        name = (item.get("name") or "").strip()

        if name.lower() in JUNK_NAMES:
            report.header_rows_removed += 1
            continue

        report.total_records += 1

        # Sector
        sector, ambiguous = normalize_sector(cols.get("Sector"))
        if sector is None:
            report.missing_sector += 1
        if ambiguous:
            report.ambiguous_sector += 1

        # Execution status
        exec_status_raw = cols.get("Execution Status")
        exec_status = normalize_execution_status(exec_status_raw)
        if exec_status is None:
            report.missing_execution_status += 1

        # Amounts
        contract_excl = parse_float(cols.get("Amount in Rupees (Excl of GST) (Masked)") or
                                    cols.get("Amount in Rupees (Excl of GST)"))
        contract_incl = parse_float(cols.get("Amount in Rupees (Incl of GST) (Masked)") or
                                    cols.get("Amount in Rupees (Incl of GST)"))
        billed_excl = parse_float(cols.get("Billed Value in Rupees (Excl of GST.) (Masked)") or
                                  cols.get("Billed Value in Rupees (Excl of GST.)"))
        collected = parse_float(cols.get("Collected Amount in Rupees (Incl of GST.) (Masked)") or
                                cols.get("Collected Amount in Rupees (Incl of GST.)"))
        receivable = parse_float(cols.get("Amount Receivable (Masked)") or
                                 cols.get("Amount Receivable"))

        # Dates
        start_date = parse_date(cols.get("Probable Start Date"))
        end_date = parse_date(cols.get("Probable End Date"))
        po_date = parse_date(cols.get("Date of PO/LOI"))
        delivery_date = parse_date(cols.get("Data Delivery Date"))
        created_date = parse_date(item.get("created_at"))

        rows.append({
            "id": item.get("id"),
            "deal_name_masked": name,          # join key with Deals board
            "customer_code": cols.get("Customer Name Code"),
            "serial_number": cols.get("Serial #"),
            "nature_of_work": cols.get("Nature of Work"),
            "execution_status": exec_status,
            "sector": sector,
            "type_of_work": cols.get("Type of Work"),
            "owner_code": cols.get("BD/KAM Personnel code"),
            "document_type": cols.get("Document Type"),
            "start_date": start_date,
            "end_date": end_date,
            "po_date": po_date,
            "data_delivery_date": delivery_date,
            "created_date": created_date,
            "contract_value_excl_gst": contract_excl,
            "contract_value_incl_gst": contract_incl,
            "billed_excl_gst": billed_excl,
            "collected_incl_gst": collected,
            "amount_receivable": receivable,
            "invoice_status": cols.get("Invoice Status"),
            "wo_status": cols.get("WO Status (billed)"),
            "billing_status": cols.get("Billing Status"),
        })

    df = pd.DataFrame(rows)

    if report.missing_sector > 0:
        report.add_caveat(
            f"{report.missing_sector} work orders have no sector — included in totals, "
            f"excluded from sector breakdowns."
        )
    if report.missing_execution_status > 0:
        report.add_caveat(
            f"{report.missing_execution_status} work orders have no execution status recorded."
        )

    report.add_assumption(
        "Active work orders = Execution Status in (Ongoing, Not Started, Pending Client, Partially Completed)."
    )
    report.add_assumption(
        "Contract value uses 'Amount in Rupees (Excl of GST)' — i.e., pre-tax value."
    )

    return df, report
