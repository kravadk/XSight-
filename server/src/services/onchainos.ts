import { createHmac } from 'node:crypto';
import { Contract, getAddress } from 'ethers';
import { env, isConfigured } from '../config/env.js';
import { X_LAYER } from '../utils/xlayer.js';
import { getProvider, getSigner } from './wallet.js';
import { recordGasSpend } from './economyLoop.js';
import { recordActivity } from './activityTracker.js';
import type {
  TokenBalance,
  TrendingToken,
  SwapQuote,
  SwapResult,
  TokenSecurity,
} from '../types/index.js';

const NATIVE_TOKEN_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
];

const BASE_URL = 'https://web3.okx.com';
const X_LAYER_CHAIN = String(X_LAYER.chainId);

export class OnchainOsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnchainOsError';
  }
}

function requireConfigured() {
  if (!isConfigured.okx()) {
    throw new OnchainOsError('OnchainOS not configured: OKX_API_KEY/SECRET/PASSPHRASE/PROJECT_ID required');
  }
}

function sign(timestamp: string, method: string, requestPath: string, body: string): string {
  const prehash = timestamp + method.toUpperCase() + requestPath + body;
  return createHmac('sha256', env.okxSecretKey).update(prehash).digest('base64');
}

function authHeaders(method: string, requestPath: string, body = ''): Record<string, string> {
  const timestamp = new Date().toISOString();
  return {
    'OK-ACCESS-KEY': env.okxApiKey,
    'OK-ACCESS-SIGN': sign(timestamp, method, requestPath, body),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': env.okxPassphrase,
    'OK-ACCESS-PROJECT': env.okxProjectId,
    'Content-Type': 'application/json',
  };
}

