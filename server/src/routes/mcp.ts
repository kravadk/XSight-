/**
 * XSight MCP (Model Context Protocol) server.
 *
 * Exposes XSight's onchain capabilities as MCP tools, allowing any
 * Claude-powered agent to use XSight as a reusable skill provider.
 *
 * Protocol: JSON-RPC 2.0, MCP spec 2024-11-05
 * Endpoint: POST /mcp
 *
 * Docs: https://modelcontextprotocol.io/specification/2024-11-05
 */

import { Router, type Request, type Response } from 'express';
import { getWalletBalances, getTokenSecurity, OnchainOsError } from '../services/onchainos.js';
import { getAllTrackedTokens } from '../services/tokenTracker.js';
import { getAllPools } from '../services/poolTracker.js';
import { snapshot } from '../services/economyLoop.js';
import { triggerAutoDeploy } from '../services/autoDeploy.js';
import { env } from '../config/env.js';
import { getAddress } from 'ethers';

export const mcpRouter = Router();

// ─── Tool definitions ─────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_portfolio',
    description: 'Fetch real-time token balances for a wallet address on X Layer (chainId 196) using OnchainOS Wallet API.',
    inputSchema: {
      type: 'object',
      properties: {
        address: {
          type: 'string',
          description: 'Ethereum wallet address (0x...). Defaults to XSight agentic wallet if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_market_data',
    description: 'Get live token market data on X Layer: prices, 24h change, volume, liquidity, trending status.',
    inputSchema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of token symbols to filter (e.g. ["OKB", "USDT"]). Returns all tracked tokens if omitted.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_pool_apr',
    description: 'Get yield pool data on X Layer including APR, TVL, 24h volume, and risk level for LP strategy planning.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'scan_token_security',
    description: 'Scan a token contract for security risks: honeypot detection, holder concentration, contract verification, risk score.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'Token symbol (e.g. "OKB") or contract address (0x...).',
        },
      },
      required: ['token'],
    },
  },
  {
    name: 'get_economy_snapshot',
    description: 'Get XSight agentic economy state: x402 revenue, AI costs, gas costs, auto-deploy history, net P&L.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'execute_swap',
    description: 'Execute a real on-chain token swap on X Layer via OnchainOS DEX aggregator. Uses the XSight agentic wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Source token symbol (e.g. "USDT")',
        },
        to: {
          type: 'string',
          description: 'Destination token symbol (e.g. "OKB")',
        },
        fraction: {
          type: 'number',
          description: 'Fraction of surplus USDT to deploy (0.0 to 1.0). Defaults to 0.5.',
          minimum: 0.01,
          maximum: 1.0,
        },
      },
      required: ['from', 'to'],
    },
  },
];

