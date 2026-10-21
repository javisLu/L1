import { useState } from 'react';
import { LibCrumbs, TopBar } from '../components/common';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { amountWords, money, toNum } from '../domain/calc';
import { CURRENCY_CN } from '../domain/constants';
import { RATE_CURS, convert, fetchRates, fmtRate } from '../domain/rates';
import { rmbWords } from '../domain/purchase';
import { hsLookupUrl, suggestNames } from '../domain/hs';
import { lookupHs } from '../components/hsLookup';
import type { Currency } from '../domain/types';

function ToolPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <TopBar><LibCrumbs title={title} /></TopBar>
      <main className="wrap">
        <div className="sec-title"><div><div className="eyebrow">小工具</div><h1 style={{ fontSize: 22 }}>{title}</h1></div></div>
        {children}
      </main>
    </>
  );
}

const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast('已复制'), () => toast('复制失败，请手动选中复制'));
const curName = (c: Currency) => CURRENCY_CN[c] ?? c;

/* ---------- 汇率换算 ---------- */
export function RateTool() {
  const rates = useData((s) => s.settings.rates);
  const updateSettings = useData((s) => s.updateSettings);
  const busy = useUI((s) => s.busy);
  const [amt, setAmt] = useState('1000');
  const [from, setFrom] = useState<Currency>('USD');
  const n = toNum(amt);
  const setRate = (c: Currency, v: string) => updateSettings((s) => {
    s.rates.cny[c] = toNum(v);
    s.rates.source = '手工填写';
    s.rates.date = new Date().toISOString().slice(0, 10);
  });
  const refresh = async () => {
    useUI.getState().set({ busy: true });
    toast('正在联网更新汇率…', undefined, 20000, 'rates');
    try {
      const t = await fetchRates();
      updateSettings((s) => void (s.rates = t));
      toast(`已更新到 ${t.date}（${t.source}）`, undefined, undefined, 'rates');
    } catch (e) {
      const why = e instanceof TypeError ? '网络连不上' : e instanceof Error ? e.message : String(e);
      toast(`联网更新失败（${why}），可以直接在右边表里手工填`, undefined, 8000, 'rates');
    } finally {
      useUI.getState().set({ busy: false });
    }
  };
  return (
    <ToolPage title="汇率换算">
      <div className="calc-g">
        <div className="panel">
          <div className="grid">
            <div className="fi"><label htmlFor="rt-amt">金额</label><input id="rt-amt" className="num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
            <div className="fi">
              <label htmlFor="rt-from">币种</label>
              <select id="rt-from" value={from} onChange={(e) => setFrom(e.target.value as Currency)}>{RATE_CURS.map((c) => <option key={c} value={c}>{curName(c)}</option>)}</select>
            </div>
          </div>
          <table className="qt" style={{ marginTop: 14 }}>
            <thead><tr><th>换算成</th><th>金额</th><th>汇率</th></tr></thead>
            <tbody>
              {RATE_CURS.filter((c) => c !== from).map((c) => (
                <tr key={c} className={c === 'CNY' ? 'hl' : ''}>
                  <td>{curName(c)}</td>
                  <td><b>{money(convert(n, from, c, rates))}</b></td>
                  <td className="muted">1 {from} = {fmtRate(convert(1, from, c, rates))} {c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="rt-h">
            <div>
              <b>参考汇率</b>（1 外币 = ? 元）
              <div className="muted" style={{ fontSize: 12 }}>{rates.date} · {rates.source}</div>
            </div>
            <button className="btn sm" disabled={busy} onClick={() => void refresh()}>联网更新</button>
          </div>
          <div className="rt-list">
            {RATE_CURS.filter((c) => c !== 'CNY').map((c) => (
              <label key={c} className="rt-row">
                <span>{curName(c)}</span>
                <input className="num" inputMode="decimal" aria-label={c + ' 汇率'} defaultValue={String(rates.cny[c] ?? '')} key={rates.date + rates.source + c} onBlur={(e) => e.target.value !== String(rates.cny[c]) && setRate(c, e.target.value)} />
              </label>
            ))}
          </div>
          <div className="note" style={{ marginTop: 12 }}>
            联网更新取的是参考中间价（欧洲央行，取不到时用 ExchangeRate-API），银行实际结汇价通常低一点，可以直接改成银行给的价。
            工厂采购的成本利润里没填汇率时，按这里的汇率估算。
          </div>
        </div>
      </div>
    </ToolPage>
  );
}

/* ---------- 金额大写 ---------- */
export function WordsTool() {
  const [amt, setAmt] = useState('12345.60');
  const [cur, setCur] = useState<Currency>('USD');
  const n = Math.round(toNum(amt) * 100) / 100;
  const say = amountWords(n, cur);
  const plain = say.replace(/^SAY /, '');
  const cents = Math.round(n * 100) % 100;
  const frac = say.replace(/ AND CENTS .* ONLY$/, ' ONLY').replace(/ ONLY$/, cents ? ` AND ${String(cents).padStart(2, '0')}/100 ONLY` : ' ONLY');
  const rows: [string, string][] = [
    ['单据常用（发票、PI、合同）', say],
    ['不带 SAY', plain],
    ['分写成分数（信用证、汇票常用）', frac],
    ['人民币大写（按这个数字）', rmbWords(n)],
  ];
  return (
    <ToolPage title="金额大写">
      <div className="panel tool-panel">
        <div className="grid" style={{ maxWidth: 520 }}>
          <div className="fi"><label htmlFor="wd-amt">金额</label><input id="wd-amt" className="num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} /></div>
          <div className="fi">
            <label htmlFor="wd-cur">币种</label>
            <select id="wd-cur" value={cur} onChange={(e) => setCur(e.target.value as Currency)}>{RATE_CURS.map((c) => <option key={c} value={c}>{curName(c)}</option>)}</select>
          </div>
        </div>
        <div className="wd-list">
          {rows.map(([l, t]) => (
            <div key={l} className="wd-row">
              <small>{l}</small>
              <div><span className="wd-t">{n ? t : '—'}</span><button className="btn ghost sm" disabled={!n} onClick={() => copy(t)}>复制</button></div>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: 12 }}>单据上的大写软件会自动生成；这里给单独写邮件、填银行单子、改信用证时用。</div>
      </div>
    </ToolPage>
  );
}

/* ---------- HS 查询 ---------- */
export function HsQuery() {
  const hsLib = useData((s) => s.hsLib);
  const go = useUI((s) => s.go);
  const [q, setQ] = useState('');
  const kw = q.trim();
  const digits = kw.replace(/\D/g, '');
  const hits = kw ? suggestNames(hsLib, kw, 20) : [];
  return (
    <ToolPage title="HS 查询">
      <div className="panel">
        <div className="toolbar">
          <label className="search"><span className="muted">查</span><input autoFocus placeholder="中文品名或商品编号（前几位即可）" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && kw && lookupHs(digits.length >= 4 ? digits : '', kw)} /></label>
          <button className="btn pri sm" disabled={!kw} title={kw ? hsLookupUrl(digits.length >= 4 ? digits : '', kw) : ''} onClick={() => lookupHs(digits.length >= 4 ? digits : '', kw)}>网上查</button>
        </div>
        {kw ? (
          <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table className="tbl" style={{ minWidth: 760 }}>
            <thead><tr><th>中文品名（HS 记忆库）</th><th style={{ width: 130 }}>商品编号</th><th>申报要素</th><th style={{ width: 80 }}>退税率</th><th style={{ width: 150 }} /></tr></thead>
            <tbody>
              {hits.map((e) => (
                <tr key={e.id}>
                  <td><b>{e.nameCn}</b></td><td className="num">{e.hs}</td><td style={{ fontSize: 12.5 }}>{e.elements}</td><td className="num">{String(e.rebate) !== '' ? `${e.rebate}%` : ''}</td>
                  <td className="row-act">
                    <button className="btn ghost sm" onClick={() => copy(e.hs)}>复制编码</button>
                    <button className="btn ghost sm" onClick={() => lookupHs(e.hs, e.nameCn)}>网上查</button>
                  </td>
                </tr>
              ))}
              {!hits.length && <tr><td colSpan={5} className="empty">记忆库里没有「{kw}」，点「网上查」或按回车，在 HS 编码网上查</td></tr>}
            </tbody>
          </table></div>
        ) : (
          <div className="empty">输入中文品名或编码：先查自己的 HS 记忆库（报过的品名、编码、申报要素、退税率），没有就一键到 HS 编码网上查。</div>
        )}
      </div>
      <div className="note">记忆库里的内容在 <button className="link-btn" onClick={() => go('hs')}>资料库 → HS 记忆库</button> 里修改；报关资料里填过的品名和编码会自动记进去。</div>
    </ToolPage>
  );
}