async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function okxGet<T = unknown>(requestPath: string, retries = 2): Promise<T> {
  const res = await fetch(BASE_URL + requestPath, {
    method: 'GET',
    headers: authHeaders('GET', requestPath, ''),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 1) * 1000;
    await sleep(Math.max(retryAfter, 1000));
    return okxGet<T>(requestPath, retries - 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new OnchainOsError(
      `OKX GET ${requestPath} -> ${res.status} ${res.statusText} :: ${body.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

async function okxPost<T = unknown>(requestPath: string, payload: unknown, retries = 1): Promise<T> {
  const body = JSON.stringify(payload);
  const res = await fetch(BASE_URL + requestPath, {
    method: 'POST',
    headers: authHeaders('POST', requestPath, body),
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 429 && retries > 0) {
    await sleep(1500);
    return okxPost<T>(requestPath, payload, retries - 1);
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new OnchainOsError(
      `OKX POST ${requestPath} -> ${res.status} ${res.statusText} :: ${errBody.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value as T;
  }
  return undefined;
}

function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

const WALLET_CACHE_TTL = 30_000;
const MARKET_CACHE_TTL = 60_000;

export async function getWalletBalances(
  address: string,
  chainId: string = X_LAYER_CHAIN,
): Promise<TokenBalance[]> {
  requireConfigured();
  if (!address) throw new OnchainOsError('address required');

  const cacheKey = `balances:${chainId}:${address.toLowerCase()}`;
  const cached = getCached<TokenBalance[]>(cacheKey);
  if (cached) return cached;

  const path = `/api/v5/wallet/asset/all-token-balances-by-address?address=${address}&chains=${chainId}&filter=1`;
  const res = await okxGet<OkxEnvelope<Array<{ tokenAssets?: unknown[] }>>>(path);
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx code=${res.code} msg=${res.msg}`);
  }
  const list = res.data?.[0]?.tokenAssets ?? [];
  const result: TokenBalance[] = list.map((raw) => {
    const t = raw as Record<string, unknown>;
    const amount = Number(t.balance ?? 0);
    const price = Number(t.tokenPrice ?? 0);
    return {
      symbol: String(t.symbol ?? ''),
      address: String(t.tokenAddress ?? NATIVE_TOKEN_ADDRESS),
      amount,
      usdValue: amount * price,
    };
  });

  setCached(cacheKey, result, WALLET_CACHE_TTL);
  recordActivity('wallet.balance', address);
  return result;
}

interface OkxPriceInfo {
  chainIndex: string;
  tokenContractAddress: string;
  price: string;
  marketCap?: string;
  liquidity?: string;
  holders?: string;
  volume24H?: string;
  priceChange1H?: string;
  priceChange4H?: string;
  priceChange24H?: string;
  maxPrice?: string;
  minPrice?: string;
}

export interface OkxTokenCatalogEntry {
  decimals: string;
  tokenContractAddress: string;
  tokenLogoUrl?: string;
  tokenName: string;
  tokenSymbol: string;
}

export async function getTokenPrice(
  tokenContractAddress: string,
  chainId: string = X_LAYER_CHAIN,
): Promise<number> {
  requireConfigured();
  const res = await okxPost<OkxEnvelope<Array<{ price?: string }>>>(
    '/api/v6/dex/market/price',
    [{ chainIndex: chainId, tokenContractAddress }],
  );
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx code=${res.code} msg=${res.msg}`);
  }
  recordActivity('market.tokenPrice', tokenContractAddress);
  return Number(res.data?.[0]?.price ?? 0);
}

export async function getTokenPriceInfo(
  tokenContractAddress: string,
  chainId: string = X_LAYER_CHAIN,
): Promise<OkxPriceInfo> {
  requireConfigured();
  const cacheKey = `price-info:${chainId}:${tokenContractAddress.toLowerCase()}`;
  const cached = getCached<OkxPriceInfo>(cacheKey);
  if (cached) return cached;

  const res = await okxPost<OkxEnvelope<OkxPriceInfo[]>>(
    '/api/v6/dex/market/price-info',
    [{ chainIndex: chainId, tokenContractAddress }],
  );
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx code=${res.code} msg=${res.msg}`);
  }
  const info = res.data?.[0];
  if (!info) throw new OnchainOsError('price-info returned no data');
  setCached(cacheKey, info, MARKET_CACHE_TTL);
  recordActivity('market.priceInfo', tokenContractAddress);
  return info;
}

export async function getAllTokens(chainId: string = X_LAYER_CHAIN): Promise<OkxTokenCatalogEntry[]> {
  const cacheKey = `all-tokens:${chainId}`;
  const cached = getCached<OkxTokenCatalogEntry[]>(cacheKey);
  if (cached) return cached;

  const res = await okxGet<OkxEnvelope<OkxTokenCatalogEntry[]>>(
    `/api/v6/dex/aggregator/all-tokens?chainIndex=${chainId}`,
  );
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx code=${res.code} msg=${res.msg}`);
  }
  const tokens = res.data ?? [];
  setCached(cacheKey, tokens, 10 * 60_000);
  recordActivity('market.allTokens', `chain=${chainId}`);
  return tokens;
}

const TRENDING_SEED_SYMBOLS = ['OKB', 'WOKB', 'USDT', 'USDC', 'WETH', 'USDG'];

export async function getTrendingTokens(
  chainId: string = X_LAYER_CHAIN,
  limit = 10,
): Promise<TrendingToken[]> {
  requireConfigured();
  const cacheKey = `trending:${chainId}:${limit}`;
  const cached = getCached<TrendingToken[]>(cacheKey);
  if (cached) return cached;

  const catalog = await getAllTokens(chainId);
  const seed = catalog.filter((t) =>
    TRENDING_SEED_SYMBOLS.includes(t.tokenSymbol.toUpperCase()),
  );
  const candidates = seed.length > 0 ? seed : catalog.slice(0, limit);

  const infos = await Promise.all(
    candidates.map((t) =>
      getTokenPriceInfo(t.tokenContractAddress, chainId).catch(() => null),
    ),
  );

  const result: TrendingToken[] = candidates
    .map((t, i) => {
      const info = infos[i];
      if (!info) return null;
      return {
        symbol: t.tokenSymbol,
        address: t.tokenContractAddress,
        priceUsd: Number(info.price ?? 0),
        change24h: Number(info.priceChange24H ?? 0),
        volume24h: Number(info.volume24H ?? 0),
      };
    })
    .filter((t): t is TrendingToken => t !== null)
    .sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h))
    .slice(0, limit);

  setCached(cacheKey, result, MARKET_CACHE_TTL);
  recordActivity('market.trending', `n=${result.length}`);
  return result;
}

