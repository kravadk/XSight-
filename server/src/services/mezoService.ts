import { JsonRpcProvider, Contract, formatUnits, getAddress } from 'ethers';
import {
  MEZO,
  MEZO_CONTRACTS,
  TROVE_MANAGER_ABI,
  PRICE_FEED_ABI,
  MUSD_GAS_COMPENSATION,
  MIN_COLLATERAL_RATIO,
  SAFE_COLLATERAL_RATIO,
  TROVE_STATUS,
} from '../utils/mezo.js';

export interface TrovePosition {
  address: string;
  status: string;
  statusCode: number;
  debtMusd: number;
  netDebtMusd: number;
  collBtc: number;
  btcPriceUsd: number;
  collValueUsd: number;
  collateralRatio: number;
  health: 'safe' | 'warning' | 'danger' | 'liquidatable';
  liquidationPriceUsd: number;
  explorerUrl: string;
}

export interface MezoPoolInfo {
  name: string;
  pair: string;
  address: string;
  aprPct: number;
  description: string;
}

export interface BorrowEstimate {
  collBtc: number;
  collValueUsd: number;
  btcPriceUsd: number;
  requestedMusd: number;
  maxMusd: number;
  collateralRatio: number;
  borrowFeePct: number;
  borrowFeeMusd: number;
  netDebtMusd: number;
  liquidationPriceUsd: number;
  health: 'safe' | 'warning' | 'danger' | 'liquidatable';
  feasible: boolean;
  reason?: string;
}

// ── Singleton provider ────────────────────────────────────────────────────────

let _provider: JsonRpcProvider | null = null;

function getProvider(): JsonRpcProvider {
  if (!_provider) {
    _provider = new JsonRpcProvider(MEZO.rpc);
  }
  return _provider;
}

// ── BTC price cache ───────────────────────────────────────────────────────────

interface PriceCache {
  price: number;
  fetchedAt: number;
}

let _priceCache: PriceCache | null = null;
const PRICE_CACHE_TTL_MS = 60_000; // 60 seconds

export async function fetchBtcPrice(): Promise<number> {
  const now = Date.now();
  if (_priceCache && now - _priceCache.fetchedAt < PRICE_CACHE_TTL_MS) {
    return _priceCache.price;
  }

  try {
    const provider = getProvider();
    const priceFeed = new Contract(MEZO_CONTRACTS.PriceFeed, PRICE_FEED_ABI, provider);
    const rawPrice: bigint = await priceFeed.fetchPrice();
    // PriceFeed returns price with 18 decimals
    const price = parseFloat(formatUnits(rawPrice, 18));
    _priceCache = { price, fetchedAt: now };
    return price;
  } catch (err) {
    console.error('[mezoService] fetchBtcPrice failed:', err instanceof Error ? err.message : err);
    // Return last cached value as fallback
    if (_priceCache) {
      console.warn('[mezoService] Using stale BTC price from cache:', _priceCache.price);
      return _priceCache.price;
    }
    throw err;
  }
}

// ── Health classification ────────────────────────────────────────────────────

function classifyHealth(cr: number): 'safe' | 'warning' | 'danger' | 'liquidatable' {
  if (cr < MIN_COLLATERAL_RATIO) return 'liquidatable';
  if (cr < 1.25) return 'danger';
  if (cr < SAFE_COLLATERAL_RATIO) return 'warning';
  return 'safe';
}

// ── Trove position ────────────────────────────────────────────────────────────

