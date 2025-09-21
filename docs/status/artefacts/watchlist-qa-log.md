# Watchlist QA Log

## CLI Commands

```bash
# Token search sample
curl "$NEXT_PUBLIC_API_URL/v1/tokens?search=aero" | jq

# Price thresholds sample
curl "$NEXT_PUBLIC_API_URL/v1/price-thresholds?isEnabled=true" | jq
```

_Replace `<timestamp>` with actual execution time._

## Screenshots
- [ ] Empty state – desktop (`/screenshots/watchlist-empty-desktop.png`)
- [ ] Empty state – mobile (`/screenshots/watchlist-empty-mobile.png`)
- [ ] Token search dropdown (`/screenshots/watchlist-search.png`)
- [ ] Alerts list – mixed states (`/screenshots/watchlist-list.png`)
- [ ] Duplicate threshold error (`/screenshots/watchlist-duplicate.png`)
- [ ] Manual UUID validation (`/screenshots/watchlist-manual.png`)

```
mkdir -p docs/status/screenshots
# Save captures into docs/status/screenshots/...
```

Once gathered, reference these assets in issue #26 comment.