interface OkxQuoteRouter {
  dexProtocol?: { dexName?: string };
}
interface OkxQuoteToken {
  tokenUnitPrice?: string;
  decimal?: string;
  tokenSymbol?: string;
}
interface OkxQuoteData {
  toTokenAmount?: string;
  fromTokenAmount?: string;
  estimateGasFee?: string;
  priceImpactPercent?: string;
  dexRouterList?: OkxQuoteRouter[];
  fromToken?: OkxQuoteToken;
  toToken?: OkxQuoteToken;
}

export async function getSwapQuote(params: {
  fromToken: string;
  toToken: string;
  amount: string;
  chainId?: string;
  userAddress: string;
}): Promise<SwapQuote> {
  requireConfigured();
  const chainId = params.chainId ?? X_LAYER_CHAIN;
  const path =
    `/api/v6/dex/aggregator/quote?chainIndex=${chainId}` +
    `&fromTokenAddress=${params.fromToken}` +
    `&toTokenAddress=${params.toToken}` +
    `&amount=${params.amount}`;
  const res = await okxGet<OkxEnvelope<OkxQuoteData[]>>(path);
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx code=${res.code} msg=${res.msg}`);
  }
  const q = res.data?.[0];
  if (!q) throw new OnchainOsError('quote returned no data');

  const fromDecimal = Number(q.fromToken?.decimal ?? 18);
  const toDecimal = Number(q.toToken?.decimal ?? 18);
  const fromHuman = Number(q.fromTokenAmount ?? params.amount) / 10 ** fromDecimal;
  const toHuman = Number(q.toTokenAmount ?? 0) / 10 ** toDecimal;
  const rate = fromHuman > 0 ? (toHuman / fromHuman).toFixed(8) : '0';
  const dexNames = (q.dexRouterList ?? [])
    .map((r) => r.dexProtocol?.dexName ?? '?')
    .join(' → ');
  const gasWei = Number(q.estimateGasFee ?? 0);
  const estGasOkb = (gasWei / 1e18).toFixed(8);
  recordActivity('dex.quote', `${params.fromToken} -> ${params.toToken}`);
  return {
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: String(fromHuman),
    toAmount: String(toHuman),
    rate,
    estGasOkb,
    routeSummary: dexNames || 'OKX-DEX',
    priceImpactPct: Number(q.priceImpactPercent ?? 0),
  };
}

interface OkxSwapTx {
  data: string;
  to: string;
  from: string;
  value: string;
  gas: string;
  gasPrice: string;
  maxPriorityFeePerGas?: string;
  minReceiveAmount?: string;
}

interface OkxSwapResponse {
  routerResult?: { toTokenAmount?: string };
  tx: OkxSwapTx & { callData?: string };
}

interface OkxApproveTx {
  data?: string;
  callData?: string;
  dexContractAddress: string;
  gasLimit: string;
  gasPrice: string;
}

/**
 * A non-empty 0x-prefixed hex string. Returns it normalized or null if invalid.
 * Used to defensively reject upstream responses that contain blank calldata —
 * sending an empty `data` field to a router contract burns gas and reverts.
 */
function validHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === '0x' || v === '0X') return null;
  if (!/^0x[0-9a-fA-F]+$/.test(v)) return null;
  return v;
}

async function fetchSwapTx(params: {
  fromToken: string;
  toToken: string;
  amount: string;
  chainId: string;
  userAddress: string;
}): Promise<OkxSwapResponse> {
  // OKX v6 DEX aggregator REQUIRES `slippagePercent` (NOT `slippage`).
  // "slippagePercent=1" means 1% tolerance. Using 3% for X Layer pools
  // which have limited liquidity — keeps minAmountOut loose enough to land.
  const path =
    `/api/v6/dex/aggregator/swap?chainIndex=${params.chainId}` +
    `&fromTokenAddress=${params.fromToken}` +
    `&toTokenAddress=${params.toToken}` +
    `&amount=${params.amount}` +
    `&userWalletAddress=${params.userAddress}` +
    `&slippagePercent=3`;
  console.log(`[fetchSwapTx] → ${path.slice(0, 180)}`);
  const res = await okxGet<OkxEnvelope<OkxSwapResponse[]>>(path);
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx swap code=${res.code} msg=${res.msg}`);
  }
  const data = res.data?.[0];
  if (!data || !data.tx) {
    console.error('[onchainos] swap returned no tx data:', JSON.stringify(res).slice(0, 600));
    throw new OnchainOsError('swap endpoint returned no tx data');
  }
  // OKX has used both `data` and `callData` field names across API versions —
  // accept either and normalize to `data`.
  const calldata = validHex(data.tx.data) ?? validHex(data.tx.callData);
  if (!calldata) {
    console.error(
      '[onchainos] swap calldata missing/invalid:',
      JSON.stringify(data).slice(0, 800),
    );
    throw new OnchainOsError(
      `swap endpoint returned empty calldata (data=${JSON.stringify(data.tx.data)}, callData=${JSON.stringify(data.tx.callData)})`,
    );
  }
  data.tx.data = calldata;
  if (!validHex(data.tx.to) && !/^0x[0-9a-fA-F]{40}$/.test(data.tx.to)) {
    throw new OnchainOsError(`swap endpoint returned invalid 'to' address: ${data.tx.to}`);
  }
  return data;
}

