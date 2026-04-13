import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { chatRouter } from './routes/chat.js';
import { analysisRouter } from './routes/analysis.js';
import { statusRouter } from './routes/status.js';
import { swapRouter } from './routes/swap.js';
import { economyRouter } from './routes/economy.js';
import { marketRouter } from './routes/market.js';
import { strategyRouter } from './routes/strategies.js';
import { startTokenTracker } from './services/tokenTracker.js';
import { startPoolTracker } from './services/poolTracker.js';
import { startStrategyEngine } from './services/strategyEngine.js';
import { startTokenCatalog } from './services/tokenCatalog.js';

const app = express();

const allowedOrigins = env.corsOrigin === '*'
  ? true
  : env.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: env.corsOrigin !== '*',
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api/chat', chatRouter);
app.use('/api/swap', swapRouter);
app.use('/api/status', statusRouter);
app.use('/api/economy', economyRouter); // spec-aliased shim, see routes/economy.ts
app.use('/api/market', marketRouter);
app.use('/api/strategies', strategyRouter);
app.use('/api/v1', analysisRouter);

// Background data trackers + automation engine
startTokenCatalog(); // must run before swap routes resolve
startTokenTracker();
startPoolTracker();
startStrategyEngine();

app.get('/', (_req, res) => {
  res.json({
    name: 'XSight server',
    version: '0.2.0',
    network: env.x402Network,
    endpoints: {
      chat: 'POST /api/chat',
      swapQuote: 'GET /api/swap/quote?from=USDT&to=OKB&amount=10',
      swap: 'POST /api/swap',
      health: 'GET /api/status/health',
      portfolio: 'GET /api/status/portfolio',
      x402Log: 'GET /api/status/x402-log',
      economy: 'GET /api/status/economy',
      economyConfigure: 'POST /api/status/economy/configure',
      economyTriggerDeploy: 'POST /api/status/economy/trigger-deploy',
      economyHistory: 'GET /api/status/economy/history',
      activity: 'GET /api/status/activity',
      pools: 'GET /api/status/pools',
      security: 'GET /api/status/security?token=OKB',
      marketTokens: 'GET /api/market/tokens',
      marketTokenDetail: 'GET /api/market/tokens/:symbol',
      marketPools: 'GET /api/market/pools',
      marketTrending: 'GET /api/market/trending',
      marketAlerts: 'GET /api/market/alerts',
      strategiesList: 'GET /api/strategies',
      strategiesCreate: 'POST /api/strategies',
      strategiesFires: 'GET /api/strategies/fires',
      x402Spec: 'GET /api/v1/x402-spec',
      monetized: [
        'GET /api/v1/market-summary  (0.01 USDT)',
        'GET /api/v1/token-analysis?token=0x...  (0.05 USDT)',
        'GET /api/v1/trading-signals  (0.10 USDT)',
        'GET /api/v1/portfolio-advice?wallet=0x...  (0.05 USDT)',
      ],
    },
  });
});

app.listen(env.port, () => {
  console.log(`[xsight-server] listening on http://localhost:${env.port}`);
});
