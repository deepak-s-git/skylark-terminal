"""
Tests for the deterministic analytics engine.
Covers empty inputs, null values, filter logic, and cross-board matching.
"""

import pytest
import pandas as pd
from datetime import date

from analytics.engine import (
    pipeline_metrics,
    revenue_metrics,
    sector_performance,
    work_order_metrics,
    cross_board_conversion,
)


# ── Sample DataFrames ─────────────────────────────────────────────────────────

def make_deals_df():
    """Minimal deals DataFrame matching the normalized schema."""
    return pd.DataFrame([
        # id, deal_name, owner_code, client_code, deal_status, close_date, tentative_close_date, created_date,
        # closure_probability, deal_value_inr, deal_stage, product_deal, sector
        {
            "id": "1", "deal_name": "Naruto", "deal_status": "Open",
            "deal_stage": "B. Sales Qualified Leads", "deal_value_inr": 489360.0,
            "sector": "Mining", "tentative_close_date": date(2026, 2, 26),
            "close_date": None, "created_date": date(2025, 12, 26),
            "closure_probability": "High",
        },
        {
            "id": "2", "deal_name": "Sasuke", "deal_status": "Won",
            "deal_stage": "H. Work Order Received", "deal_value_inr": 1101060.0,
            "sector": "Powerline", "tentative_close_date": date(2025, 6, 11),
            "close_date": date(2025, 6, 11), "created_date": date(2024, 11, 17),
            "closure_probability": "High",
        },
        {
            "id": "3", "deal_name": "Sakura", "deal_status": "Dead",
            "deal_stage": "L. Project Lost", "deal_value_inr": None,  # no value
            "sector": "Mining", "tentative_close_date": date(2025, 3, 20),
            "close_date": None, "created_date": date(2025, 10, 14),
            "closure_probability": "Low",
        },
        {
            "id": "4", "deal_name": "Goku", "deal_status": "Open",
            "deal_stage": "E. Proposal/Commercials Sent", "deal_value_inr": 611700.0,
            "sector": "Powerline", "tentative_close_date": date(2026, 2, 26),
            "close_date": None, "created_date": date(2025, 11, 12),
            "closure_probability": "Medium",
        },
        {
            "id": "5", "deal_name": "Luffy", "deal_status": "Won",
            "deal_stage": "G. Project Won", "deal_value_inr": 2348928.0,
            "sector": "Mining", "tentative_close_date": date(2025, 1, 6),
            "close_date": date(2025, 1, 6), "created_date": date(2025, 10, 14),
            "closure_probability": None,
        },
    ])


def make_wo_df():
    """Minimal work orders DataFrame matching the normalized schema."""
    return pd.DataFrame([
        {
            "id": "w1", "deal_name_masked": "Naruto", "customer_code": "WOCOMPANY_001",
            "serial_number": "SDPLDEAL-001", "execution_status": "Completed",
            "sector": "Mining", "contract_value_excl_gst": 264398.0,
            "billed_excl_gst": 264398.0, "collected_incl_gst": 311989.0,
            "amount_receivable": 0.0, "start_date": date(2025, 5, 31),
            "end_date": date(2025, 6, 3), "nature_of_work": "One time Project",
        },
        {
            "id": "w2", "deal_name_masked": "Sasuke", "customer_code": "WOCOMPANY_002",
            "serial_number": "SDPLDEAL-002", "execution_status": "Ongoing",
            "sector": "Powerline", "contract_value_excl_gst": 154150.0,
            "billed_excl_gst": None, "collected_incl_gst": None,
            "amount_receivable": 154150.0, "start_date": date(2025, 8, 11),
            "end_date": date(2025, 8, 15), "nature_of_work": "One time Project",
        },
        {
            "id": "w3", "deal_name_masked": "Unknown Deal", "customer_code": "WOCOMPANY_003",
            "serial_number": "SDPLDEAL-003", "execution_status": "Not Started",
            "sector": "Renewables", "contract_value_excl_gst": 184980.0,
            "billed_excl_gst": None, "collected_incl_gst": None,
            "amount_receivable": 184980.0, "start_date": None,
            "end_date": None, "nature_of_work": "Monthly Contract",
        },
    ])


# ── pipeline_metrics tests ────────────────────────────────────────────────────

