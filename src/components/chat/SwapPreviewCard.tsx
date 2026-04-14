import { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowDownUp, RefreshCw, Loader2 } from 'lucide-react';
import { useSwap } from '../../hooks/useSwap';
import { tokenMeta } from '../../config/tokens';
import { TokenIcon } from '../common/TokenIcon';
import { getSwapQuote } from '../../services/okxDex';
import type { OkxQuote } from '../../services/okxDex';

interface Props {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: number;
  toAmount: number;
}

export function SwapPreviewCard({ fromSymbol, toSymbol, fromAmount, toAmount }: Props) {
  const { execute } = useSwap();
  const fromMeta = tokenMeta(fromSymbol);
  const toMeta   = tokenMeta(toSymbol);

  const [cancelled,   setCancelled]   = useState(false);
  const [executing,   setExecuting]   = useState(false);
  const [done,        setDone]        = useState(false);
  const executingRef = useRef(false); // synchronous guard against double-clicks
  const [quote,        setQuote]        = useState<OkxQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError,   setQuoteError]   = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setQuoteLoading(true);
    setQuoteError(null);
    getSwapQuote(fromSymbol, toSymbol, fromAmount)
      .then((q) => { if (alive) setQuote(q); })
      .catch((err) => { if (alive) setQuoteError(err instanceof Error ? err.message : 'Quote failed'); })
      .finally(() => { if (alive) setQuoteLoading(false); });
    return () => { alive = false; };
  }, [fromSymbol, toSymbol, fromAmount]);

  const refreshQuote = async () => {
    setQuoteLoading(true);
    setQuoteError(null);
    try { setQuote(await getSwapQuote(fromSymbol, toSymbol, fromAmount)); }
    catch (err) { setQuoteError(err instanceof Error ? err.message : 'Quote failed'); }
    finally { setQuoteLoading(false); }
  };

  // quote.toAmount is already human-readable (backend converts to decimal before sending)
  const realToAmount = quote ? Number(quote.toAmount) : toAmount;
  const displayToAmount = quoteLoading
    ? '…'
    : realToAmount.toLocaleString(undefined, { maximumFractionDigits: 6 });
  const rate = realToAmount > 0 ? (fromAmount / realToAmount).toFixed(6) : '—';
  const priceImpact = quote?.priceImpactPct != null
    ? `${Math.abs(quote.priceImpactPct).toFixed(3)}%`
    : null;

  const onExecute = async () => {
    if (executingRef.current || quoteLoading || quoteError) return;
    executingRef.current = true;
    setExecuting(true);
    try {
      await execute(fromSymbol, toSymbol, fromAmount, realToAmount);
      setDone(true);
    } finally {
      executingRef.current = false;
      setExecuting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-[#151515] rounded-2xl border border-[rgba(191,255,0,0.15)] p-4 mt-1 w-full max-w-[360px] flex items-center gap-2 text-xs text-[#BFFF00]">
        <span className="text-base">✓</span>
        <span className="font-semibold">Swap submitted — see result below</span>
      </div>
    );
  }

  if (cancelled) {
    return (
      <div className="bg-[#151515] rounded-2xl border border-[rgba(255,255,255,0.06)] p-4 mt-1 w-full max-w-[360px] text-xs text-[#A3A3A3]">
        Swap cancelled.
      </div>
    );
  }

  return (
    <div className="bg-[#151515] rounded-2xl border border-[rgba(255,255,255,0.06)] p-5 mt-1 w-full max-w-[360px]">

      {/* header */}
      <div className="flex justify-between items-center mb-4">
        <div className="px-2 py-1 bg-[rgba(167,139,250,0.08)] text-[#A78BFA] text-[10px] font-bold rounded flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          OKX DEX · AI Swap
        </div>
        <button
          onClick={refreshQuote}
          disabled={quoteLoading}
          title="Refresh quote"
          className="text-[#555] hover:text-[#A3A3A3] transition-colors disabled:opacity-40"
        >
          {quoteLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {quoteError && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-[rgba(239,68,68,0.08)] text-[#EF4444] text-[11px]">
          {quoteError}
        </div>
      )}

      {/* pay / receive */}
      <div className="flex flex-col gap-2 relative mb-4">
        <div className="bg-[#1A1A1A] rounded-xl p-3 border border-[rgba(255,255,255,0.04)]">
          <span className="text-[11px] text-[#666666]">Pay</span>
          <div className="flex justify-between items-center mt-1">
            <span className="text-xl font-bold text-[#F5F5F5]">{fromAmount}</span>
            <div className="flex items-center gap-1.5 bg-[rgba(255,255,255,0.06)] px-2.5 py-1 rounded-full">
              <TokenIcon symbol={fromMeta.symbol} size={18} />
              <span className="text-sm font-bold text-[#F5F5F5]">{fromMeta.symbol}</span>
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="w-7 h-7 rounded-full bg-[#151515] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-[#A3A3A3]">
            <ArrowDownUp className="w-3 h-3" />
          </div>
        </div>

        <div className="bg-[#1A1A1A] rounded-xl p-3 border border-[rgba(255,255,255,0.04)]">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] text-[#666666]">Receive</span>
            {!quoteLoading && !quoteError && (
              <span className="text-[10px] text-[#A78BFA]">Live · OKX DEX</span>
            )}
          </div>
          <div className="flex justify-between items-center">
            <span className={`text-xl font-bold ${quoteLoading ? 'text-[#555]' : 'text-[#F5F5F5]'}`}>
              {displayToAmount}
            </span>
            <div className="flex items-center gap-1.5 bg-[rgba(255,255,255,0.06)] px-2.5 py-1 rounded-full">
              <TokenIcon symbol={toMeta.symbol} size={18} />
              <span className="text-sm font-bold text-[#F5F5F5]">{toMeta.symbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* details */}
      <div className="flex flex-col gap-1.5 mb-4 px-1">
        <div className="flex justify-between items-center text-[11px] text-[#666666]">
          <span>Rate</span>
          <span>1 {toMeta.symbol} = {rate} {fromMeta.symbol}</span>
        </div>
        {priceImpact && (
          <div className="flex justify-between items-center text-[11px] text-[#666666]">
            <span>Price impact</span>
            <span className={Number(quote?.priceImpactPct) > 2 ? 'text-[#F59E0B]' : 'text-[#A3A3A3]'}>
              {priceImpact}
            </span>
          </div>
        )}
        {quote?.estGasOkb && (
          <div className="flex justify-between items-center text-[11px] text-[#666666]">
            <span>Est. gas</span>
            <span>{Number(quote.estGasOkb).toFixed(6)} OKB</span>
          </div>
        )}
        {quote?.routeSummary && (
          <div className="flex justify-between items-center text-[11px] text-[#666666]">
            <span>Route</span>
            <span className="truncate max-w-[180px] text-right">{quote.routeSummary}</span>
          </div>
        )}
        <div className="flex justify-between items-center text-[11px] text-[#666666]">
          <span>Network</span>
          <span>X Layer (196)</span>
        </div>
      </div>

      {/* buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setCancelled(true)}
          disabled={executing}
          className="flex-1 h-11 bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] text-[#F5F5F5] font-bold rounded-xl transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={onExecute}
          disabled={executing || quoteLoading || !!quoteError}
          className="flex-[2] h-11 bg-[#BFFF00] text-[#0A0A0A] font-bold rounded-xl hover:bg-[#D4FF33] glow-lime transition-all disabled:opacity-60"
        >
          {executing ? 'Submitting…' : quoteLoading ? 'Fetching quote…' : 'Execute Swap'}
        </button>
      </div>
    </div>
  );
}
