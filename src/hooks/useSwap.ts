import { useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { api, ApiError } from '../api/client';
import { tokenMeta } from '../config/tokens';
import { toRawAmount, fromRawAmount } from '../services/okxDex';

let counter = 0;
const nextId = () => {
  counter += 1;
  return `swap-${Date.now()}-${counter}`;
};

export const useSwap = () => {
  const addMessage     = useChatStore((s) => s.addMessage);
  const replaceMessage = useChatStore((s) => s.replaceMessage);

  const execute = useCallback(
    async (fromSymbol: string, toSymbol: string, fromAmount: number, toAmount: number) => {
      const pendingId = nextId();
      const now = Date.now();

      addMessage({
        id: pendingId,
        role: 'ai',
        cards: [{ kind: 'txPending', fromSymbol, toSymbol, fromAmount, toAmount }],
        createdAt: now,
      });

      const fromDecimals = tokenMeta(fromSymbol).decimals;
      const toDecimals   = tokenMeta(toSymbol).decimals;
      const rawAmount    = toRawAmount(fromAmount, fromDecimals);

      try {
        const result = await api.swap(fromSymbol, toSymbol, rawAmount);
        if (!result.txHash) throw new Error('Swap returned no transaction hash');

        const confirmedToAmount =
          result.toAmount > 0
            ? fromRawAmount(String(result.toAmount), toDecimals)
            : toAmount;

        // Replace pending card in-place → no duplicate message in chat
        replaceMessage(pendingId, {
          id: pendingId,
          role: 'ai',
          cards: [{
            kind: 'txSuccess',
            fromSymbol,
            toSymbol,
            fromAmount,
            toAmount: confirmedToAmount,
            hash: result.txHash,
          }],
          createdAt: now,
        });
      } catch (err) {
        const detail =
          err instanceof ApiError && err.detail
            ? err.detail
            : err instanceof Error
              ? err.message
              : 'unknown error';
        replaceMessage(pendingId, {
          id: pendingId,
          role: 'ai',
          cards: [{ kind: 'error', text: `Swap failed: ${detail}` }],
          createdAt: now,
        });
      }
    },
    [addMessage, replaceMessage],
  );

  return { execute };
};