async function fetchApproveTx(params: {
  tokenAddress: string;
  amount: string;
  chainId: string;
}): Promise<OkxApproveTx & { data: string }> {
  const path =
    `/api/v6/dex/aggregator/approve-transaction?chainIndex=${params.chainId}` +
    `&tokenContractAddress=${params.tokenAddress}` +
    `&approveAmount=${params.amount}`;
  const res = await okxGet<OkxEnvelope<OkxApproveTx[]>>(path);
  if (res.code && res.code !== '0') {
    throw new OnchainOsError(`okx approve code=${res.code} msg=${res.msg}`);
  }
  const raw = res.data?.[0];
  if (!raw) {
    console.error('[onchainos] approve returned no data:', JSON.stringify(res).slice(0, 600));
    throw new OnchainOsError('approve endpoint returned no data');
  }
  const calldata = validHex(raw.data) ?? validHex(raw.callData);
  if (!calldata) {
    console.error(
      '[onchainos] approve calldata missing/invalid:',
      JSON.stringify(raw).slice(0, 800),
    );
    throw new OnchainOsError(
      `approve endpoint returned empty calldata (data=${JSON.stringify(raw.data)}, callData=${JSON.stringify(raw.callData)})`,
    );
  }
  if (!raw.dexContractAddress || !/^0x[0-9a-fA-F]{40}$/.test(raw.dexContractAddress)) {
    throw new OnchainOsError(
      `approve endpoint returned invalid dexContractAddress: ${raw.dexContractAddress}`,
    );
  }
  return { ...raw, data: calldata };
}

function isNativeToken(addr: string): boolean {
  return addr.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
}

/**
 * ethers v6 throws CALL_EXCEPTION (instead of returning receipt with status=0)
 * when a transaction is mined but reverts. Wrap it in OnchainOsError so the
 * swap route returns a clean 503 with a user-readable message instead of a 500
 * with the raw ethers error blob.
 */
