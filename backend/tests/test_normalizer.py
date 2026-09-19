"""
Tests for the normalization layer.
Covers the actual data patterns found in the Excel files.
"""

import pytest
from datetime import date
import pandas as pd

from analytics.normalizer import (
    parse_date,
    parse_float,
    normalize_sector,
    normalize_deal_status,
    normalize_execution_status,
    normalize_deals,
    normalize_work_orders,
    DataQualityReport,
)


# ── parse_date ────────────────────────────────────────────────────────────────

class TestParseDate:
    def test_iso_string(self):
        assert parse_date("2025-05-31") == date(2025, 5, 31)

    def test_timestamp_string(self):
        assert parse_date("2025-05-31 00:00:00") == date(2025, 5, 31)

    def test_none_returns_none(self):
        assert parse_date(None) is None

    def test_empty_string_returns_none(self):
        assert parse_date("") is None

    def test_pandas_timestamp(self):
        import pandas as pd
        ts = pd.Timestamp("2025-06-15")
        assert parse_date(ts) == date(2025, 6, 15)

    def test_unparseable_returns_none(self):
        assert parse_date("not-a-date") is None

    def test_date_object_passthrough(self):
        d = date(2024, 3, 1)
        assert parse_date(d) == d


# ── parse_float ───────────────────────────────────────────────────────────────

class TestParseFloat:
    def test_plain_float(self):
        assert parse_float(489360.0) == 489360.0

    def test_integer(self):
        assert parse_float(154150) == 154150.0

    def test_none_returns_none(self):
        assert parse_float(None) is None

    def test_empty_string_returns_none(self):
        assert parse_float("") is None

    def test_na_returns_none(self):
        assert parse_float("N/A") is None
        assert parse_float("n/a") is None

    def test_comma_formatted(self):
        assert parse_float("1,200,000") == 1_200_000.0

    def test_lakh_suffix(self):
        result = parse_float("5L")
        assert result == 500_000.0

    def test_crore_suffix(self):
        result = parse_float("1.2cr")
        assert result == 12_000_000.0

    def test_pandas_nan_returns_none(self):
        import math
        assert parse_float(float("nan")) is None


# ── normalize_sector ─────────────────────────────────────────────────────────

class TestNormalizeSector:
    def test_exact_match(self):
        assert normalize_sector("Mining") == ("Mining", False)

    def test_lowercase(self):
        assert normalize_sector("mining") == ("Mining", False)

    def test_powerline(self):
        assert normalize_sector("Powerline") == ("Powerline", False)

    def test_renewables(self):
        assert normalize_sector("Renewables") == ("Renewables", False)
        assert normalize_sector("Renewable") == ("Renewables", False)

    def test_empty_returns_none(self):
        assert normalize_sector("") == (None, False)
        assert normalize_sector(None) == (None, False)

    def test_unknown_becomes_others_flagged(self):
        sector, ambiguous = normalize_sector("XYZ-Unknown-Industry")
        assert sector == "Others"
        assert ambiguous is True

    def test_header_junk_normalized(self):
        # "sector/service" is a header row value — normalizer should handle
        sector, _ = normalize_sector("sector/service")
        # After stripping in normalize_deals, this won't reach normalize_sector
        # but if it does, it maps to Others
        assert sector is not None


# ── normalize_deal_status ────────────────────────────────────────────────────

class TestNormalizeDealStatus:
    def test_open(self):
        assert normalize_deal_status("Open") == "Open"

    def test_won(self):
        assert normalize_deal_status("Won") == "Won"

    def test_dead(self):
        assert normalize_deal_status("Dead") == "Dead"
        assert normalize_deal_status("Lost") == "Dead"

    def test_on_hold(self):
        assert normalize_deal_status("On Hold") == "On Hold"

    def test_header_row_junk_returns_none(self):
        assert normalize_deal_status("Deal Status") is None

    def test_none_returns_none(self):
        assert normalize_deal_status(None) is None


# ── normalize_deals ───────────────────────────────────────────────────────────

