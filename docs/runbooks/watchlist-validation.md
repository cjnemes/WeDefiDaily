# Price Watchlist Validation Runbook

Use this checklist before closing "Phase 3b – Price watchlist polish" in order to give design and product confidence that the new UX flow works end-to-end.

## Pre-requisites
- Web app running locally (`npm run dev --workspace @wedefidaily/web`).
- API running locally (`npm run dev --workspace @wedefidaily/api`).
- A wallet and token dataset in Postgres (run the sync jobs or seed script if the database is empty).
- Optional: a browser extension for capturing full-page screenshots.

## Test Matrix
Perform the steps below on two viewports:
- Desktop ~1280px width.
- Mobile ~390px width (DevTools device emulation is fine).

### 1. Loading and Empty State
1. Open the Dashboard and scroll to **Price Watchlist**.
2. If alerts already exist, delete them so the empty state renders.
3. Confirm the card shows the neutral encouragement copy and “Add Alert” CTA.
4. Capture a screenshot of the empty state (desktop + mobile).

### 2. Token Search Flow
1. Click **Add Alert**.
2. Ensure the **Search** mode is active by default.
3. Type at least two characters of a token symbol (e.g., `AERO`) and wait for results.
4. Select a token, confirm the symbol/name + chain teaser appears in the selector.
5. Enter a threshold price and create the alert.
6. Verify the new alert chip appears in the list showing:
   - Token symbol and name.
   - Above/below pill with formatted price.
   - Wallet label or shortened address.
7. Capture a screenshot of this success state.

### 3. Manual UUID Entry
1. Re-open **Add Alert**.
2. Switch to **Manual ID** mode.
3. Paste an invalid UUID and attempt to submit – confirm validation prevents submission.
4. Paste a valid token UUID (copy from the API response or database) and create the alert.
5. Verify alert renders correctly.

### 4. Duplicate Threshold Handling
1. Attempt to create a second alert with identical token/type/price.
2. Confirm the form displays the duplicate error returned by the API (409) and stays open.
3. Adjust the price slightly and ensure submission succeeds.

### 5. Edit Flow
1. Click **Edit** on an alert.
2. Change the price and disable the alert.
3. Save and confirm the alert pill updates (disabled badge present).
4. Re-open edit modal to confirm the new values persist.

### 6. Delete Flow
1. Delete one alert and confirm the confirmation dialog appears.
2. Ensure the button enters a “Deleting…” state and disappears from the list after success.
3. Delete remaining alerts to re-validate the empty state.

## API Smoke Tests
Run these curl commands to verify server behaviour:

```bash
curl "$NEXT_PUBLIC_API_URL/v1/tokens?search=usdc" | jq
curl "$NEXT_PUBLIC_API_URL/v1/price-thresholds?isEnabled=true" | jq
```

The `/v1/tokens` response should include `chainId`, `symbol`, `name`, and `address`. Price thresholds should return associated token metadata.

## Follow-up
- Attach captured screenshots to GitHub issue #26 before closing.
- If any validation step fails, file a checklist item comment on the issue and keep the PR in draft until resolved.