function wrapCallException(err: unknown, txHash: string, phase: 'approve' | 'swap'): OnchainOsError {
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === 'CALL_EXCEPTION'
  ) {
    const e = err as { receipt?: { gasUsed?: unknown }; code: string };
    const used = e.receipt?.gasUsed != null ? String(e.receipt.gasUsed) : '?';
    return new OnchainOsError(
      `${phase === 'swap' ? 'Swap' : 'Approve'} reverted on-chain ` +
      `(gasUsed=${used}, tx=${txHash}). ` +
      `Likely cause: slippage exceeded or stale routing data — please try again.`,
    );
  }
  // Not a call exception — re-throw as-is after wrapping
  const msg = err instanceof Error ? err.message : String(err);
  return new OnchainOsError(`${phase} tx failed: ${msg}`);
}

export async function executeSwap(params: {
  fromToken: string;
  toToken: string;
  amount: string;
  fromSymbol: string;
  toSymbol: string;
  chainId?: string;
  userAddress: string;
}): Promise<SwapResult> {
  requireConfigured();
  const chainId = params.chainId ?? X_LAYER_CHAIN;
  const signer = getSigner();
  const provider = getProvider();

  if (getAddress(params.userAddress) !== getAddress(signer.address)) {
    throw new OnchainOsError(
      `userAddress ${params.userAddress} does not match signer ${signer.address}`,
    );
  }

  let approveTxHash: string | undefined;

  if (!isNativeToken(params.fromToken)) {
    const MAX_UINT256 = (1n << 256n) - 1n;
    const approveInfo = await fetchApproveTx({
      tokenAddress: params.fromToken,
      amount: MAX_UINT256.toString(),
      chainId,
    });
    const erc20 = new Contract(params.fromToken, ERC20_ABI, provider);
    let currentAllowance: bigint;
    try {
      const allowanceRaw = await erc20.allowance(signer.address, approveInfo.dexContractAddress);
      if (typeof allowanceRaw !== 'bigint') {
        throw new OnchainOsError(`allowance() returned unexpected type: ${typeof allowanceRaw}`);
      }
      currentAllowance = allowanceRaw;
    } catch (err) {
      throw new OnchainOsError(
        `Failed to read allowance: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
    const requiredAllowance = BigInt(params.amount);
    if (currentAllowance < requiredAllowance) {
      // Defensive: never broadcast without calldata
      if (!approveInfo.data || approveInfo.data === '0x') {
        throw new OnchainOsError('refusing to send approve tx with empty calldata');
      }
      const approveTx = await signer.sendTransaction({
        to: params.fromToken,
        data: approveInfo.data,
        value: 0n,
        gasLimit: approveInfo.gasLimit ? BigInt(approveInfo.gasLimit) : undefined,
        gasPrice: approveInfo.gasPrice ? BigInt(approveInfo.gasPrice) : undefined,
      });
      let approveReceipt;
      try {
        approveReceipt = await approveTx.wait();
      } catch (err: unknown) {
        throw wrapCallException(err, approveTx.hash, 'approve');
      }
      if (!approveReceipt || approveReceipt.status !== 1) {
        throw new OnchainOsError(`approve transaction failed: ${approveTx.hash}`);
      }
      approveTxHash = approveTx.hash;
      // Record real gas spend in OKB (X Layer native gas token)
      try {
        const gasFee = approveReceipt.gasUsed * approveReceipt.gasPrice;
        recordGasSpend(Number(gasFee) / 1e18);
      } catch (err) {
        console.warn('[executeSwap] failed to record approve gas:', err instanceof Error ? err.message : err);
      }
      recordActivity('dex.approve', approveTx.hash);
    }
  }

  const swap = await fetchSwapTx({
    fromToken: params.fromToken,
    toToken: params.toToken,
    amount: params.amount,
    chainId,
    userAddress: signer.address,
  });

  // Defensive: fetchSwapTx already validates, but double-check before broadcast
  if (!swap.tx.data || swap.tx.data === '0x') {
    throw new OnchainOsError('refusing to broadcast swap tx with empty calldata');
  }
  if (!swap.tx.to || !/^0x[0-9a-fA-F]{40}$/.test(swap.tx.to)) {
    throw new OnchainOsError(`swap tx has invalid to address: ${swap.tx.to}`);
  }

  console.log(
    `[executeSwap] broadcasting swap to=${swap.tx.to} value=${swap.tx.value} ` +
    `gas=${swap.tx.gas} gasPrice=${swap.tx.gasPrice} ` +
    `minReceive=${swap.tx.minReceiveAmount ?? 'n/a'} ` +
    `calldata_len=${swap.tx.data.length}`,
  );

  const swapTx = await signer.sendTransaction({
    to: swap.tx.to,
    data: swap.tx.data,
    value: BigInt(swap.tx.value || '0'),
    gasLimit: swap.tx.gas ? BigInt(swap.tx.gas) : undefined,
    gasPrice: swap.tx.gasPrice ? BigInt(swap.tx.gasPrice) : undefined,
  });

  let receipt;
  try {
    receipt = await swapTx.wait();
  } catch (err: unknown) {
    throw wrapCallException(err, swapTx.hash, 'swap');
  }

  if (!receipt || receipt.status !== 1) {
    throw new OnchainOsError(
      `Swap reverted on-chain (status=0, gasUsed=${receipt ? String(receipt.gasUsed) : '?'}, tx=${swapTx.hash}). ` +
      `Likely cause: slippage exceeded or stale routing data. Try again.`,
    );
  }

  const status: 'submitted' | 'confirmed' = 'confirmed';

  try {
    const gasFee = receipt.gasUsed * receipt.gasPrice;
    recordGasSpend(Number(gasFee) / 1e18);
  } catch (err) {
    console.warn('[executeSwap] failed to record swap gas:', err instanceof Error ? err.message : err);
  }
  recordActivity('dex.swap', `${params.fromSymbol}->${params.toSymbol} ${swapTx.hash}`);

  return {
    txHash: swapTx.hash,
    approveTxHash,
    fromSymbol: params.fromSymbol,
    toSymbol: params.toSymbol,
    fromAmount: Number(params.amount),
    toAmount: Number(swap.routerResult?.toTokenAmount ?? 0),
    status,
  };
}

export async function getTokenSecurity(
  tokenAddress: string,
  chainId: string = X_LAYER_CHAIN,
): Promise<TokenSecurity> {
  requireConfigured();
  const info = await getTokenPriceInfo(tokenAddress, chainId);

  const liquidity = Number(info.liquidity ?? 0);
  const holders = Number(info.holders ?? 0);
  const marketCap = Number(info.marketCap ?? 0);
  const change24h = Math.abs(Number(info.priceChange24H ?? 0));

  const warnings: string[] = [];
  let score = 0;

  if (liquidity < 10_000) {
    score += 40;
    warnings.push('Low liquidity (< $10k) — high slippage and exit risk');
  } else if (liquidity < 100_000) {
    score += 20;
    warnings.push('Moderate liquidity');
  }

  if (holders < 100) {
    score += 30;
    warnings.push(`Only ${holders} holders — high concentration risk`);
  } else if (holders < 1000) {
    score += 10;
  }

  if (marketCap > 0 && marketCap < 100_000) {
    score += 20;
    warnings.push('Tiny market cap (< $100k)');
  }

  if (change24h > 50) {
    score += 15;
    warnings.push(`Extreme 24h volatility (${change24h.toFixed(1)}%)`);
  } else if (change24h > 20) {
    score += 5;
  }

  score = Math.min(100, score);
  const level: 'LOW' | 'MEDIUM' | 'HIGH' = score < 30 ? 'LOW' : score < 70 ? 'MEDIUM' : 'HIGH';

  const verdict =
    level === 'LOW'
      ? `Healthy token: $${Math.round(liquidity).toLocaleString()} liquidity, ${holders.toLocaleString()} holders, ${change24h.toFixed(1)}% 24h move.`
      : level === 'MEDIUM'
        ? `Trade with caution: ${warnings.join('; ') || 'moderate risk profile'}.`
        : `High risk: ${warnings.join('; ')}.`;

  recordActivity('security.scan', tokenAddress);
  return {
    tokenAddress,
    riskScore: score,
    level,
    warnings,
    verdict,
  };
}
