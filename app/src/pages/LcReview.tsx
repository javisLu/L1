import { useMemo, useState } from 'react';
import { OrderCrumbs, TopBar } from '../components/common';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { localDay } from '../domain/reminders';
import { LC_TAGS, amendmentText, docsRequired, parseMT700, reviewLc, sampleMT700, softClauses, swiftDate, type LcLevel } from '../domain/lc';
import type { Order } from '../domain/types';

const LEVEL: Record<LcLevel, { icon: string; cls: string }> = {
  error: { icon: '✕', cls: 'bad' }, warn: { icon: '!', cls: 'warn' }, ok: { icon: '✓', cls: 'ok' }, info: { icon: 'i', cls: 'info' },
};
/** 解析结果里先列的栏目 */
const SHOW = ['20', '31C', '31D', '32B', '39A', '44C', '48', '43P', '43T', '44E', '44F', '42C', '41A', '41D', '49', '50', '59'];

/** 信用证审证：左边粘贴电文，右边审证结果 */
export function LcReview({ order: o }: { order: Order }) {
  const ui = useUI();
  const { setOrderField, updateOrder } = useData();
  const text = o.lc?.text ?? '';
  const f = useMemo(() => parseMT700(text), [text]);
  const found = Object.keys(f).length;
  const findings = useMemo(() => (found ? reviewLc(o, f, localDay()) : []), [o, f, found]);
  const docs = useMemo(() => docsRequired(f), [f]);
  const soft = useMemo(() => softClauses(f), [f]);
  const letter = amendmentText(o, f, findings, soft);
  const [showAll, setShowAll] = useState(false);
  const latest = swiftDate(f['44C'] ?? ''), expiry = swiftDate(f['31D'] ?? '');
  const datesSynced = (!latest || o.dates?.lcLatest === latest) && (!expiry || o.dates?.lcExpiry === expiry);
  const bad = findings.filter((x) => x.level === 'error').length + soft.length;
  const warn = findings.filter((x) => x.level === 'warn').length;
  const order = (l: LcLevel) => ['error', 'warn', 'info', 'ok'].indexOf(l);

  const syncDates = () => {
    updateOrder(o.id, (x) => {
      x.dates ??= {};
      if (latest) x.dates.lcLatest = latest;
      if (expiry) x.dates.lcExpiry = expiry;
    });
    toast('已写进订单的关键日期，到期前首页「今天要做」会提醒');
  };

  return (
    <>
      <TopBar><OrderCrumbs order={o} current="信用证审证" /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        <h1><span className="code">L/C</span>信用证审证</h1>
        <span className="ord">{o.no} · {o.buyer.name || '未选择客户'}</span>
        <div className="r">
          {found > 0 && (latest || expiry) && !datesSynced && <button className="btn" onClick={syncDates}>装运期、有效期写进关键日期</button>}
        </div>
      </div>
      <main className="wrap lc">
        <section className="panel lc-in">
          <div className="lc-in-h">
            <b>信用证电文（MT700）</b>
            {!text && <button className="btn ghost sm" onClick={() => setOrderField(o.id, 'lc.text', sampleMT700(o, localDay()))}>没有电文？放一份示例看看</button>}
            {!!text && <button className="btn ghost sm" onClick={() => { const old = text; setOrderField(o.id, 'lc.text', ''); toast('已清空电文', { label: '撤销', run: () => setOrderField(o.id, 'lc.text', old) }); }}>清空</button>}
          </div>
          <textarea
            className="lc-text"
            aria-label="信用证电文"
            placeholder={'把银行发来的信用证电文整段粘贴进来，例如：\n:20: LC2026118\n:31D: 261130CHINA\n:32B: USD12345,60\n:44C: 261115\n:46A: +SIGNED COMMERCIAL INVOICE IN 3 COPIES\n…\n\n只认文字；扫描件（图片）读不出，请找银行要电文文本或可复制文字的 PDF。'}
            value={text}
            onChange={(e) => setOrderField(o.id, 'lc.text', e.target.value)}
          />
          {text && !found && <div className="note warn-note">没认出栏目代号（如 :31D:、44C:）。请确认粘贴的是 MT700 电文原文。</div>}
          {found > 0 && (
            <div className="lc-fields">
              {(showAll ? Object.keys(f) : SHOW.filter((t) => f[t])).map((t) => (
                <div key={t} className="lc-f">
                  <span><b>{t}</b> {LC_TAGS[t]?.cn ?? ''}</span>
                  <em>{['31C', '44C'].includes(t) ? `${swiftDate(f[t])}` : t === '31D' ? `${swiftDate(f[t])} ${f[t].replace(/^\s*\d{6}\s*/, '')}` : f[t]}</em>
                </div>
              ))}
              <button className="link-btn" onClick={() => setShowAll(!showAll)}>{showAll ? '只看主要栏目' : `看全部 ${found} 个栏目`}</button>
            </div>
          )}
        </section>

        <section className="lc-out">
          {!found ? (
            <div className="panel empty">粘贴电文后，这里会列出：和订单对不上的地方、单据要求、软条款风险，并生成改证函。</div>
          ) : (
            <>
              <div className={'panel lc-sum ' + (bad ? 'bad' : warn ? 'warn' : 'ok')}>
                {bad ? `发现 ${bad} 处要改证的问题` : warn ? `没有硬伤，有 ${warn} 处要留意` : '没有发现问题'}
                <span className="muted">· 信用证号 {f['20'] || '—'}{f['32B'] ? ` · ${f['32B'].replace(/\s+/g, ' ')}` : ''}</span>
              </div>

              <div className="panel">
                <h3>和订单比对</h3>
                <ul className="lc-list">
                  {[...findings].sort((a, b) => order(a.level) - order(b.level)).map((x, i) => (
                    <li key={i} className={LEVEL[x.level].cls}>
                      <i>{LEVEL[x.level].icon}</i>
                      <div>
                        <b>{x.area}</b> {x.text}
                        {x.fix && <button className="btn ghost sm" onClick={() => { updateOrder(o.id, x.fix!.apply); toast('订单已按信用证改好'); }}>{x.fix.label}</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {soft.length > 0 && (
                <div className="panel">
                  <h3>软条款风险（{soft.length}）</h3>
                  <ul className="lc-list">
                    {soft.map((s, i) => (
                      <li key={i} className="bad">
                        <i>✕</i>
                        <div><b>{s.name}</b> {s.why}<small className="lc-hit">{s.hit}</small></div>
                      </li>
                    ))}
                  </ul>
                  <div className="note">软条款按常见写法识别，抓不全；47A 附加条款最好再逐句看一遍。</div>
                </div>
              )}

              {docs.length > 0 && (
                <div className="panel">
                  <h3>单据要求（46A，{docs.length} 项）</h3>
                  <table className="tbl lc-docs">
                    <thead><tr><th style={{ width: 110 }}>单据</th><th style={{ width: 70 }}>份数</th><th>怎么出</th></tr></thead>
                    <tbody>
                      {docs.map((d, i) => (
                        <tr key={i}>
                          <td><b>{d.name}</b></td>
                          <td>{d.copies || '—'}</td>
                          <td><span className={'pill ' + (d.can ? 'ok' : '')}>{d.can ? '软件能出' : '另外办'}</span> {d.how}<small className="lc-hit">{d.text}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {letter && (
                <div className="panel">
                  <div className="diff-note-h">
                    <b>改证函（英文，发给客户）</b>
                    <button className="btn sm" onClick={() => navigator.clipboard?.writeText(letter).then(() => toast('改证函已复制'), () => toast('复制失败，请手动选中复制'))}>复制</button>
                  </div>
                  <textarea readOnly className="lc-letter" value={letter} rows={Math.min(16, letter.split('\n').length + 1)} aria-label="改证函" />
                </div>
              )}
              <div className="note">审证按 UCP600 常见要求做的离线检查，供参考；最终以银行审单意见为准。</div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
