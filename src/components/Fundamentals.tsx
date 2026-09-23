import { game, useGame } from '@/store/controller';
import { CATALOG_MAP, CURRENCY_BANK, CURRENCY_FLAG } from '@/engine/catalog';
import { debtEquity, epsTTM, marketCapB, peOf, roeOf } from '@/engine/companyEngine';
import { compact, money, pct } from '@/utils/format';
import { Chip, Meter } from './ui';

function KV({ k, v, tone }: { k: string; v: string; tone?: 'up' | 'down' | 'warn' }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-white/[.04] py-1.5 last:border-0"><span className="text-[12px] text-mute">{k}</span><span className={`num text-[12.5px] ${tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : 'text-snow'}`}>{v}</span></div>;
}

export function FundamentalsCard({ assetId }: { assetId: string }) {
  useGame((s) => Math.floor((s.snap?.version ?? 0) / 12));   // refresh ~ every 3 s
  const w = game.world;
  const def = CATALOG_MAP[assetId];
  const a = w.asset(assetId);
  const eco = w.s.eco;
  if (!def) return null;

  if (def.cls === 'stock' && w.s.companies[def.id]) {
    const c = w.s.companies[def.id];
    const pe = peOf(c, a.price);
    const lr = c.lastReport;
    const val = a.price / Math.max(1e-9, a.fair);
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Chip tone={c.status === 'ACTIVE' ? 'up' : c.status === 'WARNING' ? 'warn' : 'down'}>{c.status}</Chip>
          <Chip tone="brand">{c.sector}</Chip>
          <Chip tone={val > 1.2 ? 'warn' : val < 0.85 ? 'cyan' : 'mute'}>{val > 1.2 ? 'Rich valuation' : val < 0.85 ? 'Cheap vs fair' : 'Near fair value'}</Chip>
        </div>
        <p className="mb-2 text-[12px] leading-relaxed text-mute">{c.blurb} CEO {c.ceo}.</p>
        <KV k="P/E (TTM)" v={pe ? pe.toFixed(1) : 'n/a (loss)'} />
        <KV k="EPS (TTM)" v={money(epsTTM(c))} />
        <KV k="Revenue growth" v={pct(c.growth * 100, 1)} tone={c.growth >= 0 ? 'up' : 'down'} />
        <KV k="Profit margin" v={pct(c.margin * 100, 1)} tone={c.margin >= 0 ? undefined : 'down'} />
        <KV k="Revenue (quarter)" v={`$${c.revenue.toFixed(1)}B`} />
        <KV k="Debt / equity" v={debtEquity(c).toFixed(2)} tone={debtEquity(c) > 2.5 ? 'down' : debtEquity(c) > 1.6 ? 'warn' : undefined} />
        <KV k="Total debt" v={`$${c.debt.toFixed(1)}B`} />
        <KV k="ROE" v={pct(roeOf(c) * 100, 1)} />
        <KV k="Market cap" v={`$${compact(marketCapB(c, a.price) * 1e9)}`} />
        <KV k="Dividend yield" v={c.dividendYield > 0 ? pct(c.dividendYield * 100, 2) : 'none'} />
        <KV k="Employees" v={c.employees.toLocaleString()} />
        <div className="mt-2"><Meter value={c.health} tone={c.health > 60 ? 'up' : c.health > 35 ? 'warn' : 'down'} label="Financial health" /></div>
        {lr ? <div className="mt-3 rounded-lg bg-abyss/50 p-2.5 text-[12px]"><div className="mb-1 font-medium">Last earnings (day {lr.day + 1})</div><div className="num text-mute">EPS ${lr.epsActual.toFixed(2)} vs ${lr.epsExpected.toFixed(2)} expected</div><div className="num text-mute">Reaction <span className={lr.reaction >= 0 ? 'text-up' : 'text-down'}>{pct(lr.reaction, 1)}</span></div><div className="mt-1 text-[11.5px] text-mute">{lr.note}</div></div> : <div className="mt-3 text-[11.5px] text-mute">No earnings report yet. Next report on day {c.nextEarningsDay + 1}.</div>}
      </div>
    );
  }
  if (def.cls === 'crypto') {
    const supply = def.supply ?? 0;
    return (
      <div>
        {def.fictional ? <Chip tone="brand" className="mb-2">Fictional coin: higher volatility</Chip> : null}
        <p className="mb-2 text-[12px] leading-relaxed text-mute">{def.desc}</p>
        <KV k="Market cap" v={`$${compact(supply * a.price)}`} />
        <KV k="Circulating supply" v={compact(supply)} />
        <KV k="24h volume" v={`$${compact(a.volume24 * a.price)}`} />
        <KV k="Network activity" v={`${Math.max(0, Math.min(100, a.networkActivity)).toFixed(0)}/100`} tone={a.networkActivity > 60 ? 'up' : a.networkActivity < 40 ? 'down' : undefined} />
        <KV k="Sentiment" v={a.sentiment > 0.25 ? 'Bullish' : a.sentiment < -0.25 ? 'Bearish' : 'Neutral'} tone={a.sentiment > 0.25 ? 'up' : a.sentiment < -0.25 ? 'down' : undefined} />
        <KV k="Valuation vs anchor" v={pct((a.price / a.fair - 1) * 100, 1)} />
        <KV k="Daily volatility (base)" v={pct(def.dailyVol * 100, 1)} />
      </div>
    );
  }
  if (def.cls === 'forex') {
    const b = def.base!, qt = def.quote!;
    const row = (cur: string) => (
      <div className="rounded-lg bg-abyss/50 p-2.5">
        <div className="mb-1 text-[12px] font-medium">{CURRENCY_FLAG[cur]} {cur} <span className="text-mute">({CURRENCY_BANK[cur]})</span></div>
        <KV k="Interest rate" v={`${eco.rates[cur].toFixed(2)}%`} /><KV k="Inflation" v={`${eco.inflation[cur].toFixed(1)}%`} /><KV k="Economic growth" v={`${eco.growth[cur].toFixed(1)}%`} /><KV k="Unemployment" v={`${eco.unemployment[cur].toFixed(1)}%`} />
      </div>
    );
    const diff = eco.rates[b] - eco.rates[qt];
    return (
      <div><p className="mb-2 text-[12px] leading-relaxed text-mute">{def.desc}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{row(b)}{row(qt)}</div>
        <div className="mt-2"><KV k="Rate differential" v={`${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`} tone={diff >= 0 ? 'up' : 'down'} /><KV k="Pip size" v={String(def.pipSize)} /><KV k="Lot size" v={(def.lotSize ?? 0).toLocaleString()} /></div>
      </div>
    );
  }
  if (def.cls === 'bond') {
    const y0 = def.id === 'T10Y' ? 4.15 : 4.55;
    const y = y0 - (Math.log(a.price / def.price0) / (def.duration ?? 7.5)) * 100;
    return <div><p className="mb-2 text-[12px] text-mute">{def.desc}</p><KV k="Implied yield" v={`${y.toFixed(2)}%`} /><KV k="Duration" v={`${def.duration} yrs`} /><KV k="Policy rate (USD)" v={`${eco.rates.USD.toFixed(2)}%`} /><KV k="Inflation (USD)" v={`${eco.inflation.USD.toFixed(1)}%`} /></div>;
  }
  if (def.cls === 'index') {
    return <div><p className="mb-2 text-[12px] text-mute">{def.desc}</p><div className="text-[11.5px] text-mute">Constituents</div>{(def.constituents ?? []).slice(0, 12).map((c) => { const ca = w.asset(c.id); const d = CATALOG_MAP[c.id]; return <KV key={c.id} k={`${d?.symbol} (${(c.w * 100).toFixed(1)}%)`} v={pct(ca.dayOpen > 0 ? (ca.price / ca.dayOpen - 1) * 100 : 0)} tone={ca.price >= ca.dayOpen ? 'up' : 'down'} />; })}</div>;
  }
  return <div><p className="mb-2 text-[12px] text-mute">{def.desc}</p><KV k="Sentiment" v={a.sentiment > 0.25 ? 'Bullish' : a.sentiment < -0.25 ? 'Bearish' : 'Neutral'} /><KV k="USD rate" v={`${eco.rates.USD.toFixed(2)}%`} /><KV k="Inflation (USD)" v={`${eco.inflation.USD.toFixed(1)}%`} /><KV k="Daily volatility (base)" v={pct(def.dailyVol * 100, 1)} /></div>;
}
