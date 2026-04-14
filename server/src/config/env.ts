import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    return '';
  }
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514',
  okxApiKey: required('OKX_API_KEY'),
  okxSecretKey: required('OKX_SECRET_KEY'),
  okxPassphrase: required('OKX_PASSPHRASE'),
  okxProjectId: required('OKX_PROJECT_ID'),
  agenticWalletAddress: required('AGENTIC_WALLET_ADDRESS'),
  deployerPrivateKey: required('DEPLOYER_PRIVATE_KEY'),
  xLayerRpcUrl: process.env.X_LAYER_RPC_URL ?? 'https://rpc.xlayer.tech',
  x402PayoutAddress: required('X402_PAYOUT_ADDRESS'),
  x402Network: process.env.X402_NETWORK ?? 'xlayer-mainnet',
  x402Asset: process.env.X402_ASSET ?? 'USDT',
  corsOrigin: process.env.CORS_ORIGIN ?? 'https://x-sight.vercel.app,http://localhost:5173',
  allowDevBypass: process.env.ALLOW_DEV_BYPASS === 'true',
} as const;

export const isConfigured = {
  anthropic: () => env.anthropicApiKey.length > 0,
  okx: () =>
    env.okxApiKey.length > 0 &&
    env.okxSecretKey.length > 0 &&
    env.okxPassphrase.length > 0 &&
    env.okxProjectId.length > 0,
  x402: () => env.x402PayoutAddress.length > 0,
  signer: () => env.deployerPrivateKey.length > 0 && env.agenticWalletAddress.length > 0,
};
