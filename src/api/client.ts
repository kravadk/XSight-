import type { CardPayload } from '../types/cards';

export interface ChatResponse {
  cards: CardPayload[];
}

export interface PortfolioToken {
  symbol: string;
  address: string;
  amount: number;
  usdValue: number;
}

export interface PortfolioResponse {
  address: string;
  network: string;
  totalUsd: number;
  change24h: number;
  changePercent: number;
  tokens: PortfolioToken[];
}

export interface X402CallLogEntry {
  timestamp: number;
  endpoint: string;
  caller: string;
  amount: number;
  asset: string;
  status: 'paid' | 'rejected';
}

export interface EconomySnapshotDto {
  totalRevenueUsdt: number;
  callsToday: number;
  lpDepositedUsdt: number;
  lpCurrentUsdt: number;
  lpYieldEarnedUsdt: number;
  /** True only when at least one real on-chain deploy has been executed. */
  lpActive: boolean;
  deployCount: number;
  lastDeployAt: number;
  expensesGasOkb: number;
  expensesAiUsdt: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  netProfitUsdt: number;
  autoDeployEnabled: boolean;
  threshold: number;
}

export interface ActivitySnapshotDto {
  walletAddress: string | null;
  walletExplorer: string | null;
  chainId: number;
  network: string;
  totalCalls: number;
  byKind: Record<string, number>;
  lastEventAt: number;
  swapsExecuted: number;
  quotesRequested: number;
  balanceChecks: number;
  marketDataCalls: number;
  securityScans: number;
  x402PaymentsReceived: number;
  x402Rejected: number;
  aiCalls: number;
  recent: { timestamp: number; kind: string; detail?: string }[];
}

export interface PoolStatDto {
  pair: string;
  baseSymbol: string;
  quoteSymbol: string;
  tvlUsd: number;
  volume24hUsd: number;
  estAprPct: number;
  router?: string;
}

export interface CatalogTokenDto {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  native?: boolean;
}

export interface CatalogResponseDto {
  tokens: CatalogTokenDto[];
  total: number;
  stats: {
    running: boolean;
    refreshMs: number;
    lastRefreshMs: number;
    tokenCount: number;
    symbolCount: number;
  };
}

export interface DeployEventDto {
  timestamp: number;
  fromAmountUsdt: number;
  toAmountOkb: number;
  txHash: string;
  approveTxHash?: string;
  explorerUrl: string;
}

export interface TriggerDeployDto {
  ok: boolean;
  reason?: string;
  fromAmountUsdt?: number;
  toAmountOkb?: number;
  txHash?: string;
  approveTxHash?: string;
  explorerUrl?: string;
}

export type StrategyTrigger =
  | 'price_below'
  | 'price_above'
  | 'change24h_below'
  | 'change24h_above'
  | 'volume_spike'
  | 'apr_above'
  | 'apr_below'
  | 'new_token'
  | 'concentration_above';

export type StrategyAction = 'notify' | 'auto_deploy';

export interface StrategyDto {
  id: string;
  kind: StrategyTrigger;
  target?: string;
  threshold?: number;
  action: StrategyAction;
  label?: string;
  description: string;
  createdAt: number;
  enabled: boolean;
  firedCount: number;
  lastFiredAt: number;
  lastEvaluatedAt: number;
  cooldownMs: number;
}

export interface StrategyFireDto {
  strategyId: string;
  timestamp: number;
  reason: string;
  actionResult?: string;
}

export interface StrategyCreateBody {
  kind: StrategyTrigger;
  target?: string;
  threshold?: number;
  action?: StrategyAction;
  label?: string;
}

export interface SwapResultDto {
  txHash: string;
  approveTxHash?: string;
  fromSymbol: string;
  toSymbol: string;
  fromAmount: number;
  toAmount: number;
  status: 'submitted' | 'confirmed';
}

export interface SwapQuoteDto {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  estGasOkb: string;
  routeSummary: string;
  priceImpactPct?: number;
}

