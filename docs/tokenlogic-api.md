# TokenLogic API – Claude Code Guide

This document explains how to access TokenLogic Aave `/v1` API data from Claude Code sessions in this repository.

---

## Base URL

All public API endpoints are served from:

```text
https://api.tokenlogic.xyz
```

---

## Authentication

All documented routes under `/v1/aave/*` are protected by [Unkey](https://unkey.com) and require a bearer token with the `public.api` permission.

### Set your API key

```bash
export TOKENLOGIC_API_KEY="<your-unkey-api-key>"
```

### Make a request

```bash
curl -H "Authorization: Bearer $TOKENLOGIC_API_KEY" \
  "https://api.tokenlogic.xyz/v1/aave/latest"
```

> To request an API key, email <martin@tokenlogic.xyz> with your use case.

### Error codes

| Status | Meaning |
|--------|---------|
| `401`  | Missing or invalid API key |
| `403`  | Key exists but lacks the `public.api` permission |

---

## Standard Response Shape

Every endpoint returns JSON in this envelope:

```json
{
  "data": [ ...rows ],
  "lastUpdated": "2026-05-04T12:00:00.000Z"
}
```

`lastUpdated` is omitted on some endpoints.

---

## Common Query Parameters

### Timeseries endpoints

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `from`    | string | No       | Start date (`YYYY-MM-DD`, ISO datetime, or UNIX timestamp) |
| `to`      | string | No       | End date (same formats). Cannot be used without `from` |

### Snapshot/table endpoints

| Parameter | Type    | Required | Description |
|-----------|---------|----------|-------------|
| `limit`   | integer | No       | Max rows to return (default 1000, max 10 000) |
| `offset`  | integer | No       | Rows to skip for pagination (default 0) |

### Transaction feed endpoints

| Parameter    | Type    | Required | Description |
|--------------|---------|----------|-------------|
| `from`       | string  | No       | Start date filter |
| `limit`      | integer | No       | Rows per page (default 2000, max 5000) |
| `page`       | integer | No       | Page number (default 1) |
| `market_key` | string  | No       | Filter by market (e.g. `ethereum-core-v3`) |

---

## Endpoint Reference

### Aave Overview (protocol-level aggregates)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/latest` | Current protocol-wide TVL, deposits, borrows per market |
| `GET` | `/v1/aave/daily` | Daily protocol-wide metrics (no date range limit) |
| `GET` | `/v1/aave/hourly` | Hourly protocol-wide metrics (max 30-day window) |

**Response fields:** `timestamp`, `protocol`, `market_key`, `deposits_usd`, `borrows_usd`, `available_liquidity_usd`

---

### Aave Markets (per-reserve data)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/markets/latest` | Current data for every reserve across all markets |
| `GET` | `/v1/aave/markets/market-key` | List all available `market_key` values (unique + sorted) |
| `GET` | `/v1/aave/markets/{marketKey}/daily` | Daily per-reserve data for a market (default 365 days) |
| `GET` | `/v1/aave/markets/{marketKey}/hourly` | Hourly per-reserve data for a market (default 7 days, max 30-day window) |

**Path params:** `marketKey` – e.g. `ethereum-core-v3`

**Response fields:** `timestamp`, `protocol`, `market_key`, `reserve_address`, `reserve_symbol`, `deposits`, `borrows`, `available_liquidity`, `borrow_capacity`, `utilization`, `borrow_apy`, `supply_apy`, `reserve_price`

---

### Aave Reserves (single reserve lookup)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/reserves/list` | List all reserves (address + symbol) across all markets, optionally filtered by `?market_key=` (deduped + sorted) |
| `GET` | `/v1/aave/reserves/{marketKey}/{reserveAddress}/latest` | Current data for one reserve |
| `GET` | `/v1/aave/reserves/{marketKey}/{reserveAddress}/daily` | Daily data for one reserve |
| `GET` | `/v1/aave/reserves/{marketKey}/{reserveAddress}/hourly` | Hourly data for one reserve (default 7 days, max 30-day window) |

**Path params:** `marketKey`, `reserveAddress` (contract address)

**Response fields:** `market_key`, `reserve_address`, `reserve_symbol`, `deposits`, `borrows`, `available_liquidity`, `utilization`, `borrow_apy`, `supply_apy`, `reserve_price`

---

### Aave Revenue

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/revenue/daily` | Daily revenue across all markets (default 28 days) |
| `GET` | `/v1/aave/revenue/weekly` | Weekly revenue across all markets (default 180 days) |
| `GET` | `/v1/aave/revenue/monthly` | Monthly revenue |
| `GET` | `/v1/aave/revenue/quarterly` | Quarterly revenue |

**Response fields:** `timestamp`, `chain`, `source`, `market`, `type`, `reserve_symbol`, `token_amount`, `value_usd`

---

### Aave Expenses

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/expenses/monthly` | Monthly expense line items |
| `GET` | `/v1/aave/expenses/quarterly` | Quarterly expense line items |
| `GET` | `/v1/aave/expenses/yearly` | Yearly expense line items |

**Response fields:** `timestamp`, `statement_section`, `line_category`, `line_item`, `value_usd`

---

### Aave Treasury

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/treasury/latest` | Current DAO treasury holdings by wallet, chain, and asset |

**Response fields:** `chain`, `wallet_address`, `wallet_name`, `asset_address`, `asset_symbol`, `position_kind`, `market_key`, `balance`, `value_usd`, `yield_apr`

---

### Aave Liquidations

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/liquidations/txns` | Raw liquidation transaction events (default 2000, max 5000) |

**Response fields:** `timestamp`, `tx_hash`, `chain`, `market_key`, `user_liquidated`, `liquidator`, `collateral_symbol`, `collateral_address`, `debt_symbol`, `debt_address`, `collateral_amount`, `collateral_usd`, `debt_amount`, `debt_usd`, `liquidator_profit_usd`

---

### Aave Flash Loans

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/flash-loans/txns` | Raw flash loan transaction events (default 2000, max 5000) |

**Response fields:** `timestamp`, `tx_hash`, `market_key`, `initiator`, `target`, `reserve_symbol`, `reserve_address`, `amount`, `amount_usd`, `premium`, `premium_usd`, `fee_waived`

---

### Aave Umbrella

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/aave/umbrella/latest` | Current umbrella staking coverage by market and token |
| `GET` | `/v1/aave/umbrella/daily` | Daily umbrella coverage and APR (default 365 days) |

**Response fields:** `timestamp`, `chain`, `market`, `token_symbol`, `reserve_symbol`, `coverage_usd`, `coverage`, `target_coverage`, `umbrella_apr`, `v3_deposit_rate`, `combined_apr`, `target_coverage_usd`

---

## Example cURL Calls

```bash
# List available market keys
curl -H "Authorization: Bearer $TOKENLOGIC_API_KEY" \
  "https://api.tokenlogic.xyz/v1/aave/markets/market-key"

# Latest snapshot for all markets
curl -H "Authorization: Bearer $TOKENLOGIC_API_KEY" \
  "https://api.tokenlogic.xyz/v1/aave/markets/latest"

# Daily market data for ethereum-core-v3
curl -H "Authorization: Bearer $TOKENLOGIC_API_KEY" \
  "https://api.tokenlogic.xyz/v1/aave/markets/ethereum-core-v3/daily?from=2025-01-01&to=2025-12-31"

# Flash loan transactions filtered to one market
curl -H "Authorization: Bearer $TOKENLOGIC_API_KEY" \
  "https://api.tokenlogic.xyz/v1/aave/flash-loans/txns?market_key=ethereum-core-v3&limit=100"

# Revenue for Q1 2025
curl -H "Authorization: Bearer $TOKENLOGIC_API_KEY" \
  "https://api.tokenlogic.xyz/v1/aave/revenue/daily?from=2025-01-01&to=2025-03-31"
```

---

## Finding Endpoints in This Repo

Before querying an endpoint or generating new API calls, look at the canonical sources:

- **Endpoint catalogue (docs-side):** [`apps/aave/configs/apiCategoriesRegistry.ts`](apps/aave/configs/apiCategoriesRegistry.ts) — every public category, its endpoints, response fields, and data sources.
- **Route implementations:** [`apps/api/src/routes/v1/aave/`](apps/api/src/routes/v1/aave/) — the actual Hono handlers with exact path params, query params, and field names.
- **API docs UI:** [`apps/aave/app/(main)/api-docs/`](apps/aave/app/(main)/api-docs/) — the frontend that renders the reference at `https://app.aave.tokenlogic.xyz/api-docs`.

Never invent endpoint paths or field names. Always derive them from the sources above.

---

## Guidelines for Claude Code

- Always set `TOKENLOGIC_API_KEY` in your environment before making API calls.
- Never hard-code or commit API keys; use the environment variable.
- Use `Authorization: Bearer $TOKENLOGIC_API_KEY` on every `/v1/aave/*` request.
- If a `401` is returned, check the header is present and the key is valid.
- If a `403` is returned, the key exists but is missing the `public.api` permission — contact <martin@tokenlogic.xyz>.
- All dates accept `YYYY-MM-DD`, ISO datetime, or UNIX timestamp format.
- `to` cannot be supplied without `from`.
