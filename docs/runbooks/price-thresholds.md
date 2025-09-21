# Price Threshold Management Runbook

Use this guide to configure and manage price alert thresholds for portfolio tokens.

## Prerequisites
- API server running locally or in target environment
- Price data available (requires recent `sync:balances` or price snapshots)
- Understanding of target token addresses and wallet IDs

## Configuration

### Create Price Threshold
```bash
curl -X POST "$NEXT_PUBLIC_API_URL/v1/price-thresholds" \
  -H "Content-Type: application/json" \
  -d '{
    "walletId": "optional-wallet-uuid",
    "tokenId": "token-uuid-from-database",
    "thresholdType": "above",
    "thresholdPrice": "1.50",
    "isEnabled": true
  }'
```

### List Active Thresholds
```bash
curl "$NEXT_PUBLIC_API_URL/v1/price-thresholds?isEnabled=true"
```

### Update Threshold
```bash
curl -X PUT "$NEXT_PUBLIC_API_URL/v1/price-thresholds/{threshold-id}" \
  -H "Content-Type: application/json" \
  -d '{
    "thresholdPrice": "2.00",
    "isEnabled": true
  }'
```

### Delete Threshold
```bash
curl -X DELETE "$NEXT_PUBLIC_API_URL/v1/price-thresholds/{threshold-id}"
```

## Monitoring

### Check Price Thresholds
```bash
npm run check:price-thresholds
```

This job:
- Finds all enabled thresholds that haven't triggered recently (6-hour cooldown)
- Compares current token prices to threshold values
- Generates alerts for triggered thresholds
- Updates `lastTriggeredAt` to prevent spam

### Monitor Alert Output
```bash
curl "$NEXT_PUBLIC_API_URL/v1/alerts?type=price_threshold&status=pending"
```

## Threshold Types
- **above**: Trigger when price rises above threshold
- **below**: Trigger when price falls below threshold

## Scope Options
- **Global threshold** (`walletId: null`): Alerts for token regardless of wallet
- **Wallet-specific** (`walletId: "uuid"`): Only alerts for specific wallet holdings

## Best Practices
1. **Avoid duplicate thresholds**: The system prevents identical thresholds for same wallet/token/type/price
2. **Use meaningful prices**: Set thresholds at significant support/resistance levels
3. **Consider cooldown**: 6-hour cooldown prevents alert spam during volatile periods
4. **Monitor effectiveness**: Review triggered alerts and adjust thresholds based on usefulness

## Example Workflows

### Set Stop-Loss Alert
```bash
# Alert when AERO drops below $1.00
curl -X POST "$NEXT_PUBLIC_API_URL/v1/price-thresholds" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "aero-token-uuid",
    "thresholdType": "below",
    "thresholdPrice": "1.00"
  }'
```

### Set Take-Profit Alert
```bash
# Alert when AERO rises above $5.00
curl -X POST "$NEXT_PUBLIC_API_URL/v1/price-thresholds" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenId": "aero-token-uuid",
    "thresholdType": "above",
    "thresholdPrice": "5.00"
  }'
```

### Disable Without Deleting
```bash
# Temporarily disable threshold
curl -X PUT "$NEXT_PUBLIC_API_URL/v1/price-thresholds/{threshold-id}" \
  -H "Content-Type: application/json" \
  -d '{"isEnabled": false}'
```

## Integration with Digest
Price threshold alerts appear in:
- Daily digest "Warnings" section
- Console output during `check:price-thresholds`
- `/v1/alerts` API endpoint

## Troubleshooting
- **No alerts firing**: Check price data freshness and threshold configuration
- **Too many alerts**: Increase cooldown or adjust threshold prices
- **Missing tokens**: Ensure tokens exist in database with recent price snapshots
- **Permission errors**: Verify API endpoint accessibility and request format