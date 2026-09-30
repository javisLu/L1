import { useState } from 'react';
import { LibCrumbs, TopBar } from '../components/common';
import { fixed, money } from '../domain/calc';

const FIELDS: [key: string, label: string, unit: string, def: number][] = [
  ['buy', '采购单价（含税）', 'CNY / 件', 45], ['pack', '包装成本', 'CNY / 件', 3], ['qty', '数量', '件', 1000],
  ['inland', '国内运费（整票）', 'CNY', 800], ['port', '报关 / 港杂（整票）', 'CNY', 650], ['freight', '海运费（整票）', 'USD', 1200],
  ['ins', '保险费率', '%', 0.3], ['vat', '增值税率', '%', 13], ['rebate', '出口退税率', '%', 13],
  ['rate', '汇率', 'CNY / USD', 7.1], ['margin', '目标利润率', '%', 15], ['quoteFob', '客户还价（FOB 单价，可选）', 'USD', 0],
];

/** 出口报价：退税按不含税采购价计算；FOB 含国内费用，CFR 加海运费，CIF 按 110% 投保 */
export function quote(v: Record<string, number>) {
  const qty = Math.max(1, v.qty), rate = v.rate || 1, m = v.margin / 100;
  const rebate = (v.buy / (1 + v.vat / 100)) * (v.rebate / 100);
  const exwCost = v.buy + v.pack - rebate;
  const fobCost = exwCost + (v.inland + v.port) / qty;
  const exw = exwCost / (1 - m) / rate;
  const fob = fobCost / (1 - m) / rate;
  const cfr = fob + v.freight / qty;
  const cif = cfr / (1 - (1.1 * v.ins) / 100);
  return { qty, rate, m, rebate, fobCost, exw, fob, cfr, cif, profit: (fob * rate - fobCost) * qty };
}

export function QuoteCalc() {
  const [raw, setRaw] = useState<Record<string, string>>(Object.fromEntries(FIELDS.map(([k, , , d]) => [k, String(d)])));
  const v = Object.fromEntries(Object.entries(raw).map(([k, s]) => [k, parseFloat(s) || 0]));
  const r = quote(v);
  const row = (n: string, price: number, desc: string, hl = false) => (
    <tr className={hl ? 'hl' : ''} key={n}>
      <td><b style={{ fontFamily: 'var(--f-ui)', color: 'var(--ink)', fontSize: 14 }}>{n}</b><div className="muted" style={{ fontSize: 12, fontFamily: 'var(--f-ui)' }}>{desc}</div></td>
      <td><b>${money(price)}</b></td><td>${money(price * r.qty)}</td>
    </tr>
  );
  const mm = v.quoteFob > 0 ? 1 - r.fobCost / (v.quoteFob * r.rate) : null;
  return (
    <>
      <TopBar><LibCrumbs title="报价计算器" /></TopBar>
      <main className="wrap">
        <div className="sec-title"><div><div className="eyebrow">小工具</div><h1 style={{ fontSize: 22 }}>报价计算器</h1></div></div>
        <div className="calc-g">
          <div className="panel"><div className="grid">
            {FIELDS.map(([k, label, unit]) => (
              <div key={k} className={'fi' + (k === 'quoteFob' ? ' w2' : '')}>
                <label htmlFor={'q-' + k}>{label} <span className="muted">{unit}</span></label>
                <input id={'q-' + k} className="num" inputMode="decimal" value={raw[k]} onChange={(e) => setRaw({ ...raw, [k]: e.target.value })} />
              </div>
            ))}
          </div></div>
          <div className="panel">
            <div className="eyebrow" style={{ marginBottom: 6 }}>按目标利润率 {fixed(r.m * 100, 1)}% 报价</div>
            <table className="qt">
              <thead><tr><th>贸易术语</th><th>单价</th><th>整单</th></tr></thead>
              <tbody>
                {row('EXW', r.exw, '工厂交货，不含国内运费和报关')}
                {row('FOB', r.fob, '含国内运费、报关港杂', true)}
                {row('CFR', r.cfr, 'FOB + 海运费')}
                {row('CIF', r.cif, 'CFR + 保险（110% 投保）')}
              </tbody>
            </table>
            <div className="note" style={{ marginTop: 14 }}>单件成本 ¥{money(r.fobCost)}（其中退税抵减 ¥{money(r.rebate)}）· FOB 整单利润约 <b>¥{money(r.profit)}</b></div>
            {mm != null && (
              <div className="note" style={{ marginTop: 14 }}>
                按客户还价 FOB ${money(v.quoteFob)}：利润率 <b>{fixed(mm * 100, 1)}%</b>，整单利润约 <b>¥{money((v.quoteFob * r.rate - r.fobCost) * r.qty)}</b>
                {mm < 0.05 && <b style={{ color: 'var(--stamp)' }}>，低于 5%，建议谨慎</b>}。
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