export async function getTrovePosition(address: string): Promise<TrovePosition> {
  const checksumAddr = getAddress(address);
  const provider = getProvider();
  const troveManager = new Contract(MEZO_CONTRACTS.TroveManager, TROVE_MANAGER_ABI, provider);

  const [rawStatus, rawDebt, rawColl, btcPrice] = await Promise.all([
    troveManager.getTroveStatus(checksumAddr) as Promise<bigint>,
    troveManager.getTroveDebt(checksumAddr) as Promise<bigint>,
    troveManager.getTroveColl(checksumAddr) as Promise<bigint>,
    fetchBtcPrice(),
  ]);

  const statusCode = Number(rawStatus);
  const status = TROVE_STATUS[statusCode as keyof typeof TROVE_STATUS] ?? 'unknown';

  const debtMusd = parseFloat(formatUnits(rawDebt, 18));
  const collBtc = parseFloat(formatUnits(rawColl, 18));

  // netDebt = total debt minus gas compensation reserve
  const netDebtMusd = Math.max(0, debtMusd - MUSD_GAS_COMPENSATION);
  const collValueUsd = collBtc * btcPrice;

  // Collateral ratio = collateral value / debt (in same currency)
  const collateralRatio = debtMusd > 0 ? collValueUsd / debtMusd : 0;

  const health = statusCode === 1 ? classifyHealth(collateralRatio) : 'safe';

  // Liquidation price = price at which CR would drop to 110%
  const liquidationPriceUsd = collBtc > 0 ? (debtMusd * MIN_COLLATERAL_RATIO) / collBtc : 0;

  const explorerUrl = `${MEZO.explorer}/address/${checksumAddr}`;

  return {
    address: checksumAddr,
    status,
    statusCode,
    debtMusd,
    netDebtMusd,
    collBtc,
    btcPriceUsd: btcPrice,
    collValueUsd,
    collateralRatio,
    health,
    liquidationPriceUsd,
    explorerUrl,
  };
}

// ── Pool info (static) ────────────────────────────────────────────────────────

export function getMezoPools(): MezoPoolInfo[] {
  return [
    {
      name: 'MUSD/BTC',
      pair: 'MUSD/BTC',
      address: MEZO_CONTRACTS.PoolMUSD_BTC,
      aprPct: 4.2,
      description: 'Earn 4.2% APR by providing MUSD and BTC liquidity',
    },
    {
      name: 'MUSD/mUSDC',
      pair: 'MUSD/mUSDC',
      address: MEZO_CONTRACTS.PoolMUSD_mUSDC,
      aprPct: 3.1,
      description: 'Earn 3.1% APR with MUSD and Mezo USDC stablecoin pair',
    },
    {
      name: 'MUSD/mUSDT',
      pair: 'MUSD/mUSDT',
      address: MEZO_CONTRACTS.PoolMUSD_mUSDT,
      aprPct: 2.8,
      description: 'Earn 2.8% APR with MUSD and Mezo USDT stablecoin pair',
    },
  ];
}

// ── Borrow estimate ───────────────────────────────────────────────────────────

export async function estimateBorrow(collBtc: number, requestedMusd?: number): Promise<BorrowEstimate> {
  const btcPrice = await fetchBtcPrice();
  const collValueUsd = collBtc * btcPrice;

  // Max borrow at 110% CR: collValue / 1.1, minus gas compensation
  const maxMusdAtMinCR = collValueUsd / MIN_COLLATERAL_RATIO;
  const maxMusd = Math.max(0, maxMusdAtMinCR - MUSD_GAS_COMPENSATION);

  // Requested amount defaults to safe CR level
  const targetMusd = requestedMusd ?? Math.floor(collValueUsd / SAFE_COLLATERAL_RATIO - MUSD_GAS_COMPENSATION);
  const borrowAmount = Math.min(targetMusd, maxMusd);

  // Borrow fee: 0.5% base
  const borrowFeePct = 0.5;
  const borrowFeeMusd = borrowAmount * (borrowFeePct / 100);
  const netDebtMusd = borrowAmount + borrowFeeMusd + MUSD_GAS_COMPENSATION;

  const collateralRatio = netDebtMusd > 0 ? collValueUsd / netDebtMusd : 0;
  const health = classifyHealth(collateralRatio);
  const liquidationPriceUsd = collBtc > 0 ? (netDebtMusd * MIN_COLLATERAL_RATIO) / collBtc : 0;

  const feasible = borrowAmount >= 1800 && collBtc > 0;
  const reason = !feasible
    ? borrowAmount < 1800
      ? `Minimum borrow is 1,800 MUSD. Your collateral supports only ${borrowAmount.toFixed(0)} MUSD.`
      : 'Collateral must be greater than 0 BTC.'
    : undefined;

  return {
    collBtc,
    collValueUsd,
    btcPriceUsd: btcPrice,
    requestedMusd: targetMusd,
    maxMusd,
    collateralRatio,
    borrowFeePct,
    borrowFeeMusd,
    netDebtMusd,
    liquidationPriceUsd,
    health,
    feasible,
    reason,
  };
}
