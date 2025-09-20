import Decimal from 'decimal.js';

export interface TokenBalanceResult {
  contractAddress: string;
  rawBalance: bigint;
}

export interface TokenMetadataResult {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
}

export interface NormalizedBalance extends TokenMetadataResult {
  contractAddress: string;
  rawBalance: bigint;
  quantity: Decimal;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown[];
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const TEN = new Decimal(10);

function toQuantity(raw: bigint, decimals: number | null | undefined): Decimal {
  const safeDecimals = typeof decimals === 'number' && decimals >= 0 ? decimals : 18;
  if (raw === BigInt(0)) {
    return new Decimal(0);
  }

  const numerator = new Decimal(raw.toString());
  const denominator = TEN.pow(safeDecimals);
  return numerator.div(denominator);
}

async function jsonRpcFetch<T>(rpcUrl: string, body: JsonRpcRequest): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Alchemy RPC error ${response.status}: ${errorBody}`);
  }

  const parsed = (await response.json()) as JsonRpcResponse<T>;
  if (parsed.error) {
    throw new Error(`Alchemy RPC error ${parsed.error.code}: ${parsed.error.message}`);
  }

  if (parsed.result === undefined) {
    throw new Error('Alchemy RPC error: missing result');
  }

  return parsed.result;
}

export async function getWalletTokenBalances(rpcUrl: string, address: string): Promise<TokenBalanceResult[]> {
  const result = await jsonRpcFetch<{ tokenBalances: Array<{ contractAddress: string; tokenBalance: string }> }>(
    rpcUrl,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenBalances',
      params: [address, 'erc20'],
    }
  );

  return result.tokenBalances
    .map((token) => ({
      contractAddress: token.contractAddress.toLowerCase(),
      rawBalance: BigInt(token.tokenBalance ?? '0x0'),
    }))
    .filter((token) => token.rawBalance > BigInt(0));
}

export async function getWalletNativeBalance(rpcUrl: string, address: string): Promise<bigint> {
  const result = await jsonRpcFetch<string>(rpcUrl, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [address, 'latest'],
  });

  return BigInt(result);
}

export async function getTokenMetadata(rpcUrl: string, contractAddress: string): Promise<TokenMetadataResult> {
  const metadata = await jsonRpcFetch<{ name: string | null; symbol: string | null; decimals: string | number | null }>(
    rpcUrl,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getTokenMetadata',
      params: [contractAddress],
    }
  );

  const decimalsNumber = typeof metadata.decimals === 'string' ? Number(metadata.decimals) : metadata.decimals;

  return {
    name: metadata.name ?? null,
    symbol: metadata.symbol ?? null,
    decimals: typeof decimalsNumber === 'number' && Number.isFinite(decimalsNumber) ? decimalsNumber : null,
  };
}

export async function getNormalizedBalances(
  rpcUrl: string,
  address: string
): Promise<{ erc20: NormalizedBalance[]; native: NormalizedBalance | null }> {
  const [nativeRawBalance, tokenBalances] = await Promise.all([
    getWalletNativeBalance(rpcUrl, address),
    getWalletTokenBalances(rpcUrl, address),
  ]);

  const erc20 = await Promise.all(
    tokenBalances.map(async (balance) => {
      const metadata = await getTokenMetadata(rpcUrl, balance.contractAddress);
      const quantity = toQuantity(balance.rawBalance, metadata.decimals);

      return {
        contractAddress: balance.contractAddress,
        rawBalance: balance.rawBalance,
        quantity,
        ...metadata,
      } satisfies NormalizedBalance;
    })
  );

  const nativeMetadata: TokenMetadataResult = {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  };

  const native = nativeRawBalance > BigInt(0)
    ? {
        contractAddress: 'native',
        rawBalance: nativeRawBalance,
        quantity: toQuantity(nativeRawBalance, nativeMetadata.decimals),
        ...nativeMetadata,
      }
    : null;

  return { erc20, native };
}
