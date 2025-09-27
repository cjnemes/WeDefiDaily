// Test CoinMarketCap service directly with curl since import is complex
async function testCoinMarketCapDirect() {
  const apiKey = process.env.COINMARKETCAP_API_KEY;

  if (!apiKey) {
    console.error('COINMARKETCAP_API_KEY not found');
    return;
  }

  // Test the exact symbols we're trying to fetch
  const symbols = 'AERO,MORPHO,DRV,BASED,VIRTUAL,WETH,USDC';

  console.log(`Testing CoinMarketCap API with symbols: ${symbols}`);

  try {
    // Use built-in fetch (Node 18+)

    const response = await fetch(
      `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${symbols}&convert=USD`,
      {
        headers: {
          'X-CMC_PRO_API_KEY': apiKey,
          'Accepts': 'application/json',
          'Accept-Encoding': 'deflate, gzip'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`CoinMarketCap API error ${response.status}: ${errorText}`);
      return;
    }

    const data = await response.json();

    if (data.status.error_code !== 0) {
      console.error(`CoinMarketCap API error ${data.status.error_code}: ${data.status.error_message}`);
      return;
    }

    console.log('\n✅ CoinMarketCap API Response Summary:');
    console.log(`Status: ${data.status.error_code} (${data.status.error_message || 'Success'})`);
    console.log(`Credit count: ${data.status.credit_count}`);

    console.log('\n📊 Price Data:');
    for (const [symbol, tokenArray] of Object.entries(data.data)) {
      if (tokenArray && tokenArray[0] && tokenArray[0].quote && tokenArray[0].quote.USD) {
        const price = tokenArray[0].quote.USD.price;
        console.log(`  ${symbol}: $${price.toFixed(6)}`);
      } else {
        console.log(`  ${symbol}: No price data`);
      }
    }

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testCoinMarketCapDirect();