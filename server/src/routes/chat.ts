import { Router, type Request, type Response } from 'express';
import { chat, AiServiceError, type ChatTurn } from '../services/ai.js';
import { getWalletBalances, OnchainOsError } from '../services/onchainos.js';
import { getAllTrackedTokens } from '../services/tokenTracker.js';
import { getAllPools } from '../services/poolTracker.js';
import { listStrategies } from '../services/strategyEngine.js';
import { env } from '../config/env.js';
import {
  getHistory, appendMessages, clearHistory,
  listSessions, getSession, createSession, appendToSession, deleteSession,
  type StoredMessage,
} from '../services/chatHistory.js';

export const chatRouter = Router();

const HISTORY_MAX = 15;

/**
 * Heuristics that turn raw numbers into analytical annotations the AI can
 * cite. Inspired by Nansen Skills' approach: never feed bare numbers — feed
 * "current is 1.5× the 7d average — ABOVE NORMAL".
 */
function annotateVolume(ratio: number, volumeAvg: number): string {
  if (volumeAvg === 0) return 'avg n/a';
  if (ratio >= 3) return `${ratio.toFixed(1)}× avg [VOLUME SPIKE]`;
  if (ratio >= 2) return `${ratio.toFixed(1)}× avg [ABOVE NORMAL]`;
  if (ratio >= 1.5) return `${ratio.toFixed(1)}× avg [elevated]`;
  if (ratio < 0.5) return `${ratio.toFixed(1)}× avg [QUIET]`;
  return `${ratio.toFixed(1)}× avg`;
}

function annotateRisk(liquidity: number, holders: number): string {
  if (liquidity > 10_000_000 && holders > 50_000) return 'risk LOW (deep liquidity, broad holder base)';
  if (liquidity > 1_000_000 && holders > 1000) return 'risk LOW';
  if (liquidity > 100_000) return 'risk MEDIUM (moderate liquidity)';
  if (liquidity > 10_000) return 'risk HIGH (thin liquidity)';
  return 'risk CRITICAL (almost no liquidity)';
}

function annotatePriceMove(change24h: number): string {
  const abs = Math.abs(change24h);
  if (abs >= 30) return change24h > 0 ? '[EXTREME PUMP]' : '[EXTREME DUMP]';
  if (abs >= 15) return change24h > 0 ? '[strong rally]' : '[steep drop]';
  if (abs >= 5) return change24h > 0 ? '[uptick]' : '[downtick]';
  return '';
}

function annotateConcentration(pct: number): string {
  if (pct >= 70) return '[EXTREME concentration]';
  if (pct >= 50) return '[heavy single-asset exposure]';
  if (pct >= 30) return '[concentrated]';
  if (pct >= 15) return '[meaningful position]';
  return '[diversified]';
}

function annotateAprTrend(trend: string, aprDelta: number): string {
  if (trend === 'rising' && aprDelta > 0.5) return '[APR rising materially]';
  if (trend === 'falling' && aprDelta < -0.5) return '[APR cooling]';
  return '';
}

/**
 * Builds the rich REAL-TIME DATA block prepended to every user message before
 * Claude sees it. Pulls portfolio + tracked tokens + pools in parallel and
 * formats them as a structured plain-text block the model can cite verbatim,
 * with analytical annotations so it doesn't have to guess what numbers mean.
 */
