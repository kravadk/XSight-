export type CardPayload =
  | { kind: 'text'; text: string }
  | { kind: 'tokens'; symbols: string[]; intro: string }
  | {
      kind: 'swap';
      fromSymbol: string;
      toSymbol: string;
      fromAmount: number;
      toAmount: number;
    }
  | { kind: 'portfolio'; advice: string }
  | { kind: 'risk'; symbol: string }
  | { kind: 'yield'; pairs?: string[] }
  | {
      kind: 'txPending';
      fromSymbol: string;
      toSymbol: string;
      fromAmount: number;
      toAmount: number;
    }
  | {
      kind: 'txSuccess';
      fromSymbol: string;
      toSymbol: string;
      fromAmount: number;
      toAmount: number;
      hash: string;
    }
  | { kind: 'error'; text: string };
