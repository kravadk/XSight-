import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Check, ArrowDownUp, X } from 'lucide-react';
import { TokenIcon } from '../common/TokenIcon';
import { TokenPicker } from '../common/TokenPicker';
import { api, type SwapQuoteDto, type CatalogTokenDto } from '../../api/client';
import { useSwap } from '../../hooks/useSwap';
import { useUiStore } from '../../store/uiStore';
import { toast } from '../../store/toastStore';
import { cn } from '../../utils/format';

interface Props {
  onClose: () => void;
}

const STEPS = ['Pair', 'Amount', 'Preview', 'Confirm'] as const;
type Step = (typeof STEPS)[number];

export function SwapWizard({ onClose }: Props) {
  const [step, setStep] = useState<Step>('Pair');
  const [from, setFrom] = useState<CatalogTokenDto | null>(null);
  const [to, setTo] = useState<CatalogTokenDto | null>(null);
  const [amount, setAmount] = useState('100');
  const [quote, setQuote] = useState<SwapQuoteDto | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { execute } = useSwap();
  const setActiveTab = useUiStore((s) => s.setActiveTab);

  // Bootstrap defaults from the catalog (USDT → OKB)
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.resolveToken('USDT'), api.resolveToken('OKB')])
      .then(([u, o]) => {
        if (cancelled) return;
        setFrom((prev) => prev ?? u);
        setTo((prev) => prev ?? o);
      })
      .catch(() => { /* catalog unavailable — user can pick tokens manually */ });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 'Preview' || !from || !to) return;
    const num = Number(amount);
    if (!num || num <= 0 || from.address.toLowerCase() === to.address.toLowerCase()) {
      setQuote(null);
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    const raw = BigInt(Math.round(num * 10 ** from.decimals)).toString();
    let cancelled = false;
    void api
      .swapQuote(from.address, to.address, raw)
      .then((q) => {
        if (!cancelled) { setQuote(q); setQuoteError(null); }
      })
      .catch((err) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(err instanceof Error ? err.message : 'Quote unavailable');
        }
      })
      .finally(() => {
        if (!cancelled) setQuoting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, from, to, amount]);

  const stepIndex = STEPS.indexOf(step);
  const next = () => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  const prev = () => setStep(STEPS[Math.max(stepIndex - 1, 0)]);

  const submit = async () => {
    if (!from || !to) return;
    const num = Number(amount);
    if (!num || num <= 0) {
      toast.error('Enter an amount');
      return;
    }
    setSubmitting(true);
    onClose();
    setActiveTab('chat');
    // quote.toAmount is already human-readable (backend converts before sending)
    const toAmountHuman = quote ? Number(quote.toAmount) : 0;
    await execute(from.address, to.address, num, toAmountHuman);
    setSubmitting(false);
  };

  // quote.toAmount is already human-readable — do NOT divide by decimals again
  const toHuman = quote ? Number(quote.toAmount) : 0;
  const sameToken = from && to && from.address.toLowerCase() === to.address.toLowerCase();

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[110]"
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.96 }}
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] max-w-[94vw] bg-[#161616] border border-[rgba(255,255,255,0.1)] rounded-2xl z-[120] overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.06)]">
          <div>
            <h3 className="text-base font-bold text-[#F5F5F5]">Advanced Swap</h3>
            <p className="text-[11px] text-[#666] mt-0.5">Step-by-step trade builder · any X Layer token</p>
          </div>
          <button onClick={onClose} className="text-[#666] hover:text-[#F5F5F5]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-0 right-0 h-[2px] bg-[rgba(255,255,255,0.06)]" />
            <div
              className="absolute top-4 left-0 h-[2px] bg-[#BFFF00] transition-all duration-700 ease-out"
              style={{
                width: `${(stepIndex / (STEPS.length - 1)) * 100}%`,
                boxShadow: '0 0 12px #BFFF0099, 0 0 4px #BFFF00',
              }}
            />
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <div key={s} className="flex flex-col items-center relative z-10">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                      done
                        ? 'bg-[#BFFF00] border-[#BFFF00] text-[#0A0A0A]'
                        : active
                          ? 'bg-[#0A0A0A] border-[#BFFF00] text-[#BFFF00]'
                          : 'bg-[#0A0A0A] border-[rgba(255,255,255,0.1)] text-[#666]',
                    )}
                  >
                    {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <div
                    className={cn(
                      'text-[10px] font-bold uppercase tracking-wider mt-1.5',
                      active ? 'text-[#F5F5F5]' : 'text-[#666]',
                    )}
                  >
                    {s}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="px-6 pb-6 min-h-[220px]"
          >
            {step === 'Pair' && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-[#A3A3A3]">
                  Pick any tokens — full X Layer catalog supported, or paste a 0x contract address.
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <div className="text-micro text-[#666] mb-1.5">From</div>
                    <TokenPicker value={from} onChange={setFrom} exclude={to?.address} className="w-full" />
                  </div>
                  <button
                    onClick={() => {
                      if (!from || !to) return;
                      setFrom(to);
                      setTo(from);
                    }}
                    className="w-9 h-9 mb-0.5 rounded-full bg-[#1A1A1A] border border-[rgba(255,255,255,0.1)] flex items-center justify-center text-[#A3A3A3] hover:text-[#BFFF00] hover:border-[#BFFF00] transition-colors"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </button>
                  <div className="flex-1">
                    <div className="text-micro text-[#666] mb-1.5">To</div>
                    <TokenPicker value={to} onChange={setTo} exclude={from?.address} className="w-full" />
                  </div>
                </div>
              </div>
            )}

            {step === 'Amount' && from && (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-[#A3A3A3]">Enter the amount of {from.symbol} to swap.</p>
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-[rgba(255,255,255,0.06)]">
                  <div className="flex items-center justify-between">
                    <input
                      autoFocus
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="bg-transparent text-3xl font-extrabold text-[#F5F5F5] tabular w-1/2 focus:outline-none"
                    />
                    <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.06)] rounded-full px-3 py-1.5">
                      <TokenIcon symbol={from.symbol} size={20} />
                      <span className="text-sm font-bold text-[#F5F5F5]">{from.symbol}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {['25', '50', '100', '500'].map((q) => (
                    <button
                      key={q}
                      onClick={() => setAmount(q)}
                      className="px-3 py-1.5 text-[11px] font-bold rounded-full bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] text-[#A3A3A3] hover:text-[#F5F5F5]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'Preview' && from && to && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[#A3A3A3]">Review the route before confirming.</p>
                {quoteError && (
                  <div className="px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.08)] text-[#EF4444] text-[11px]">
                    {quoteError}
                  </div>
                )}
                <div className="bg-[#1A1A1A] rounded-xl p-4 border border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TokenIcon symbol={from.symbol} size={28} />
                    <div>
                      <div className="text-xs text-[#666]">You pay</div>
                      <div className="text-lg font-bold text-[#F5F5F5] tabular">
                        {amount} {from.symbol}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#666]" />
                  <div className="flex items-center gap-2">
                    <TokenIcon symbol={to.symbol} size={28} />
                    <div className="text-right">
                      <div className="text-xs text-[#666]">You receive</div>
                      <div className="text-lg font-bold text-[#BFFF00] tabular">
                        {quoting ? '...' : toHuman.toFixed(4)} {to.symbol}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <Detail label="Rate" value={quote?.rate ?? '—'} />
                  <Detail label="Route" value={quote?.routeSummary ?? 'Quoting...'} />
                  <Detail label="Est gas" value={`${quote?.estGasOkb ?? '—'} OKB`} />
                  <Detail
                    label="Price impact"
                    value={
                      quote?.priceImpactPct !== undefined ? `${quote.priceImpactPct.toFixed(2)}%` : '—'
                    }
                  />
                </div>
              </div>
            )}

            {step === 'Confirm' && from && to && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[#A3A3A3]">
                  By confirming, the agentic wallet will execute this swap on X Layer. The result will
                  appear in the AI Chat tab.
                </p>
                <div className="bg-[rgba(191,255,0,0.04)] border border-[rgba(191,255,0,0.15)] rounded-xl p-4">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <TokenIcon symbol={from.symbol} size={20} />
                      <span className="font-mono tabular">{amount}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#BFFF00]" />
                    <div className="flex items-center gap-2">
                      <TokenIcon symbol={to.symbol} size={20} />
                      <span className="font-mono tabular text-[#BFFF00]">{toHuman.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="px-6 py-4 border-t border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <button
            onClick={stepIndex === 0 ? onClose : prev}
            className="text-xs text-[#A3A3A3] hover:text-[#F5F5F5]"
          >
            {stepIndex === 0 ? 'Cancel' : '← Back'}
          </button>
          {step !== 'Confirm' ? (
            <button
              onClick={next}
              disabled={
                (step === 'Pair' && (!from || !to || sameToken)) ||
                (step === 'Amount' && Number(amount) <= 0)
              }
              className="h-10 px-5 rounded-xl bg-[#BFFF00] hover:bg-[#D4FF33] text-[#0A0A0A] text-sm font-bold transition-colors disabled:opacity-40"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="h-10 px-5 rounded-xl bg-[#BFFF00] hover:bg-[#D4FF33] text-[#0A0A0A] text-sm font-bold transition-colors disabled:opacity-60 glow-lime"
            >
              {submitting ? 'Submitting...' : 'Execute swap'}
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1A1A1A] rounded-lg px-3 py-2 border border-[rgba(255,255,255,0.04)]">
      <div className="text-[10px] text-[#666] uppercase tracking-wider">{label}</div>
      <div className="text-xs font-mono text-[#F5F5F5] tabular truncate">{value}</div>
    </div>
  );
}