class TestPipelineMetrics:
    def test_basic(self):
        result = pipeline_metrics(make_deals_df())
        r = result["result"]
        # Open deals in active stages: Naruto (SQL) and Goku (Proposal) = 2
        assert r["pipeline_count"] == 2
        assert r["pipeline_value_inr"] == pytest.approx(489360.0 + 611700.0)

    def test_sector_filter(self):
        result = pipeline_metrics(make_deals_df(), sector="Mining")
        r = result["result"]
        assert r["pipeline_count"] == 1  # Only Naruto is Mining + Open + Active stage
        assert r["sector_filter"] == "Mining"

    def test_empty_df(self):
        result = pipeline_metrics(pd.DataFrame())
        assert result["result"] is None
        assert len(result["metadata"]["caveats"]) > 0

    def test_no_value_deals_excluded_from_sum(self):
        df = make_deals_df()
        # All open pipeline deals have values — no exclusion expected
        result = pipeline_metrics(df)
        assert result["metadata"]["excluded"] == 0


# ── revenue_metrics tests ─────────────────────────────────────────────────────

class TestRevenueMetrics:
    def test_won_revenue(self):
        result = revenue_metrics(make_deals_df())
        r = result["result"]
        # Won: Sasuke (1101060) + Luffy (2348928) = 3449988
        assert r["won_deal_count"] == 2
        assert r["total_revenue_inr"] == pytest.approx(1101060.0 + 2348928.0)

    def test_win_rate(self):
        result = revenue_metrics(make_deals_df())
        r = result["result"]
        # Won=2, Dead=1 → win_rate = 2/3 = 66.7%
        assert r["win_rate_pct"] == pytest.approx(66.7, abs=0.1)

    def test_dead_deal_no_value_not_in_revenue(self):
        result = revenue_metrics(make_deals_df())
        # Sakura (Dead, no value) should not affect revenue total
        r = result["result"]
        assert r["total_revenue_inr"] == pytest.approx(3449988.0)

    def test_empty_df(self):
        result = revenue_metrics(pd.DataFrame())
        assert result["result"] is None


# ── work_order_metrics tests ──────────────────────────────────────────────────

class TestWorkOrderMetrics:
    def test_counts(self):
        result = work_order_metrics(make_wo_df())
        r = result["result"]
        assert r["total_work_orders"] == 3
        assert r["completed_count"] == 1
        assert r["active_count"] == 2  # Ongoing + Not Started

    def test_completion_rate(self):
        result = work_order_metrics(make_wo_df())
        r = result["result"]
        # 1 completed / (1 + 2) total = 33.3%
        assert r["completion_rate_pct"] == pytest.approx(33.3, abs=0.1)

    def test_null_status_excluded(self):
        df = make_wo_df().copy()
        df.loc[0, "execution_status"] = None  # make one null
        result = work_order_metrics(df)
        assert result["metadata"]["excluded"] == 1
        assert any("no execution status" in c for c in result["metadata"]["caveats"])

    def test_empty_df(self):
        result = work_order_metrics(pd.DataFrame())
        assert result["result"] is None

    def test_sector_filter(self):
        result = work_order_metrics(make_wo_df(), sector="Mining")
        r = result["result"]
        assert r["total_work_orders"] == 1
        assert r["completed_count"] == 1


# ── cross_board_conversion tests ──────────────────────────────────────────────

class TestCrossBoardConversion:
    def test_match_by_name(self):
        result = cross_board_conversion(make_deals_df(), make_wo_df())
        r = result["result"]
        # Won deals: Sasuke, Luffy
        # WO names: Naruto, Sasuke, Unknown Deal
        # Sasuke appears in both → 1 match
        assert r["won_deal_count"] == 2
        assert r["won_deals_with_work_order"] == 1
        assert r["won_deals_without_work_order"] == 1
        assert r["match_rate_pct"] == pytest.approx(50.0)

    def test_empty_wo_returns_zero_match(self):
        result = cross_board_conversion(make_deals_df(), pd.DataFrame())
        assert result["result"] is None  # both boards needed

    def test_caveats_always_present(self):
        result = cross_board_conversion(make_deals_df(), make_wo_df())
        # Must always disclose join key and namespace difference
        assert any("Deal Name" in c for c in result["metadata"]["caveats"])
        assert any("COMPANY_xxx" in c or "namespaces" in c for c in result["metadata"]["caveats"])