async function buildContextBlock(): Promise<string> {
  const walletAddress = env.agenticWalletAddress || '';

  const [portfolioRes] = await Promise.allSettled([
    walletAddress ? getWalletBalances(walletAddress) : Promise.resolve(null),
  ]);

  const tokens = getAllTrackedTokens();
  const pools = getAllPools();
  const strategies = listStrategies();

  const lines: string[] = [];
  lines.push(`[REAL-TIME MARKET DATA as of ${new Date().toISOString()}]`);

  // Tokens with annotations
  if (tokens.length > 0) {
    lines.push('Tokens on X Layer:');
    for (const t of tokens) {
      const change1h = `${t.change1h >= 0 ? '+' : ''}${t.change1h.toFixed(2)}%`;
      const change24h = `${t.change24h >= 0 ? '+' : ''}${t.change24h.toFixed(2)}%`;
      const moveTag = annotatePriceMove(t.change24h);
      const volNote = annotateVolume(t.volumeRatio, t.volumeAvg);
      const riskNote = annotateRisk(t.liquidity, t.holders);
      const trendingTag = t.isTrending ? ' [TRENDING]' : '';
      lines.push(
        `- ${t.symbol}: $${t.price.toFixed(t.price < 1 ? 4 : 2)} | 1h ${change1h} | 24h ${change24h} ${moveTag} | vol $${(t.volume24h / 1_000_000).toFixed(2)}M (${volNote}) | mcap $${(t.marketCap / 1_000_000).toFixed(2)}M | liq $${(t.liquidity / 1_000_000).toFixed(2)}M | holders ${t.holders.toLocaleString()} | ${riskNote}${trendingTag}`,
      );
    }
  } else {
    lines.push('Tokens on X Layer: tracker is warming up — no snapshots yet.');
  }

  // Portfolio with concentration annotations
  lines.push('');
  lines.push('[USER PORTFOLIO]');
  if (portfolioRes.status === 'fulfilled' && portfolioRes.value) {
    const balances = portfolioRes.value;
    const totalUsd = balances.reduce((s, b) => s + b.usdValue, 0);
    lines.push(`Wallet: ${walletAddress}`);
    if (balances.length === 0) {
      lines.push('(empty wallet)');
    } else {
      for (const b of balances) {
        const pct = totalUsd > 0 ? (b.usdValue / totalUsd) * 100 : 0;
        const concNote = annotateConcentration(pct);
        lines.push(
          `- ${b.symbol}: ${b.amount.toFixed(b.amount < 1 ? 6 : 2)} ($${b.usdValue.toFixed(2)}, ${pct.toFixed(1)}%) ${concNote}`,
        );
      }
      lines.push(`Total: $${totalUsd.toFixed(2)}`);

      // Portfolio-level analytical summary
      const sorted = [...balances].sort((a, b) => b.usdValue - a.usdValue);
      const top = sorted[0];
      if (top && totalUsd > 0) {
        const topPct = (top.usdValue / totalUsd) * 100;
        if (topPct >= 70) {
          lines.push(
            `Diversification: CRITICAL — ${topPct.toFixed(1)}% in ${top.symbol} alone. Single-asset risk dominates.`,
          );
        } else if (topPct >= 50) {
          lines.push(`Diversification: WEAK — ${topPct.toFixed(1)}% in ${top.symbol}. Reduce to <50%.`);
        } else {
          lines.push(`Diversification: OK — top holding ${top.symbol} at ${topPct.toFixed(1)}%.`);
        }
      }
    }
  } else {
    if (portfolioRes.status === 'rejected') {
      console.error('[chat] portfolio fetch failed:', portfolioRes.reason instanceof Error ? portfolioRes.reason.message : portfolioRes.reason);
    }
    lines.push('(portfolio unavailable — wallet not configured or fetch failed)');
  }

  // Pools with APR trend annotations
  lines.push('');
  lines.push('[YIELD POOLS on X Layer]');
  if (pools.length > 0) {
    for (const p of pools) {
      const aprDelta = p.apr - p.aprPrev;
      const trendNote = annotateAprTrend(p.aprTrend, aprDelta);
      lines.push(
        `- ${p.pair}: APR ${p.apr.toFixed(2)}% (${p.aprTrend}) ${trendNote} | TVL $${(p.tvlUsd / 1_000_000).toFixed(2)}M | vol $${(p.volume24hUsd / 1000).toFixed(0)}K | fee ${(p.fee * 100).toFixed(2)}% | risk ${p.risk} | router ${p.router ?? 'n/a'}`,
      );
    }
  } else {
    lines.push('(pool tracker is warming up)');
  }

  // Active strategies — let the AI know what alerts the user already has
  if (strategies.length > 0) {
    lines.push('');
    lines.push('[USER ACTIVE STRATEGIES]');
    for (const s of strategies) {
      lines.push(
        `- ${s.kind}: ${s.description} (status: ${s.firedCount > 0 ? `fired ${s.firedCount}×` : 'armed'})`,
      );
    }
  }

  // Network meta
  lines.push('');
  lines.push('[NETWORK]');
  lines.push('X Layer Mainnet (chain id 196), gas token OKB, USDT/USDG transfers are gas-sponsored.');

  return lines.join('\n');
}

