"""
monday.com GraphQL query strings.

Board structure (confirmed from actual Excel inspection):

DEALS BOARD columns (from 'Deal funnel Data.xlsx'):
  - Deal Name           → item name
  - Owner code          → text (OWNER_001..007)
  - Client Code         → text (COMPANY_xxx)
  - Deal Status         → status (Open, Won, Dead, On Hold)
  - Close Date (A)      → date (actual close — heavily null: 318/346 missing)
  - Closure Probability → text (High, Medium, Low)
  - Masked Deal value   → numbers (INR excl GST; 181/346 null)
  - Tentative Close Date→ date
  - Deal Stage          → text (A. Lead Generated ... H. Work Order Received)
  - Product deal        → text (Pure Service, Hardware, Spectra Deal, etc.)
  - Sector/service      → text (Mining, Powerline, Renewables, etc.)
  - Created Date        → date

WORK ORDERS BOARD columns (from 'Work_Order_Tracker Data.xlsx'):
  - Deal name masked    → item name (shared with Deals 'Deal Name' — 52 overlapping names)
  - Customer Name Code  → text (WOCOMPANY_xxx — different namespace from Deals)
  - Serial #            → text (SDPLDEAL-xxx — work order ID)
  - Nature of Work      → text (One time Project, Monthly Contract, etc.)
  - Last executed month → text (month name, heavily null)
  - Execution Status    → status (Completed, Ongoing, Not Started, etc.)
  - Data Delivery Date  → date (heavily null: 118/176)
  - Date of PO/LOI      → date
  - Document Type       → text (Purchase Order, LOA/LOI, Email Confirmation)
  - Probable Start Date → date
  - Probable End Date   → date
  - BD/KAM Personnel code → text (OWNER_xxx — overlaps with Deals)
  - Sector              → text (Mining, Powerline, Construction, Railways, Renewables, Others)
  - Type of Work        → text
  - Skylark platform    → text
  - Last invoice date   → date
  - latest invoice no.  → text
  - Amount excl GST     → numbers (INR)
  - Amount incl GST     → numbers (INR)
  - Billed excl GST     → numbers
  - Billed incl GST     → numbers
  - Collected Amount    → numbers
  - Amount to be billed excl → numbers
  - Amount to be billed incl → numbers
  - Amount Receivable   → numbers
  - AR Priority account → text
  - Quantity by Ops     → numbers
  - Quantities as per PO → text (mixed: "5360 HA", "4", "3000")
  - Quantity billed     → numbers
  - Balance in quantity → numbers
  - Invoice Status      → text (Fully Billed, Partially Billed, Not billed yet, Stuck)
  - Expected Billing Month → text (mostly null)
  - Actual Billing Month   → text (month name)
  - Actual Collection Month → text (mostly null)
  - WO Status (billed)  → status (Open, Closed; 74/176 null)
  - Collection status   → text (all null)
  - Collection Date     → date (all null)
  - Billing Status      → text (Update Required, Partially Billed, BIlled, Not Billable, Stuck)

CROSS-BOARD RELATIONSHIP:
  - 'Deal Name' (Deals) ↔ 'Deal name masked' (WO) — 52 of 58 WO names appear in Deals
  - This is the defensible join key. Use with transparency about partial coverage.
  - Client codes are DIFFERENT namespaces — do NOT join on these.
  - Sector values overlap on 6 shared categories — valid for aggregate comparison.
"""

# Fetch all items from a board with cursor-based pagination
FETCH_BOARD_ITEMS = """
query ($board_id: ID!, $cursor: String, $limit: Int) {
  boards(ids: [$board_id]) {
    id
    name
    columns {
      id
      title
      type
    }
    items_page(limit: $limit, cursor: $cursor) {
      cursor
      items {
        id
        name
        created_at
        updated_at
        column_values {
          id
          column {
            title
          }
          text
          value
          type
        }
      }
    }
  }
}
"""

# Lightweight query to verify connection and get board metadata only
BOARD_METADATA = """
query ($board_id: ID!) {
  boards(ids: [$board_id]) {
    id
    name
    items_count
    columns {
      id
      title
      type
    }
  }
}
"""

# Verify API token is valid
WHOAMI = """
query {
  me {
    id
    name
    email
    account {
      id
      name
    }
  }
}
"""
