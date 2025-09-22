# Price Watchlist Screenshots

Screenshots captured on 2025-01-21 as part of the Issue #26 validation pass led by Claude Code. All images are referenced in `docs/status/issue-26-validation-complete.md` and were taken against a fully configured local stack (Postgres + API + Web).

| File | Description | Viewport |
|------|-------------|----------|
| `dashboard-price-watchlist.png` | Dashboard with Price Watchlist section, "Add Alert" CTA, and helper text | 1280×800 |
| `dashboard-mobile.png` | Responsive layout of the dashboard/watchlist section | 390×844 |
| `add-alert-modal.png` | Modal with token selector and threshold form | 1280×800 |

## Notes
- All endpoints were verified prior to capture (`/v1/tokens`, `/v1/price-thresholds`).
- Wallet and token fixtures were seeded to render realistic data.
- Additional evidence (curl output, QA checklist) lives in the accompanying validation log.

If new screenshots are required in the future, follow `docs/runbooks/watchlist-validation.md` to reproduce the setup and capture flow.
