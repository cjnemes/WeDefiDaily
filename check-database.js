#!/usr/bin/env node

const { spawn } = require('child_process');

async function queryDatabase(query) {
  return new Promise((resolve, reject) => {
    const psql = spawn('docker', [
      'compose', 'exec', '-T', 'postgres',
      'psql', '-U', 'wedefi', '-d', 'wedefi', '-c', query
    ], { stdio: 'pipe' });

    let output = '';
    let error = '';

    psql.stdout.on('data', (data) => {
      output += data.toString();
    });

    psql.stderr.on('data', (data) => {
      error += data.toString();
    });

    psql.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(error || `psql exited with code ${code}`));
      }
    });
  });
}

async function checkDatabase() {
  console.log('=== Database State Analysis ===\n');

  try {
    // Check if tables exist
    console.log('1. Checking database schema...');
    const tables = await queryDatabase("\\dt");
    console.log('Tables found:', tables.includes('No relations found') ? 'None' : 'Schema exists');

    if (tables.includes('No relations found')) {
      console.log('❌ Database schema not initialized');
      return;
    }

    // Check wallets
    console.log('\n2. Checking wallet data...');
    const walletCount = await queryDatabase('SELECT COUNT(*) FROM "Wallet";');
    const walletCountMatch = walletCount.match(/(\d+)/);
    const walletNum = walletCountMatch ? parseInt(walletCountMatch[1]) : 0;
    console.log(`Total wallets: ${walletNum}`);

    if (walletNum > 0) {
      const walletDetails = await queryDatabase('SELECT address, "chainId" FROM "Wallet" ORDER BY "createdAt";');
      console.log('Wallet addresses:', walletDetails);
    }

    // Check tokens
    console.log('\n3. Checking token data...');
    const tokenCount = await queryDatabase('SELECT COUNT(*) FROM "Token";');
    const tokenCountMatch = tokenCount.match(/(\d+)/);
    const tokenNum = tokenCountMatch ? parseInt(tokenCountMatch[1]) : 0;
    console.log(`Total tokens: ${tokenNum}`);

    // Check token balances
    console.log('\n4. Checking token balances...');
    const balanceCount = await queryDatabase('SELECT COUNT(*) FROM "TokenBalance";');
    const balanceCountMatch = balanceCount.match(/(\d+)/);
    const balanceNum = balanceCountMatch ? parseInt(balanceCountMatch[1]) : 0;
    console.log(`Total token balances: ${balanceNum}`);

    if (balanceNum > 0) {
      const recentBalances = await queryDatabase(`
        SELECT
          w.address as wallet,
          t.symbol,
          tb.quantity,
          tb."usdValue",
          tb."fetchedAt"
        FROM "TokenBalance" tb
        JOIN "Wallet" w ON tb."walletId" = w.id
        JOIN "Token" t ON tb."tokenId" = t.id
        ORDER BY tb."fetchedAt" DESC
        LIMIT 10;
      `);
      console.log('Recent balances:', recentBalances);
    }

    // Check price snapshots
    console.log('\n5. Checking price data...');
    const priceCount = await queryDatabase('SELECT COUNT(*) FROM "PriceSnapshot";');
    const priceCountMatch = priceCount.match(/(\d+)/);
    const priceNum = priceCountMatch ? parseInt(priceCountMatch[1]) : 0;
    console.log(`Total price snapshots: ${priceNum}`);

    if (priceNum > 0) {
      const recentPrices = await queryDatabase(`
        SELECT
          t.symbol,
          ps."priceUsd",
          ps.source,
          ps."recordedAt"
        FROM "PriceSnapshot" ps
        JOIN "Token" t ON ps."tokenId" = t.id
        ORDER BY ps."recordedAt" DESC
        LIMIT 5;
      `);
      console.log('Recent prices:', recentPrices);
    }

    // Summary of data freshness
    console.log('\n6. Data freshness analysis...');
    if (balanceNum > 0) {
      const lastSync = await queryDatabase(`
        SELECT MAX("fetchedAt") as last_balance_sync FROM "TokenBalance";
      `);
      console.log('Last balance sync:', lastSync);
    }

    if (priceNum > 0) {
      const lastPrice = await queryDatabase(`
        SELECT MAX("recordedAt") as last_price_update FROM "PriceSnapshot";
      `);
      console.log('Last price update:', lastPrice);
    }

  } catch (error) {
    console.error('Database check failed:', error.message);
  }

  console.log('\n=== Database Analysis Complete ===');
}

checkDatabase().catch(console.error);