import { OrderCrumbs, TopBar } from '../components/common';
import { Preview } from '../components/Preview';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { calc, fixed, money } from '../domain/calc';
import { BUNDLES, DOCNAMES, DOC_FMT, EXPDOCS, EXT, docFile, type Bundle, type DocKey, type ExpKey, type Fmt } from '../modules/defs';
import type { Order } from '../domain/types';

const isDoc = (k: ExpKey): k is DocKey => k in DOC_FMT;

function mailText(o: Order, bundle: Bundle, sel: ExpKey[], partnerContact?: string) {
  const k = calc(o.items);
  const names = sel.map((d) => EXPDOCS.find((x) => x.key === d)?.name).filter(Boolean);
  if (bundle === '客户') {
    const first = (o.buyer.contact || 'Sir/Madam').split(' ')[0];
    return `Dear ${first},\n\nPlease find attached the documents for order ${o.numbers.po || o.no}:\n${names.map((x) => '- ' + x).join('\n')}\n\nTotal amount: ${o.terms.currency} ${money(k.amount)} (${o.terms.incoterm} ${o.terms.place})\nPayment: ${o.terms.paymentText}\nPacking: ${k.ctns} cartons, G.W. ${fixed(k.gw, 2)} kg, ${fixed(k.cbm, 2)} CBM\n\nPlease check and confirm at your earliest convenience.\n\nBest regards,\n${o.seller.name}`;
  }
  const tail = bundle === '报关行' ? '请安排申报，有问题随时联系，谢谢！' : bundle === '货代' ? '请安排订舱，确认船期后回传提单草稿，谢谢！' : '请按唛头和包装要求安排生产包装，谢谢！';
  return `${partnerContact ?? '您'}您好：\n\n附件是订单 ${o.no}（${o.buyer.name}）的资料，请查收：\n${names.map((x) => '· ' + x).join('\n')}\n\n共 ${k.ctns} 箱，毛重 ${fixed(k.gw, 2)} KG，体积 ${fixed(k.cbm, 2)} CBM，${o.terms.pol} → ${o.terms.pod || '—'}。\n${tail}\n\n${o.seller.nameCn || o.seller.name}`;
}

export function ExportCenter({ order: o }: { order: Order }) {
  const ui = useUI();
  const partners = useData((s) => s.partners);
  const avail = EXPDOCS.filter((d) => !d.ph).map((d) => d.key);
  const sel = ui.expSel ?? BUNDLES[ui.bundle].filter((d) => avail.includes(d));
  const focus: DocKey = ui.expDoc ?? (sel.find(isDoc) || 'pi');
  const fmts = (d: DocKey): Fmt[] => {
    const f = DOC_FMT[d];
    if (ui.expFmt === 'pdf') return ['PDF'];
    if (ui.expFmt === 'edit') {
      const e = f.filter((x) => x !== 'PDF');
      return e.length ? e : ['PDF'];
    }
    return f;
  };
  const pid = o.partners[ui.bundle === '报关行' ? 'broker' : ui.bundle === '货代' ? 'forwarder' : 'factory'];
  const mail = mailText(o, ui.bundle, sel, partners.find((p) => p.id === pid)?.contact);

  return (
    <>
      <TopBar><OrderCrumbs order={o} current="单据导出" /></TopBar>
      <div className="mod-head">
        <button className="btn ghost sm" onClick={() => ui.openOrder(o.id)}>← 订单菜单</button>
        <h1><span className="code">ZIP</span>单据导出</h1>
        <span className="ord">{o.no} · {o.buyer.name}</span>
      </div>
      <div className="exp">
        <section className="exp-l">
          <div className="eyebrow" style={{ marginBottom: 8 }}>发给谁</div>
          <div className="seg">
            {(Object.keys(BUNDLES) as Bundle[]).map((b) => (
              <button key={b} className={ui.bundle === b ? 'on' : ''} onClick={() => ui.set({ bundle: b, expSel: null, expDoc: null })}>{b}</button>
            ))}
          </div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>包含单据</div>
          <div className="dl">
            {EXPDOCS.map((d) => (
              <label key={d.key} className={focus === d.key ? 'foc' : ''}>
                <input
                  type="checkbox"
                  disabled={!!d.ph}
                  checked={sel.includes(d.key)}
                  onChange={(e) => ui.set({ expSel: e.target.checked ? [...sel, d.key] : sel.filter((x) => x !== d.key), ...(e.target.checked && isDoc(d.key) ? { expDoc: d.key } : {}) })}
                />
                {d.name}
                {d.ph ? <span className="ph">{d.ph} 开发</span> : (
                  <>
                    <span className="fmt">{fmts(d.key as DocKey).join(' + ')}</span>
                    <button className="eye" onClick={(e) => { e.preventDefault(); ui.set({ expDoc: d.key as DocKey }); }}>预览</button>
                  </>
                )}
              </label>
            ))}
          </div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>格式</div>
          <div className="seg" style={{ marginBottom: 6 }}>
            {([['pdf', '仅 PDF'], ['edit', '可编辑格式'], ['both', 'PDF + 可编辑']] as const).map(([k, l]) => (
              <button key={k} className={ui.expFmt === k ? 'on' : ''} onClick={() => ui.set({ expFmt: k })}>{l}</button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>可编辑格式：发票、箱单、报关资料、报价单 → Excel；合同 → Word；唛头只出 PDF</div>
          <button
            className="btn pri"
            style={{ width: '100%', justifyContent: 'center', marginBottom: 18 }}
            onClick={() => {
              const files = sel.filter(isDoc).flatMap((d) => fmts(d).map((f) => `${docFile(o, d)}.${EXT[f]}`));
              toast(`将生成 ${o.name}_${ui.bundle}.zip，含 ${files.length} 个文件：${files.join('、')}（打包导出在 M1-2 接入）`);
            }}
          >
            生成并打包（{sel.length} 份单据）
          </button>
          <div className="eyebrow" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
            邮件正文
            <button
              className="btn ghost sm"
              onClick={() => navigator.clipboard?.writeText(mail).then(() => toast('邮件正文已复制'), () => toast('复制失败，请手动选中复制'))}
            >
              复制
            </button>
          </div>
          <textarea className="mail" readOnly value={mail} aria-label="邮件正文" />
        </section>
        <Preview order={o} doc={focus} bar={<><span className="tab on">{DOCNAMES[focus]}</span><div className="r"><span className="tip">预览</span></div></>} />
      </div>
    </>
  );
}
