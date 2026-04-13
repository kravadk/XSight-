export interface TokenMeta {
  symbol: string;
  name: string;
  color: string;
  letter: string;
  decimals: number;
  /**
   * Lowercase symbol used in spothq/cryptocurrency-icons. The TokenIcon
   * component first tries this source via jsDelivr CDN.
   * Repo: https://github.com/spothq/cryptocurrency-icons
   */
  spothqSlug?: string;
  /** Optional fallback CDN URL (e.g. CoinGecko) tried if spothq has no entry. */
  logo?: string;
}

export const TOKEN_META: Record<string, TokenMeta> = {
  // OKB is not in spothq/cryptocurrency-icons → fall back to CoinGecko CDN.
  OKB: {
    symbol: 'OKB',
    name: 'OKB',
    color: '#3075EE',
    letter: 'O',
    decimals: 18,
    logo: 'https://assets.coingecko.com/coins/images/4463/small/WeChat_Image_20220118095654.png',
  },
  WOKB: {
    symbol: 'WOKB',
    name: 'Wrapped OKB',
    color: '#3075EE',
    letter: 'O',
    decimals: 18,
    logo: 'https://assets.coingecko.com/coins/images/4463/small/WeChat_Image_20220118095654.png',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether',
    color: '#26A17B',
    letter: 'T',
    decimals: 6,
    spothqSlug: 'usdt',
  },
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    color: '#2775CA',
    letter: 'C',
    decimals: 6,
    spothqSlug: 'usdc',
  },
  'USDC.E': {
    symbol: 'USDC.E',
    name: 'Bridged USDC',
    color: '#2775CA',
    letter: 'C',
    decimals: 6,
    spothqSlug: 'usdc',
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    color: '#627EEA',
    letter: 'E',
    decimals: 18,
    spothqSlug: 'eth',
    logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ether',
    color: '#627EEA',
    letter: 'E',
    decimals: 18,
    spothqSlug: 'eth',
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    color: '#F7931A',
    letter: 'B',
    decimals: 8,
    spothqSlug: 'wbtc',
  },
  BTC: {
    symbol: 'BTC',
    name: 'Bitcoin',
    color: '#F7931A',
    letter: 'B',
    decimals: 8,
    spothqSlug: 'btc',
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai',
    color: '#F5AC37',
    letter: 'D',
    decimals: 18,
    spothqSlug: 'dai',
  },
  BNB: {
    symbol: 'BNB',
    name: 'BNB',
    color: '#F3BA2F',
    letter: 'B',
    decimals: 18,
    spothqSlug: 'bnb',
  },
  stOKB: {
    symbol: 'stOKB',
    name: 'Staked OKB',
    color: '#7C5CFC',
    letter: 'S',
    decimals: 18,
  },
  USDG: {
    symbol: 'USDG',
    name: 'USD Global',
    color: '#22C55E',
    letter: 'G',
    decimals: 18,
  },
};

export function tokenMeta(symbol: string): TokenMeta {
  const upper = symbol?.toUpperCase?.() ?? symbol;
  return (
    TOKEN_META[upper] ??
    TOKEN_META[symbol] ?? {
      symbol,
      name: symbol,
      color: '#9CA3AF',
      letter: symbol?.[0]?.toUpperCase() ?? '?',
      decimals: 18,
      spothqSlug: symbol?.toLowerCase?.(),
    }
  );
}

/**
 * Returns ordered list of CDN URLs to try for a given token symbol.
 * Components fall through to the next on <img> error.
 */
export function tokenLogoSources(meta: TokenMeta): string[] {
  const list: string[] = [];
  if (meta.spothqSlug) {
    list.push(
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${meta.spothqSlug}.svg`,
    );
  }
  if (meta.logo) list.push(meta.logo);
  return list;
}
