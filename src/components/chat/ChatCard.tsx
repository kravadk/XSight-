import type { CardPayload } from '../../types/cards';
import { TokenCard } from './TokenCard';
import { SwapPreviewCard } from './SwapPreviewCard';
import { TxPendingCard } from './TxPendingCard';
import { TxSuccessCard } from './TxSuccessCard';
import { PortfolioCard } from './PortfolioCard';
import { RiskCard } from './RiskCard';
import { YieldCard } from './YieldCard';
import { MezoTroveCard } from './MezoTroveCard';
import { RichText } from '../common/RichText';
import { AlertTriangle } from 'lucide-react';

export function ChatCard({ card }: { card: CardPayload }) {
  switch (card.kind) {
    case 'text':
      return <RichText text={card.text} className="text-sm" />;
    case 'tokens':
      return (
        <div className="flex flex-col gap-2">
          {card.intro && <p className="leading-relaxed">{card.intro}</p>}
          <div className="flex flex-col gap-2">
            {card.symbols.map((s) => (
              <TokenCard key={s} symbol={s} />
            ))}
          </div>
        </div>
      );
    case 'swap':
      return (
        <SwapPreviewCard
          fromSymbol={card.fromSymbol}
          toSymbol={card.toSymbol}
          fromAmount={card.fromAmount}
          toAmount={card.toAmount}
        />
      );
    case 'portfolio':
      return <PortfolioCard advice={card.advice} />;
    case 'risk':
      return <RiskCard symbol={card.symbol} />;
    case 'yield':
      return <YieldCard pairs={card.pairs} />;
    case 'txPending':
      return (
        <TxPendingCard
          fromSymbol={card.fromSymbol}
          toSymbol={card.toSymbol}
          fromAmount={card.fromAmount}
          toAmount={card.toAmount}
        />
      );
    case 'txSuccess':
      return (
        <TxSuccessCard
          fromSymbol={card.fromSymbol}
          toSymbol={card.toSymbol}
          fromAmount={card.fromAmount}
          toAmount={card.toAmount}
          hash={card.hash}
        />
      );
    case 'mezoTrove':
      return <MezoTroveCard address={card.address} />;
    case 'error':
      return (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] text-[#EF4444] text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{card.text}</span>
        </div>
      );
    default:
      return null;
  }
}