// ─── Tool handlers ─────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_portfolio': {
      const rawAddr = typeof args['address'] === 'string' ? args['address'] : env.agenticWalletAddress;
      let address: string;
      try {
        address = getAddress(rawAddr || '');
      } catch {
        return { error: 'invalid address', provided: rawAddr };
      }
      const balances = await getWalletBalances(address);
      const totalUsd = balances.reduce((s, b) => s + b.usdValue, 0);
      return {
        address,
        network: 'X Layer Mainnet',
        chainId: 196,
        totalUsd: totalUsd.toFixed(2),
        tokens: balances.map((b) => ({
          symbol: b.symbol,
          amount: b.amount,
          usdValue: b.usdValue.toFixed(2),
          pct: totalUsd > 0 ? ((b.usdValue / totalUsd) * 100).toFixed(1) + '%' : '0%',
        })),
      };
    }

    case 'get_market_data': {
      const symbols = Array.isArray(args['symbols'])
        ? (args['symbols'] as string[]).map((s) => s.toUpperCase())
        : null;
      const tokens = getAllTrackedTokens();
      const filtered = symbols ? tokens.filter((t) => symbols.includes(t.symbol.toUpperCase())) : tokens;
      return {
        network: 'X Layer Mainnet',
        chainId: 196,
        timestamp: new Date().toISOString(),
        tokens: filtered.map((t) => ({
          symbol: t.symbol,
          price: t.price,
          change1h: t.change1h,
          change24h: t.change24h,
          volume24h: t.volume24h,
          volumeRatio: t.volumeRatio.toFixed(2) + '× avg',
          liquidity: t.liquidity,
          holders: t.holders,
          marketCap: t.marketCap,
          isTrending: t.isTrending,
          isNew: t.isNew,
        })),
      };
    }

    case 'get_pool_apr': {
      const pools = getAllPools();
      return {
        network: 'X Layer Mainnet',
        chainId: 196,
        timestamp: new Date().toISOString(),
        pools: pools.map((p) => ({
          pair: p.pair,
          apr: p.apr.toFixed(2) + '%',
          aprTrend: p.aprTrend,
          tvlUsd: p.tvlUsd,
          volume24hUsd: p.volume24hUsd,
          fee: (p.fee * 100).toFixed(2) + '%',
          risk: p.risk,
          router: p.router ?? 'n/a',
        })),
      };
    }

    case 'scan_token_security': {
      const token = typeof args['token'] === 'string' ? args['token'] : '';
      if (!token) return { error: 'token param required' };
      const result = await getTokenSecurity(token);
      return {
        token,
        riskScore: result.riskScore,
        level: result.level,
        warnings: result.warnings,
        verdict: result.verdict,
      };
    }

    case 'get_economy_snapshot': {
      const snap = snapshot();
      return {
        totalRevenueUsdt: snap.totalRevenueUsdt,
        callsToday: snap.callsToday,
        lpDepositedUsdt: snap.lpDepositedUsdt,
        lpCurrentUsdt: snap.lpCurrentUsdt,
        lpYieldEarnedUsdt: snap.lpYieldEarnedUsdt,
        lpActive: snap.lpActive,
        deployCount: snap.deployCount,
        expensesGasOkb: snap.expensesGasOkb,
        expensesAiUsdt: snap.expensesAiUsdt,
        aiInputTokens: snap.aiInputTokens,
        aiOutputTokens: snap.aiOutputTokens,
        netProfitUsdt: snap.netProfitUsdt,
        autoDeployEnabled: snap.autoDeployEnabled,
        threshold: snap.threshold,
      };
    }

    case 'execute_swap': {
      const from = typeof args['from'] === 'string' ? args['from'].toUpperCase() : '';
      const to = typeof args['to'] === 'string' ? args['to'].toUpperCase() : '';
      if (!from || !to) return { error: 'from and to are required' };
      if (from !== 'USDT') return { error: 'Currently only USDT→OKB swaps are supported via MCP tool. Use the /api/swap endpoint for custom pairs.' };

      const fraction = typeof args['fraction'] === 'number' ? Math.min(1, Math.max(0.01, args['fraction'])) : 0.5;
      const result = await triggerAutoDeploy({ force: true, fraction });
      if (!result.ok) return { ok: false, reason: result.reason };
      return {
        ok: true,
        fromAmountUsdt: result.fromAmountUsdt,
        toAmountOkb: result.toAmountOkb,
        txHash: result.txHash,
        approveTxHash: result.approveTxHash,
        explorerUrl: result.txHash
          ? `https://www.okx.com/web3/explorer/xlayer/tx/${result.txHash}`
          : undefined,
      };
    }

    default:
      throw { code: -32601, message: `Unknown tool: ${name}` };
  }
}

// ─── JSON-RPC 2.0 handler ─────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

function ok(id: number | string | null, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}

function err(id: number | string | null, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

mcpRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as JsonRpcRequest;

  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    res.status(400).json(err(body?.id ?? null, -32600, 'Invalid Request'));
    return;
  }

  const { id, method, params = {} } = body;

  try {
    switch (method) {
      case 'initialize':
        res.json(ok(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'xsight-mcp',
            version: '1.0.0',
            description: 'XSight onchain skills — portfolio, swaps, market data, security, economy via OnchainOS on X Layer',
          },
        }));
        return;

      case 'tools/list':
        res.json(ok(id, { tools: TOOLS }));
        return;

      case 'tools/call': {
        const toolName = typeof params['name'] === 'string' ? params['name'] : '';
        const toolArgs = (params['arguments'] as Record<string, unknown>) ?? {};
        if (!toolName) {
          res.json(err(id, -32602, 'params.name is required'));
          return;
        }
        const result = await callTool(toolName, toolArgs);
        res.json(ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }));
        return;
      }

      case 'ping':
        res.json(ok(id, {}));
        return;

      default:
        res.json(err(id, -32601, `Method not found: ${method}`));
    }
  } catch (e) {
    const mcpErr = e as { code?: number; message?: string };
    const code = mcpErr.code ?? -32603;
    const message = mcpErr.message ?? (e instanceof OnchainOsError ? e.message : 'Internal error');
    console.error('[mcp] error in method', method, ':', message);
    res.json(err(id, code, message));
  }
});

// GET /mcp — capability discovery without auth
mcpRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'XSight MCP Server',
    version: '1.0.0',
    protocol: 'MCP 2024-11-05 (JSON-RPC 2.0)',
    endpoint: 'POST /mcp',
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    network: 'X Layer Mainnet',
    chainId: 196,
    agenticWallet: env.agenticWalletAddress,
    docs: 'https://modelcontextprotocol.io/specification/2024-11-05',
  });
});
