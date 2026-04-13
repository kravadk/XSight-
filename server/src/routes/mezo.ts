import { Router, type Request, type Response } from 'express';
import { getAddress, isAddress } from 'ethers';
import {
  fetchBtcPrice,
  getTrovePosition,
  getMezoPools,
  estimateBorrow,
} from '../services/mezoService.js';
import { MEZO, MEZO_CONTRACTS } from '../utils/mezo.js';

export const mezoRouter = Router();

// ── GET /api/mezo/trove/:address ──────────────────────────────────────────────
mezoRouter.get('/trove/:address', async (req: Request, res: Response) => {
  const { address } = req.params;

  if (!address || !isAddress(address)) {
    res.status(400).json({ error: 'Invalid Ethereum address' });
    return;
  }

  let checksumAddr: string;
  try {
    checksumAddr = getAddress(address);
  } catch {
    res.status(400).json({ error: 'Address checksum failed' });
    return;
  }

  try {
    const position = await getTrovePosition(checksumAddr);
    res.json({
      ...position,
      network: MEZO.name,
      chainId: MEZO.chainId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RPC error';
    console.error('[mezo] trove fetch failed:', msg);
    res.status(503).json({ error: 'Mezo RPC unavailable', detail: msg });
  }
});

// ── GET /api/mezo/price ───────────────────────────────────────────────────────
mezoRouter.get('/price', async (_req: Request, res: Response) => {
  try {
    const price = await fetchBtcPrice();
    res.json({ btcPriceUsd: price, network: MEZO.name, chainId: MEZO.chainId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RPC error';
    console.error('[mezo] price fetch failed:', msg);
    res.status(503).json({ error: 'Mezo RPC unavailable', detail: msg });
  }
});

// ── GET /api/mezo/pools ───────────────────────────────────────────────────────
mezoRouter.get('/pools', (_req: Request, res: Response) => {
  try {
    const pools = getMezoPools();
    res.json({ pools, network: MEZO.name, chainId: MEZO.chainId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/mezo/estimate?coll=0.05&musd=1800 ───────────────────────────────
mezoRouter.get('/estimate', async (req: Request, res: Response) => {
  const collRaw = req.query['coll'];
  const musdRaw = req.query['musd'];

  if (!collRaw || typeof collRaw !== 'string') {
    res.status(400).json({ error: 'Query param "coll" (BTC amount) is required' });
    return;
  }

  const collBtc = parseFloat(collRaw);
  if (isNaN(collBtc) || collBtc <= 0) {
    res.status(400).json({ error: '"coll" must be a positive number' });
    return;
  }

  let requestedMusd: number | undefined;
  if (musdRaw && typeof musdRaw === 'string') {
    const parsed = parseFloat(musdRaw);
    if (isNaN(parsed) || parsed <= 0) {
      res.status(400).json({ error: '"musd" must be a positive number if provided' });
      return;
    }
    requestedMusd = parsed;
  }

  try {
    const estimate = await estimateBorrow(collBtc, requestedMusd);
    res.json(estimate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RPC error';
    console.error('[mezo] estimate failed:', msg);
    res.status(503).json({ error: 'Mezo RPC unavailable', detail: msg });
  }
});

// ── GET /api/mezo/info ────────────────────────────────────────────────────────
mezoRouter.get('/info', (_req: Request, res: Response) => {
  res.json({
    network: MEZO,
    contracts: MEZO_CONTRACTS,
    docs: 'https://mezo.org/docs',
  });
});