export interface TokenSecurityDto {
  tokenAddress: string;
  riskScore: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  warnings: string[];
  verdict: string;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  messageCount: number;
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error;
    } catch {
      /* */
    }
    throw new ApiError(`${path} -> ${res.status}`, res.status, detail);
  }
  return (await res.json()) as T;
}

export const api = {
  chat: (message: string, history?: { role: 'user' | 'assistant'; content: string }[], sessionId?: string) =>
    request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history, sessionId }),
    }),

  chatHistory: () =>
    request<{ messages: import('../store/chatStore').ChatMessage[] }>('/chat/history'),

  clearChatHistory: () =>
    request<{ ok: true }>('/chat/history', { method: 'DELETE' }),

  saveMessages: (messages: import('../store/chatStore').ChatMessage[]) =>
    request<{ ok: true }>('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }),

  listSessions: () =>
    request<{ sessions: SessionMeta[] }>('/chat/sessions'),

  createSession: (title?: string) =>
    request<{ session: SessionMeta }>('/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  loadSession: (id: string) =>
    request<{ messages: import('../store/chatStore').ChatMessage[] }>(`/chat/sessions/${id}`),

  deleteSession: (id: string) =>
    request<{ ok: true }>(`/chat/sessions/${id}`, { method: 'DELETE' }),

  portfolio: (address?: string) =>
    request<PortfolioResponse>('/status/portfolio' + (address ? `?address=${encodeURIComponent(address)}` : '')),

  x402Log: () => request<{ calls: X402CallLogEntry[] }>('/status/x402-log'),

  economy: () => request<EconomySnapshotDto>('/status/economy'),

  swap: (from: string, to: string, rawAmount: string) =>
    request<SwapResultDto>('/swap', {
      method: 'POST',
      body: JSON.stringify({ from, to, amount: rawAmount }),
    }),

  swapQuote: (from: string, to: string, amountRaw: string) =>
    request<SwapQuoteDto>(`/swap/quote?from=${from}&to=${to}&amount=${amountRaw}`),

  security: (tokenSymbolOrAddress: string) =>
    request<TokenSecurityDto>(`/status/security?token=${encodeURIComponent(tokenSymbolOrAddress)}`),

  configureEconomy: (config: { autoDeployEnabled?: boolean; threshold?: number }) =>
    request<{ ok: true; autoDeployEnabled: boolean; threshold: number }>('/status/economy/configure', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  triggerDeploy: (opts: { force?: boolean; fraction?: number } = {}) =>
    request<TriggerDeployDto>('/status/economy/trigger-deploy', {
      method: 'POST',
      body: JSON.stringify(opts),
    }),

  deployHistory: () =>
    request<{ deploys: DeployEventDto[] }>('/status/economy/history'),

  activity: () => request<ActivitySnapshotDto>('/status/activity'),

  pools: () => request<{ pools: PoolStatDto[]; source: string; dexNetwork: string }>('/status/pools'),

  // X Layer token universe via OKX getAllTokens (refreshed every 10 minutes)
  catalog: (q?: string, limit = 50) =>
    request<CatalogResponseDto>(
      `/market/catalog?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),
  resolveToken: (input: string) =>
    request<CatalogTokenDto>(`/market/catalog/resolve?input=${encodeURIComponent(input)}`),

  x402Spec: () => request<unknown>('/v1/x402-spec'),

  // Strategy engine
  listStrategies: () =>
    request<{ strategies: StrategyDto[]; status: { running: boolean; activeStrategies: number } }>(
      '/strategies',
    ),
  createStrategy: (body: StrategyCreateBody) =>
    request<{ ok: true; strategy: StrategyDto }>('/strategies', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  setStrategyEnabled: (id: string, enabled: boolean) =>
    request<{ ok: true; strategy: StrategyDto }>(`/strategies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }),
  deleteStrategy: (id: string) =>
    request<{ ok: true }>(`/strategies/${id}`, { method: 'DELETE' }),
  strategyFires: () => request<{ fires: StrategyFireDto[] }>('/strategies/fires'),
};
