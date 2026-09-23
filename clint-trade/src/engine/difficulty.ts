import type { Difficulty } from '@/types';

export interface DifficultyCfg {
  label: string;
  vol: number; eventFreq: number; crashMult: number; marginCall: number; stopOut: number;
  spread: number; loanRate: number; slip: number; regimeDur: number; chaos: number; blurb: string;
}

export const DIFFICULTY: Record<Difficulty, DifficultyCfg> = {
  EASY: { label: 'Easy', vol: 0.78, eventFreq: 0.7, crashMult: 0.5, marginCall: 80, stopOut: 30, spread: 0.8, loanRate: 0.8, slip: 0.7, regimeDur: 1.2, chaos: 0, blurb: 'Lower volatility, forgiving margin, cheaper loans.' },
  NORMAL: { label: 'Normal', vol: 1, eventFreq: 1, crashMult: 1, marginCall: 100, stopOut: 50, spread: 1, loanRate: 1, slip: 1, regimeDur: 1, chaos: 0.15, blurb: 'Balanced risk and reward.' },
  HARD: { label: 'Hard', vol: 1.3, eventFreq: 1.15, crashMult: 1.5, marginCall: 130, stopOut: 70, spread: 1.3, loanRate: 1.25, slip: 1.4, regimeDur: 0.85, chaos: 0.4, blurb: 'Higher volatility and low margin tolerance.' },
  CHAOS: { label: 'Chaos', vol: 1.6, eventFreq: 2, crashMult: 3, marginCall: 150, stopOut: 80, spread: 1.6, loanRate: 1.5, slip: 1.8, regimeDur: 0.6, chaos: 1, blurb: 'Extreme events, unpredictable regimes, rare disasters.' },
};
