import { useEffect, useState } from 'react';
import { Heart, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../api/client';

interface HeartbeatStatus {
  running: boolean;
  count: number;
  lastAt: number;
  lastTxHash: string | null;
  intervalMs: number;
}

function useCountdown(lastAt: number, intervalMs: number) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const update = () => {
      const nextAt = lastAt + intervalMs;
      const remaining = Math.max(0, Math.floor((nextAt - Date.now()) / 1000));
      setSecs(remaining);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lastAt, intervalMs]);
  return secs;
}

export function HeartbeatCard() {
  const [status, setStatus] = useState<HeartbeatStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = () =>
      api.heartbeat()
        .then((s) => { setStatus(s); setError(false); })
        .catch(() => setError(true));
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const countdown = useCountdown(status?.lastAt ?? 0, status?.intervalMs ?? 480_000);
  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="bg-[#0D0D0D] rounded-2xl border border-[rgba(255,255,255,0.06)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <motion.div
            animate={status?.running ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            <Heart className="w-4 h-4 text-[#EF4444]" fill={status?.running ? '#EF4444' : 'none'} />
          </motion.div>
          <h3 className="text-sm font-bold text-[#F5F5F5]">Agent Heartbeat</h3>
        </div>
        <AnimatePresence>
          {status?.running && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 text-[10px] font-bold text-[#22C55E] bg-[rgba(34,197,94,0.1)] px-2 py-0.5 rounded"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              ACTIVE
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {status === null && error ? (
        <div className="py-4 text-center text-[11px] text-[#555]">Heartbeat unavailable</div>
      ) : status === null ? (
        <div className="skeleton h-16 rounded-xl" />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#161616] rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-[#BFFF00]">{status.count}</div>
            <div className="text-[10px] text-[#666]">micro-swaps</div>
          </div>
          <div className="bg-[#161616] rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-[#F5F5F5]">
              {status.lastAt > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : '—'}
            </div>
            <div className="text-[10px] text-[#666]">next tick</div>
          </div>
          <div className="bg-[#161616] rounded-xl p-3 text-center">
            <div className="text-lg font-extrabold text-[#A78BFA]">{Math.round((status.intervalMs ?? 480_000) / 60_000)}m</div>
            <div className="text-[10px] text-[#666]">interval</div>
          </div>
        </div>
      )}

      {status?.lastTxHash && (
        <a
          href={`https://www.okx.com/web3/explorer/xlayer/tx/${status.lastTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex items-center gap-2 text-[10px] text-[#525252] hover:text-[#A3A3A3] transition-colors"
        >
          <ExternalLink className="w-3 h-3 shrink-0" />
          <span className="font-mono truncate">Last: {status.lastTxHash.slice(0, 20)}…</span>
        </a>
      )}
      <p className="mt-2 text-[10px] text-[#444]">
        Autonomous micro-swap every 8 minutes — proves continuous on-chain activity independent of user actions.
      </p>
    </div>
  );
}
