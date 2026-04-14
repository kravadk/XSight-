import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { recordActivity } from '../services/activityTracker.js';
import type { X402CallLog, X402PaymentInstruction, X402PaymentProof } from '../types/index.js';

export interface X402Options {
  amount: string;
  description: string;
}

export const x402Log: X402CallLog[] = [];

// Warn once at startup so it's visible in logs
if (process.env.NODE_ENV !== 'production') {
  console.warn('[x402] dev-bypass is enabled — set NODE_ENV=production to disable');
}

function logCall(entry: X402CallLog) {
  x402Log.push(entry);
  if (x402Log.length > 500) x402Log.shift();
  recordActivity(entry.status === 'paid' ? 'x402.payment' : 'x402.rejected', entry.endpoint);
}

function parsePaymentHeader(header: string): X402PaymentProof | null {
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf-8');
    const obj = JSON.parse(decoded) as X402PaymentProof;
    if (typeof obj.payTo !== 'string' || typeof obj.amount !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

function buildInstructions(opts: X402Options): { x402Version: number; accepts: X402PaymentInstruction[] } {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: env.x402Network,
        asset: env.x402Asset,
        amount: opts.amount,
        payTo: env.x402PayoutAddress,
        description: opts.description,
        gasSponsored: true,
      },
    ],
  };
}

export function withX402(opts: X402Options) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header('X-PAYMENT');
    const endpoint = req.originalUrl;
    const required = Number(opts.amount);

    if (!header) {
      logCall({
        timestamp: Date.now(),
        endpoint,
        caller: 'anonymous',
        amount: required,
        asset: env.x402Asset,
        status: 'rejected',
      });
      res.status(402).json(buildInstructions(opts));
      return;
    }

    if (header === 'dev-bypass' && (env.nodeEnv !== 'production' || env.allowDevBypass)) {
      logCall({
        timestamp: Date.now(),
        endpoint,
        caller: 'dev-bypass',
        amount: required,
        asset: env.x402Asset,
        status: 'paid',
      });
      next();
      return;
    }

    const proof = parsePaymentHeader(header);
    if (!proof) {
      logCall({
        timestamp: Date.now(),
        endpoint,
        caller: 'invalid',
        amount: required,
        asset: env.x402Asset,
        status: 'rejected',
      });
      res.status(402).json({ ...buildInstructions(opts), error: 'invalid_payment_header' });
      return;
    }

    const expectedPayTo = env.x402PayoutAddress.toLowerCase();
    const actualPayTo = proof.payTo.toLowerCase();
    const paid = Number(proof.amount);

    // Validate payTo is a plausible Ethereum address before slicing
    const isValidAddress = /^0x[0-9a-f]{40}$/.test(actualPayTo);
    const callerLabel = proof.payer ?? (isValidAddress ? actualPayTo.slice(0, 12) : 'unknown');

    const valid =
      isValidAddress &&
      actualPayTo === expectedPayTo &&
      paid >= required &&
      proof.network === env.x402Network &&
      proof.asset === env.x402Asset;

    if (!valid) {
      logCall({
        timestamp: Date.now(),
        endpoint,
        caller: callerLabel,
        amount: paid,
        asset: env.x402Asset,
        status: 'rejected',
      });
      res.status(402).json({ ...buildInstructions(opts), error: 'payment_verification_failed' });
      return;
    }

    logCall({
      timestamp: Date.now(),
      endpoint,
      caller: callerLabel,
      amount: paid,
      asset: env.x402Asset,
      status: 'paid',
    });
    next();
  };
}