class TestNormalizeDeals:
    def _make_item(self, name="Naruto", status="Open", sector="Mining", value=489360.0,
                   stage="B. Sales Qualified Leads"):
        return {
            "id": "123",
            "name": name,
            "created_at": "2025-12-26",
            "updated_at": "2025-12-26",
            "columns": {
                "Owner code": "OWNER_001",
                "Client Code": "COMPANY089",
                "Deal Status": status,
                "Close Date (A)": None,
                "Closure Probability": "High",
                "Masked Deal value": value,
                "Tentative Close Date": "2026-02-26",
                "Deal Stage": stage,
                "Product deal": "Pure Service",
                "Sector/service": sector,
                "Created Date": "2025-12-26",
            },
        }

    def test_basic_normalization(self):
        items = [self._make_item()]
        df, report = normalize_deals(items)
        assert len(df) == 1
        assert df.iloc[0]["deal_status"] == "Open"
        assert df.iloc[0]["sector"] == "Mining"
        assert df.iloc[0]["deal_value_inr"] == 489360.0

    def test_null_value_tracked(self):
        items = [self._make_item(value=None)]
        df, report = normalize_deals(items)
        assert report.missing_deal_value == 1
        assert len(report.caveats) > 0

    def test_null_sector_tracked(self):
        items = [self._make_item(sector=None)]
        df, report = normalize_deals(items)
        assert report.missing_sector == 1

    def test_header_row_removed(self):
        header_item = {
            "id": "0",
            "name": "Deal Name",
            "created_at": None,
            "updated_at": None,
            "columns": {"Deal Status": "Deal Status"},
        }
        real_item = self._make_item()
        df, report = normalize_deals([header_item, real_item])
        assert len(df) == 1
        assert report.header_rows_removed == 1

    def test_empty_input(self):
        df, report = normalize_deals([])
        assert df.empty
        assert report.total_records == 0


# ── normalize_work_orders ─────────────────────────────────────────────────────

class TestNormalizeWorkOrders:
    def _make_wo_item(self, name="Naruto", exec_status="Completed", sector="Mining",
                      contract_value=264398.08):
        return {
            "id": "456",
            "name": name,
            "created_at": "2025-10-01",
            "updated_at": "2025-10-01",
            "columns": {
                "Customer Name Code": "WOCOMPANY_002",
                "Serial #": "SDPLDEAL-075",
                "Nature of Work": "One time Project",
                "Execution Status": exec_status,
                "Data Delivery Date": "2025-09-27",
                "Date of PO/LOI": "2025-10-29",
                "Document Type": "Purchase Order",
                "Probable Start Date": "2025-05-31",
                "Probable End Date": "2025-06-03",
                "BD/KAM Personnel code": "OWNER_003",
                "Sector": sector,
                "Type of Work": "Raw images/videography",
                "Is any Skylark software platform part of the client deliverables in this deal?": "NONE",
                "Amount in Rupees (Excl of GST) (Masked)": contract_value,
                "Amount in Rupees (Incl of GST) (Masked)": contract_value * 1.18,
                "Billed Value in Rupees (Excl of GST.) (Masked)": None,
                "Collected Amount in Rupees (Incl of GST.) (Masked)": None,
                "Amount Receivable (Masked)": 0,
                "Invoice Status": "Fully Billed",
                "WO Status (billed)": "Open",
                "Billing Status": "Update Required",
            },
        }

    def test_basic_normalization(self):
        items = [self._make_wo_item()]
        df, report = normalize_work_orders(items)
        assert len(df) == 1
        assert df.iloc[0]["execution_status"] == "Completed"
        assert df.iloc[0]["sector"] == "Mining"
        assert df.iloc[0]["contract_value_excl_gst"] == 264398.08

    def test_missing_status_tracked(self):
        items = [self._make_wo_item(exec_status=None)]
        df, report = normalize_work_orders(items)
        assert report.missing_execution_status == 1

    def test_empty_input(self):
        df, report = normalize_work_orders([])
        assert df.empty
        assert report.total_records == 0