// ── GET /api/chat/sessions ────────────────────────────────────────────────
chatRouter.get('/sessions', async (_req: Request, res: Response) => {
  res.json({ sessions: await listSessions() });
});

// ── POST /api/chat/sessions ───────────────────────────────────────────────
chatRouter.post('/sessions', async (req: Request, res: Response) => {
  const { title } = req.body as { title?: string };
  const s = await createSession(title);
  res.json({ session: { id: s.id, title: s.title, createdAt: s.createdAt, messageCount: 0 } });
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateSessionId(id: string, res: Response): boolean {
  if (!UUID_RE.test(id)) { res.status(400).json({ error: 'Invalid session id' }); return false; }
  return true;
}

// ── GET /api/chat/sessions/:id ────────────────────────────────────────────
chatRouter.get('/sessions/:id', async (req: Request, res: Response) => {
  if (!validateSessionId(req.params.id, res)) return;
  const s = await getSession(req.params.id);
  if (!s) { res.status(404).json({ error: 'Session not found' }); return; }
  res.json({ messages: s.messages });
});

// ── DELETE /api/chat/sessions/:id ─────────────────────────────────────────
chatRouter.delete('/sessions/:id', async (req: Request, res: Response) => {
  if (!validateSessionId(req.params.id, res)) return;
  await deleteSession(req.params.id);
  res.json({ ok: true });
});

// ── legacy single-session history routes ─────────────────────────────────
chatRouter.get('/history', async (_req: Request, res: Response) => {
  res.json({ messages: await getHistory() });
});
chatRouter.delete('/history', async (_req: Request, res: Response) => {
  await clearHistory();
  res.json({ ok: true });
});
chatRouter.post('/messages', async (req: Request, res: Response) => {
  const { messages } = req.body as { messages?: StoredMessage[] };
  if (!Array.isArray(messages)) { res.status(400).json({ error: 'messages must be an array' }); return; }
  await appendMessages(messages);
  res.json({ ok: true });
});

// ── POST /api/chat ───────────────────────────────────────────────────────
chatRouter.post('/', async (req: Request, res: Response) => {
  const { message, history, sessionId } = req.body as { message?: string; history?: ChatTurn[]; sessionId?: string };
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > 8000) {
    return res.status(400).json({ error: 'message too long (max 8000 characters)' });
  }

  let contextBlock: string;
  try {
    contextBlock = await buildContextBlock();
  } catch (err) {
    console.error('[chat] context build failed:', err instanceof Error ? err.message : err);
    contextBlock = '[context unavailable]';
  }

  const trimmedHistory = (history ?? []).slice(-HISTORY_MAX);

  try {
    const response = await chat({
      userMessage: message,
      contextBlock,
      history: trimmedHistory,
    });

    // Persist both turns to the session
    const now = Date.now();
    const msgs: StoredMessage[] = [
      { id: `${now}-user`, role: 'user', cards: [{ kind: 'text', text: message }], createdAt: now },
      { id: `${now}-ai`,  role: 'ai',   cards: response.cards ?? [],               createdAt: now + 1 },
    ];
    if (sessionId) {
      appendToSession(sessionId, msgs).catch((err) => console.error('[chat] session persist failed:', err instanceof Error ? err.message : err));
    } else {
      appendMessages(msgs).catch((err) => console.error('[chat] history persist failed:', err instanceof Error ? err.message : err));
    }

    res.json(response);
  } catch (err) {
    if (err instanceof AiServiceError) {
      return res.status(503).json({ error: 'AI service unavailable', detail: err.message });
    }
    if (err instanceof OnchainOsError) {
      return res.status(503).json({ error: 'OnchainOS unavailable', detail: err.message });
    }
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});
