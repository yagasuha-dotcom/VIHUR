import { useState } from 'react';
import { useGame } from '@/store/controller';
import { Modal } from '@/components/ui';

const Candle = ({ up }: { up: boolean }) => <svg viewBox="0 0 60 90" className="h-24"><line x1="30" x2="30" y1="8" y2="82" stroke={up ? '#2ED3A0' : '#FF5C74'} strokeWidth="3" /><rect x="16" y={up ? 26 : 30} width="28" height="38" rx="3" fill={up ? '#2ED3A0' : '#FF5C74'} /></svg>;

const STEPS: { title: string; body: string; art?: JSX.Element }[] = [
  { title: 'What is a market?', body: 'A market is where buyers and sellers meet. Prices move because more people want to buy (price rises) or more want to sell (price falls). In CLINT TRADE the whole world is virtual and alive: news, the economy and other traders push prices around, and they remember what happened yesterday.' },
  { title: 'What is a candle?', body: 'Each candle summarises a period of time: open, high, low and close. A green candle closed higher than it opened. A red candle closed lower. The thin lines (wicks) show how far price stretched before settling. Change the timeframe (1m to 1W) to zoom the story in or out.', art: <div className="flex items-end justify-center gap-6"><Candle up /><Candle up={false} /></div> },
  { title: 'BUY vs SELL', body: 'BUY (long) profits when the price goes up. SELL (short) profits when the price goes down. You buy at the ask price and sell at the bid price. The gap between them is the spread, a built-in cost that widens when markets are stressed.' },
  { title: 'Stop Loss', body: 'A stop loss closes your trade automatically if it moves against you by a level you choose. It caps your loss before you enter. In fast markets or at a gap it can fill at a worse price than planned (slippage).' },
  { title: 'Take Profit', body: 'A take profit closes your trade automatically once it reaches your target. Together with a stop loss it defines a plan: how much you risk, and how much you aim to make.' },
  { title: 'Leverage', body: 'Leverage lets you control a bigger position with less money. 10x means a 1% move changes your account by about 10%. It magnifies profit and loss equally, and it is the fastest way to lose an account.' },
  { title: 'Margin', body: 'Margin is the deposit reserved to hold a leveraged position. If losses eat your equity and the margin level drops too low you get a MARGIN CALL, and if it keeps falling positions are force-closed (LIQUIDATION).' },
  { title: 'News & the economy', body: 'Headlines and the economic calendar move prices. A rumour matters less than an official release. And a strong result can still send a price lower if the market already expected it. Watch the countdown in the header: volatility and spreads rise before big events.' },
  { title: 'Risk management', body: 'Most traders fail from oversized risk, not bad ideas. Keep risk per trade small (about 1-2% of equity), always use a stop loss, avoid high leverage, and do not chase losses. Your discipline, patience and risk control are tracked and shape your reputation.' },
];

export function TutorialModal() {
  const open = useGame((s) => s.tutorial);
  const [i, setI] = useState(0);
  const s = STEPS[i];
  const close = () => { setI(0); useGame.setState({ tutorial: false }); };
  return (
    <Modal open={open} onClose={close} title={<span>WELCOME TO CLINT TRADE <span className="ml-1 text-[12px] font-normal text-mute">{i + 1}/{STEPS.length}</span></span>} width="max-w-lg">
      <div className="min-h-[230px]">
        <h3 className="mb-2 text-[18px] font-semibold"><span className="mr-2 text-brand">{i + 1}.</span>{s.title}</h3>
        {s.art ? <div className="mb-3 rounded-xl bg-abyss/60 p-3">{s.art}</div> : null}
        <p className="text-[13.5px] leading-relaxed text-soft">{s.body}</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button className="btn-ghost text-mute" onClick={close}>Skip tutorial</button>
        <div className="flex gap-2">{i > 0 ? <button className="btn-line" onClick={() => setI(i - 1)}>Back</button> : null}{i < STEPS.length - 1 ? <button className="btn-brand" onClick={() => setI(i + 1)}>Next</button> : <button className="btn-brand" onClick={close}>Start trading</button>}</div>
      </div>
      <div className="mt-3 flex justify-center gap-1">{STEPS.map((_, k) => <i key={k} className={`h-1 rounded-full transition-all ${k === i ? 'w-5 bg-brand' : 'w-1.5 bg-white/15'}`} />)}</div>
    </Modal>
  );
}
