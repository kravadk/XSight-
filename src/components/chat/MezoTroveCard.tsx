import { useEffect, useState } from 'react';
import { Bitcoin, ExternalLink, AlertTriangle, CheckCircle, TrendingDown, Zap } from 'lucide-react';
import { api, type MezoTroveDto } from '../../api/client';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  address: string;
}

// ── Health badge ──────────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: MezoTroveDto['health'] }) {
  const cfg = {
    safe:         { label: 'Safe',        bg: 'bg-[rgba(34,197,94,0.12)]',   text: 'text-[#22C55E]', icon: <CheckCircle className="w-3 h-3" /> },
    warning:      { label: 'Warning',     bg: 'bg-[rgba(234,179,8,0.12)]',   text: 'text-[#EAB308]', icon: <AlertTriangle className="w-3 h-3" /> },
    danger:       { label: 'Danger',      bg: 'bg-[rgba(239,68,68,0.12)]',   text: 'text-[#EF4444]', icon: <AlertTriangle className="w-3 h-3" /> },
    liquidatable: { label: 'Liquidatable',bg: 'bg-[rgba(239,68,68,0.18)]',   text: 'text-[#EF4444]', icon: <Zap className="w-3 h-3" /> },
  } as const;
  const c = cfg[health];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

// ── CR bar color ──────────────────────────────────────────────────────────────

function crBarColor(health: MezoTroveDto['health']): string {
  if (health === 'safe') return 'bg-[#22C55E]';
  if (health === 'warning') return 'bg-[#EAB308]';
  return 'bg-[#EF4444]';
}

function crTextColor(health: MezoTroveDto['health']): string {
  if (health === 'safe') return 'text-[#22C55E]';
  if (health === 'warning') return 'text-[#EAB308]';
  return 'text-[#EF4444]';
}

// ── CR bar fill (clamped 110–300%) ────────────────────────────────────────────

function crBarFill(cr: number): number {
  const pct = cr * 100; // e.g. 1.5 → 150
  const MIN = 110;
  const MAX = 300;
  return Math.min(100, Math.max(0, ((pct - MIN) / (MAX - MIN)) * 100));
}

// ── Number formatters ─────────────────────────────────────────────────────────

function fmtBtc(n: number): string {
  return n.toFixed(6);
}

function fmtMusd(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function fmtUsd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

function fmtCr(cr: number): string {
  return (cr * 100).toFixed(1) + '%';
}

function truncAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ w, h = 'h-4' }: { w: string; h?: string }) {
  return <div className={`${h} ${w} rounded bg-[#2A2A2A] animate-pulse`} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function MezoTroveCard({ address }: Props) {
  const [data, setData] = useState<MezoTroveDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    api.mezoTrove(address)
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load trove');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [address]);

  const crFill = data ? crBarFill(data.collateralRatio) : 0;

  return (
    <div className="w-full max-w-[380px] rounded-xl border border-[#2A2A2A] bg-[#151515] overflow-hidden text-sm">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A2A2A]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#F7931A]/10 shrink-0">
            <Bitcoin className="w-4 h-4 text-[#F7931A]" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white leading-tight">Mezo Trove</p>
            <p className="text-[11px] text-[#666] font-mono truncate">{truncAddr(address)}</p>
          </div>
        </div>
        {data && data.statusCode === 1 && (
          <HealthBadge health={data.health} />
        )}
      </div>

      {/* ── Body ── */}
      <div className="px-4 py-3 space-y-3">

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#1A1A1A] p-3 space-y-2">
                <Skeleton w="w-24" h="h-3" />
                <Skeleton w="w-16" h="h-5" />
                <Skeleton w="w-20" h="h-3" />
              </div>
              <div className="rounded-lg bg-[#1A1A1A] p-3 space-y-2">
                <Skeleton w="w-20" h="h-3" />
                <Skeleton w="w-16" h="h-5" />
                <Skeleton w="w-24" h="h-3" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Skeleton w="w-28" h="h-3" />
                <Skeleton w="w-16" h="h-3" />
              </div>
              <Skeleton w="w-full" h="h-2" />
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)]">
            <AlertTriangle className="w-4 h-4 text-[#EF4444] mt-0.5 shrink-0" />
            <p className="text-[#EF4444] text-xs leading-relaxed">{error}</p>
          </div>
        )}

        {/* No trove */}
        {!loading && !error && data && data.statusCode !== 1 && (
          <div className="text-center py-4 space-y-1">
            <p className="text-[#888] text-xs">
              {data.status === 'nonExistent'
                ? 'No Trove found for this address.'
                : `Trove status: ${data.status}`}
            </p>
            <p className="text-[#555] text-[11px]">
              Open a Trove to borrow MUSD against your BTC.
            </p>
          </div>
        )}

        {/* Active trove */}
        {!loading && !error && data && data.statusCode === 1 && (
          <>
            {/* Collateral / Debt grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#1A1A1A] p-3">
                <p className="text-[10px] text-[#666] uppercase tracking-wide font-medium mb-1">BTC Collateral</p>
                <p className="text-[#F7931A] font-bold text-base tabular-nums leading-tight">{fmtBtc(data.collBtc)}</p>
                <p className="text-[11px] text-[#555] tabular-nums mt-0.5">≈ {fmtUsd(data.collValueUsd)}</p>
              </div>
              <div className="rounded-lg bg-[#1A1A1A] p-3">
                <p className="text-[10px] text-[#666] uppercase tracking-wide font-medium mb-1">MUSD Debt</p>
                <p className="text-white font-bold text-base tabular-nums leading-tight">{fmtMusd(data.netDebtMusd)}</p>
                <p className="text-[11px] text-[#555] mt-0.5">net of 200 gas</p>
              </div>
            </div>

            {/* CR bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#666]">Collateral Ratio</span>
                <span className={`text-[13px] font-bold tabular-nums ${crTextColor(data.health)}`}>
                  {fmtCr(data.collateralRatio)}
                </span>
              </div>
              <div className="w-full h-2 bg-[#2A2A2A] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${crBarColor(data.health)}`}
                  style={{ width: `${crFill}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[#555]">
                <span>110% liq.</span>
                <span>150% safe</span>
                <span>200%+</span>
              </div>
            </div>

            {/* Price info */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[#1A1A1A] p-3">
                <p className="text-[10px] text-[#666] uppercase tracking-wide font-medium mb-1">BTC Price</p>
                <p className="text-white font-bold tabular-nums">{fmtUsd(data.btcPriceUsd)}</p>
              </div>
              <div className="rounded-lg bg-[#1A1A1A] p-3">
                <p className="text-[10px] text-[#666] uppercase tracking-wide font-medium mb-1">Liq. Price</p>
                <p className="text-[#EF4444] font-bold tabular-nums">{fmtUsd(data.liquidationPriceUsd)}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <a
                href="https://app.mezo.org/earn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#F7931A]/10 text-[#F7931A] text-xs font-semibold hover:bg-[#F7931A]/20 transition-colors"
              >
                <TrendingDown className="w-3.5 h-3.5" />
                Earn with MUSD
              </a>
              <a
                href={data.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2A2A2A] text-[#888] text-xs font-semibold hover:text-white hover:border-[#3A3A3A] transition-colors"
              >
                Manage
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2 border-t border-[#1E1E1E] flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] shrink-0" />
        <span className="text-[10px] text-[#555]">
          Mezo Testnet · chainId {data?.chainId ?? 31611}
        </span>
      </div>
    </div>
  );
}
