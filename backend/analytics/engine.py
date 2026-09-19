"""
Deterministic BI analytics engine.

All business calculations are done in Python — the LLM never calculates numbers.
Each function returns:
  {
    "result": <the calculated data>,
    "metadata": {
      "excluded": <int: records excluded from this calc>,
      "caveats": [<human-readable strings>],
      "record_counts": { "total": N, "used": M }
    }
  }

Metric definitions (derived from actual data inspection):

PIPELINE:
  - Pipeline = Open deals in active stages (A–F)
  - Active stages: Lead Generated, SQL, Demo Done, Feasibility, Proposal, Negotiations
  - Value = sum of deal_value_inr where not null
  - Count = all pipeline deals (including those with no value)

REVENUE:
  - Won = Deal Status "Won" OR Deal Stage in WON_STAGES
  - Revenue value = sum of deal_value_inr for Won deals where not null
  - Win rate = Won deals / (Won + Dead) deals (excludes Open/On Hold)

WORK ORDERS:
  - Active WOs = execution_status in (Ongoing, Not Started, Pending Client, Partially Completed)
  - Completed WOs = execution_status == "Completed"
  - Contract value = contract_value_excl_gst (pre-tax)
  - Completion rate = Completed / Total (excluding those with null status)

CROSS-BOARD:
  - Join key: Deals.deal_name ↔ WO.deal_name_masked (52 shared names confirmed)
  - Client codes are DIFFERENT namespaces — not used for joining
  - Sector is used for AGGREGATE comparison only (not deal-level matching)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Optional
import pandas as pd

from analytics.normalizer import ACTIVE_PIPELINE_STAGES, WON_STAGES

logger = logging.getLogger(__name__)


def _empty_result(message: str) -> dict:
    return {
        "result": None,
        "metadata": {
            "excluded": 0,
            "caveats": [message],
            "record_counts": {"total": 0, "used": 0},
        },
    }


def _apply_date_filter(df: pd.DataFrame, date_col: str, date_range: Optional[str]) -> tuple[pd.DataFrame, list[str]]:
    """
    Apply a named date range filter to a DataFrame column.
    Returns (filtered_df, caveats_list).

    Supported date_range values:
      "this_quarter", "last_quarter", "this_year", "last_year",
      "last_30_days", "last_90_days", or None (no filter).
    """
    if not date_range or date_col not in df.columns:
        return df, []

    today = date.today()
    caveats = []

    def quarter_bounds(d: date):
        q = (d.month - 1) // 3
        start = date(d.year, q * 3 + 1, 1)
        end_month = q * 3 + 3
        end_day = 30 if end_month in (4, 6, 9, 11) else 31 if end_month != 2 else 28
        return start, date(d.year, end_month, end_day)

    if date_range == "this_quarter":
        start, end = quarter_bounds(today)
    elif date_range == "last_quarter":
        first_day = today.replace(day=1)
        last_q_last_day = first_day - timedelta(days=1)
        last_q_first_day = last_q_last_day.replace(day=1)
        start, end = quarter_bounds(last_q_first_day)
    elif date_range == "this_year":
        start, end = date(today.year, 1, 1), date(today.year, 12, 31)
    elif date_range == "last_year":
        start, end = date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)
    elif date_range == "last_30_days":
        start, end = today - timedelta(days=30), today
    elif date_range == "last_90_days":
        start, end = today - timedelta(days=90), today
    else:
        return df, [f"Unrecognized date range '{date_range}' — no date filter applied."]

    # Count how many rows have no date in that column
    has_date = df[date_col].notna()
    no_date_count = (~has_date).sum()

    filtered = df[has_date & (df[date_col] >= start) & (df[date_col] <= end)]

    if no_date_count > 0:
        caveats.append(
            f"{no_date_count} records have no '{date_col}' and were excluded from the {date_range} filter."
        )

    return filtered, caveats


def _apply_sector_filter(df: pd.DataFrame, sector: Optional[str]) -> pd.DataFrame:
    """Filter DataFrame to a specific sector. Case-insensitive."""
    if not sector or "sector" not in df.columns:
        return df
    return df[df["sector"].str.lower() == sector.lower()]


# ── Analytics functions ───────────────────────────────────────────────────────

def pipeline_metrics(deals_df: pd.DataFrame, sector: Optional[str] = None,
                     date_range: Optional[str] = None) -> dict:
    """
    Pipeline health metrics for Open deals in active stages (A–F).

    Definition: Pipeline = deals where deal_status == 'Open' AND
                deal_stage is in ACTIVE_PIPELINE_STAGES.
    """
    if deals_df.empty:
        return _empty_result("No deals data available.")

    total = len(deals_df)

    # Filter to open pipeline deals
    pipeline = deals_df[
        (deals_df["deal_status"] == "Open") &
        (deals_df["deal_stage"].isin(ACTIVE_PIPELINE_STAGES))
    ].copy()

    # Sector filter
    if sector:
        pipeline = _apply_sector_filter(pipeline, sector)

    # Date filter on tentative_close_date (most reliable date for open deals)
    pipeline, date_caveats = _apply_date_filter(pipeline, "tentative_close_date", date_range)

    caveats = list(date_caveats)

    # Value calculation — only where deal_value_inr is not null
    has_value = pipeline["deal_value_inr"].notna()
    no_value_count = (~has_value).sum()
    pipeline_with_value = pipeline[has_value]

    pipeline_value = pipeline_with_value["deal_value_inr"].sum()
    deal_count = len(pipeline)

    if no_value_count > 0:
        caveats.append(
            f"{no_value_count} pipeline deals have no value — counted but excluded from total value."
        )

    # By stage breakdown
    stage_breakdown = (
        pipeline.groupby("deal_stage", dropna=False)
        .agg(count=("id", "count"), value=("deal_value_inr", "sum"))
        .reset_index()
        .rename(columns={"deal_stage": "stage"})
        .to_dict("records")
    )

    # By sector breakdown (only if not already filtered to one sector)
    sector_breakdown = None
    if not sector:
        sector_breakdown = (
            pipeline[has_value]
            .groupby("sector", dropna=False)
            .agg(count=("id", "count"), value=("deal_value_inr", "sum"))
            .reset_index()
            .sort_values("value", ascending=False)
            .to_dict("records")
        )

    # Closure probability breakdown
    prob_breakdown = pipeline["closure_probability"].value_counts(dropna=False).to_dict()

    return {
        "result": {
            "pipeline_value_inr": round(pipeline_value, 2),
            "pipeline_count": deal_count,
            "avg_deal_value_inr": round(pipeline_value / len(pipeline_with_value), 2) if len(pipeline_with_value) else 0,
            "by_stage": stage_breakdown,
            "by_sector": sector_breakdown,
            "by_probability": {str(k): int(v) for k, v in prob_breakdown.items()},
            "sector_filter": sector,
            "date_range_filter": date_range,
        },
        "metadata": {
            "excluded": no_value_count,
            "caveats": caveats,
            "record_counts": {"total": total, "used": deal_count},
        },
    }


def revenue_metrics(deals_df: pd.DataFrame, sector: Optional[str] = None,
                    date_range: Optional[str] = None) -> dict:
    """
    Won deal revenue metrics.

    Won deals = Deal Status 'Won' OR Deal Stage in WON_STAGES.
    Revenue = sum of deal_value_inr where not null.
    Win rate = Won / (Won + Dead). Excludes Open and On Hold.
    """
    if deals_df.empty:
        return _empty_result("No deals data available.")

    total = len(deals_df)

    # Identify won deals by status OR stage
    won_mask = (deals_df["deal_status"] == "Won") | (deals_df["deal_stage"].isin(WON_STAGES))
    dead_mask = deals_df["deal_status"] == "Dead"

    won = deals_df[won_mask].copy()
    dead = deals_df[dead_mask].copy()

    # Sector filter
    if sector:
        won = _apply_sector_filter(won, sector)
        dead = _apply_sector_filter(dead, sector)

    # Date filter on close_date, fallback to tentative_close_date
    won, won_date_caveats = _apply_date_filter(won, "close_date", date_range)
    caveats = list(won_date_caveats)

    has_value = won["deal_value_inr"].notna()
    no_value_count = (~has_value).sum()
    won_with_value = won[has_value]

    total_revenue = won_with_value["deal_value_inr"].sum()
    won_count = len(won)
    dead_count = len(dead)
    win_rate = won_count / (won_count + dead_count) if (won_count + dead_count) > 0 else None

    if no_value_count > 0:
        caveats.append(
            f"{no_value_count} won deals have no value recorded — excluded from revenue total."
        )

    # Revenue by sector
    sector_breakdown = (
        won_with_value.groupby("sector", dropna=False)["deal_value_inr"]
        .agg(["count", "sum"])
        .reset_index()
        .rename(columns={"count": "deal_count", "sum": "revenue_inr"})
        .sort_values("revenue_inr", ascending=False)
        .to_dict("records")
    ) if not sector else None

    return {
        "result": {
            "total_revenue_inr": round(total_revenue, 2),
            "won_deal_count": won_count,
            "dead_deal_count": dead_count,
            "win_rate_pct": round(win_rate * 100, 1) if win_rate is not None else None,
            "avg_won_deal_value_inr": round(total_revenue / len(won_with_value), 2) if len(won_with_value) else 0,
            "by_sector": sector_breakdown,
            "sector_filter": sector,
            "date_range_filter": date_range,
        },
        "metadata": {
            "excluded": no_value_count,
            "caveats": caveats,
            "record_counts": {"total": total, "used": won_count},
        },
    }


def sector_performance(deals_df: pd.DataFrame, date_range: Optional[str] = None) -> dict:
    """
    Performance breakdown by sector across all deals.
    Shows pipeline value, won revenue, deal count, and win rate per sector.
    """
    if deals_df.empty:
        return _empty_result("No deals data available.")

    df = deals_df.copy()
    df, date_caveats = _apply_date_filter(df, "tentative_close_date", date_range)
    caveats = list(date_caveats)

    # Drop null-sector rows for sector breakdown
    no_sector = df["sector"].isna().sum()
    df_with_sector = df[df["sector"].notna()]
    if no_sector > 0:
        caveats.append(
            f"{no_sector} deals with no sector are excluded from sector breakdown."
        )

    won_mask = (df_with_sector["deal_status"] == "Won") | (df_with_sector["deal_stage"].isin(WON_STAGES))
    dead_mask = df_with_sector["deal_status"] == "Dead"
    pipeline_mask = (df_with_sector["deal_status"] == "Open") & (df_with_sector["deal_stage"].isin(ACTIVE_PIPELINE_STAGES))

    results = []
    for sec in sorted(df_with_sector["sector"].unique()):
        sec_df = df_with_sector[df_with_sector["sector"] == sec]

        # Apply masks on the sector-filtered sub-df to avoid index misalignment
        sec_won_mask = (sec_df["deal_status"] == "Won") | (sec_df["deal_stage"].isin(WON_STAGES))
        sec_dead_mask = sec_df["deal_status"] == "Dead"
        sec_pipeline_mask = (sec_df["deal_status"] == "Open") & (sec_df["deal_stage"].isin(ACTIVE_PIPELINE_STAGES))

        won_count = int(sec_won_mask.sum())
        dead_count = int(sec_dead_mask.sum())
        win_rate = won_count / (won_count + dead_count) if (won_count + dead_count) > 0 else None

        pipeline_val = sec_df.loc[sec_pipeline_mask, "deal_value_inr"].sum()
        won_val = sec_df.loc[sec_won_mask, "deal_value_inr"].sum()

        results.append({
            "sector": sec,
            "total_deals": len(sec_df),
            "open_pipeline_count": int(sec_pipeline_mask.sum()),
            "open_pipeline_value_inr": round(float(pipeline_val), 2),
            "won_count": won_count,
            "won_value_inr": round(float(won_val), 2),
            "dead_count": dead_count,
            "win_rate_pct": round(win_rate * 100, 1) if win_rate is not None else None,
        })

    results.sort(key=lambda x: x["won_value_inr"], reverse=True)

    return {
        "result": {"sectors": results},
        "metadata": {
            "excluded": int(no_sector),
            "caveats": caveats,
            "record_counts": {"total": len(deals_df), "used": len(df_with_sector)},
        },
    }


def work_order_metrics(wo_df: pd.DataFrame, sector: Optional[str] = None,
                       date_range: Optional[str] = None) -> dict:
    """
    Work order execution metrics.

    Active = Ongoing + Not Started + Pending Client + Partially Completed
    Completed = Execution Status 'Completed'
    Completion rate = Completed / (Completed + Active + Paused) where status is known.
    """
    if wo_df.empty:
        return _empty_result("No work orders data available.")

    total = len(wo_df)
    df = wo_df.copy()

    if sector:
        df = _apply_sector_filter(df, sector)

    df, date_caveats = _apply_date_filter(df, "start_date", date_range)
    caveats = list(date_caveats)

    # Status breakdown
    known_status = df[df["execution_status"].notna()]
    unknown_status = df[df["execution_status"].isna()]

    if len(unknown_status) > 0:
        caveats.append(
            f"{len(unknown_status)} work orders have no execution status and are excluded from completion rate."
        )

    completed = len(known_status[known_status["execution_status"] == "Completed"])
    active = len(known_status[known_status["execution_status"].isin(["Ongoing", "Not Started", "Pending Client", "Partially Completed"])])
    paused = len(known_status[known_status["execution_status"] == "Paused"])

    completion_denominator = completed + active + paused
    completion_rate = completed / completion_denominator if completion_denominator > 0 else None

    # Contract value totals
    total_contract = df["contract_value_excl_gst"].sum()
    total_billed = df["billed_excl_gst"].sum()
    total_collected = df["collected_incl_gst"].sum()
    total_receivable = df["amount_receivable"].sum()

    # By sector breakdown
    sector_breakdown = None
    if not sector:
        sector_breakdown = (
            df[df["sector"].notna()]
            .groupby("sector")
            .agg(
                count=("id", "count"),
                contract_value=("contract_value_excl_gst", "sum"),
                completed=("execution_status", lambda x: (x == "Completed").sum()),
            )
            .reset_index()
            .sort_values("contract_value", ascending=False)
            .to_dict("records")
        )

    # Status distribution
    status_dist = known_status["execution_status"].value_counts().to_dict()

    return {
        "result": {
            "total_work_orders": len(df),
            "completed_count": completed,
            "active_count": active,
            "paused_count": paused,
            "completion_rate_pct": round(completion_rate * 100, 1) if completion_rate is not None else None,
            "total_contract_value_excl_gst": round(float(total_contract), 2),
            "total_billed_excl_gst": round(float(total_billed), 2),
            "total_collected_incl_gst": round(float(total_collected), 2),
            "total_receivable": round(float(total_receivable), 2),
            "status_distribution": {str(k): int(v) for k, v in status_dist.items()},
            "by_sector": sector_breakdown,
            "sector_filter": sector,
        },
        "metadata": {
            "excluded": int(len(unknown_status)),
            "caveats": caveats,
            "record_counts": {"total": total, "used": len(df)},
        },
    }


def cross_board_conversion(deals_df: pd.DataFrame, wo_df: pd.DataFrame,
                           sector: Optional[str] = None) -> dict:
    """
    Analyze the relationship between won deals and work orders.

    JOIN KEY: Deals.deal_name ↔ WO.deal_name_masked
    CONFIRMED: 52 of 58 WO deal names appear in the Deals board.
    TRANSPARENCY: Client codes are different namespaces — NOT used for joining.

    This answers: "Are deals turning into actual project work?"

    Analysis:
    1. Won deals (by name)
    2. Which have corresponding work orders (by name match)
    3. Sector-level aggregate comparison where name match isn't possible
    """
    if deals_df.empty or wo_df.empty:
        return _empty_result("Both boards must have data for cross-board analysis.")

    caveats = [
        "Cross-board matching uses 'Deal Name' as the join key — confirmed 52 shared names across boards.",
        "Client codes use different namespaces (COMPANY_xxx vs WOCOMPANY_xxx) and are NOT used for matching.",
        "Deals without a matching work order may still have progressed — they may not be named identically in both systems.",
    ]

    # Won deals
    won_mask = (deals_df["deal_status"] == "Won") | (deals_df["deal_stage"].isin(WON_STAGES))
    won_deals = deals_df[won_mask].copy()

    if sector:
        won_deals = _apply_sector_filter(won_deals, sector)

    # All WO deal names (the join key set)
    wo_deal_names = set(wo_df["deal_name_masked"].dropna().str.strip())

    # Match won deals to work orders
    won_deals["has_work_order"] = won_deals["deal_name"].str.strip().isin(wo_deal_names)
    matched = won_deals[won_deals["has_work_order"]]
    unmatched = won_deals[~won_deals["has_work_order"]]

    match_rate = len(matched) / len(won_deals) if len(won_deals) > 0 else 0

    # Sector-level aggregate comparison
    deals_by_sector = (
        deals_df[won_mask & deals_df["sector"].notna()]
        .groupby("sector")
        .agg(won_count=("id", "count"), won_value=("deal_value_inr", "sum"))
        .reset_index()
    )
    wo_by_sector = (
        wo_df[wo_df["sector"].notna()]
        .groupby("sector")
        .agg(wo_count=("id", "count"), wo_contract_value=("contract_value_excl_gst", "sum"))
        .reset_index()
    )
    sector_comparison = pd.merge(deals_by_sector, wo_by_sector, on="sector", how="outer").fillna(0)
    sector_comparison_list = sector_comparison.to_dict("records")

    # Unmatched won deals — names only (to show "these won deals have no work order")
    unmatched_names = unmatched["deal_name"].dropna().tolist()

    return {
        "result": {
            "won_deal_count": len(won_deals),
            "won_deals_with_work_order": len(matched),
            "won_deals_without_work_order": len(unmatched),
            "match_rate_pct": round(match_rate * 100, 1),
            "sector_comparison": sector_comparison_list,
            "unmatched_deal_names": unmatched_names[:20],  # cap at 20 for display
            "sector_filter": sector,
        },
        "metadata": {
            "excluded": 0,
            "caveats": caveats,
            "record_counts": {
                "total": len(deals_df),
                "used": len(won_deals),
            },
        },
    }


def generate_leadership_update(deals_df: pd.DataFrame, wo_df: pd.DataFrame,
                               deals_quality: object, wo_quality: object) -> dict:
    """
    Structured leadership/board update summary.

    Pulls from all analytics functions to produce a concise snapshot:
    1. Pipeline summary
    2. Revenue/won deals summary
    3. Work order / execution summary
    4. Cross-board conversion (where defensible)
    5. Data quality caveats
    6. Follow-up areas

    All numbers come from deterministic functions — LLM only narrates this.
    """
    pipeline = pipeline_metrics(deals_df)
    revenue = revenue_metrics(deals_df)
    sector = sector_performance(deals_df)
    wo = work_order_metrics(wo_df)
    cross = cross_board_conversion(deals_df, wo_df)

    # Combine all caveats
    all_caveats = []
    for result in [pipeline, revenue, wo, cross]:
        all_caveats.extend(result["metadata"]["caveats"])
    all_caveats.extend(deals_quality.summary_lines() if deals_quality else [])
    all_caveats.extend(wo_quality.summary_lines() if wo_quality else [])
    # Deduplicate
    seen = set()
    unique_caveats = []
    for c in all_caveats:
        if c not in seen:
            seen.add(c)
            unique_caveats.append(c)

    return {
        "result": {
            "pipeline": pipeline["result"],
            "revenue": revenue["result"],
            "sector_performance": sector["result"],
            "work_orders": wo["result"],
            "cross_board": cross["result"],
        },
        "metadata": {
            "caveats": unique_caveats,
            "record_counts": {
                "deals": len(deals_df),
                "work_orders": len(wo_df),
            },
        },
    }


def data_quality_summary(deals_quality, wo_quality) -> dict:
    """Return a combined data quality report for both boards."""
    return {
        "result": {
            "deals": {
                "total_records": deals_quality.total_records,
                "header_rows_removed": deals_quality.header_rows_removed,
                "missing_sector": deals_quality.missing_sector,
                "missing_deal_value": deals_quality.missing_deal_value,
                "missing_close_date": deals_quality.missing_close_date,
                "issues": deals_quality.summary_lines(),
                "assumptions": deals_quality.assumptions,
            },
            "work_orders": {
                "total_records": wo_quality.total_records,
                "header_rows_removed": wo_quality.header_rows_removed,
                "missing_sector": wo_quality.missing_sector,
                "missing_execution_status": wo_quality.missing_execution_status,
                "issues": wo_quality.summary_lines(),
                "assumptions": wo_quality.assumptions,
            },
        },
        "metadata": {"caveats": [], "excluded": 0},
    }
