import { useState } from 'react';
import { LibPage } from './common';
import { confirmAction } from './confirm';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { today, uid } from '../domain/calc';
import { FIELDS, ITEM_FIELDS, ITEM_TOTALS, fieldByKey } from '../domain/tplfields';
import { pickFile, readBytes } from '../io/image';
import { fromB64, toB64 } from '../io/b64';
import type { ExcelTpl, Order, TplFor } from '../domain/types';


export const TPL_FOR: TplFor[] = ['客户', '货代', '工厂', '报关行', '通用'];

/** 模板是否适用于这个订单的某个收件人 */
export function tplMatches(t: ExcelTpl, o: Order, bundle: string): boolean {
  if (t.for !== bundle) return false;
  if (!t.partnerId) return true;
  const id = bundle === '客户' ? o.customerId : bundle === '货代' ? o.partners.forwarder : bundle === '报关行' ? o.partners.broker : bundle === '工厂' ? o.partners.factory : '';
  return id === t.partnerId;
}

/** 生成填好的模板文件 */
export async function buildTplFile(o: Order, t: ExcelTpl) {
  const { fill } = await import('../export/template');
  return { name: `${t.name.replace(/[\\/:*?"<>|]/g, '_')}-${o.no}.xlsx`, data: await fill(fromB64(t.file), t, o) };
}

export async function exportTpl(o: Order, t: ExcelTpl) {
  const ui = useUI.getState();
  if (ui.busy) return;
  ui.set({ busy: true });
  toast(`正在填写「${t.name}」…`, undefined, 60000, 'export');
  try {
    const f = await buildTplFile(o, t);
    const { saveFiles, reveal } = await import('../export/save');
    const { orderFolder } = await import('../export/index');
    const r = await saveFiles(orderFolder(o), [f]);
    if (r.paths[0]) toast(`已保存 ${f.name}`, { label: '打开文件夹', run: () => void reveal(r.paths[0]).catch(() => undefined) }, undefined, 'export');
    else toast(`已保存 ${f.name}（已下载）`, undefined, undefined, 'export');
  } catch (e) {
    console.error(e);
    toast(`模板填写失败：${e instanceof Error ? e.message : String(e)}`, undefined, 8000, 'export');
  } finally {
    useUI.getState().set({ busy: false });
  }
}

const guessFor = (name: string, labels: string): TplFor => {
  const t = (name + ' ' + labels).toLowerCase();
  if (/订舱|托书|booking|shipping instruction|\bsi\b|补料|提单/.test(t)) return '货代';
  if (/报关|申报|customs|declaration/.test(t)) return '报关行';
  if (/采购|工厂|purchase order|生产单/.test(t)) return '工厂';
  return '客户';
};

/** 上传 Excel 模板：识别后打开设置 */
export async function uploadTemplate() {
  const f = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  if (!f) return;
  const data = await readBytes(f);
  if (data[0] !== 0x50 || data[1] !== 0x4b) return toast('只支持 .xlsx 格式；旧的 .xls 请先在 Excel 里「另存为」.xlsx 再上传', undefined, 8000);
  try {
    const { analyze } = await import('../export/template');
    const a = await analyze(data);
    const name = f.name.replace(/\.xlsx$/i, '');
    const draft: ExcelTpl = {
      id: uid(), name, for: guessFor(name, [...a.sheets, ...a.cells.map((c) => c.label)].join(' ')), fileName: f.name, file: toB64(data), created: today(),
      cells: a.cells, tables: a.tables, placeholders: a.placeholders,
    };
    openTplEditor(draft, true, a.sheets);
  } catch (e) {
    console.error(e);
    toast('读取模板失败：' + (e instanceof Error ? e.message : String(e)), undefined, 8000);
  }
}

export function openTplEditor(t: ExcelTpl, isNew: boolean, sheets?: string[]) {
  useUI.getState().openModal({ title: isNew ? '设置新模板' : `设置模板 · ${t.name}`, wide: true, body: <TplEditor init={t} isNew={isNew} sheets={sheets} /> });
}

function TplEditor({ init, isNew, sheets }: { init: ExcelTpl; isNew: boolean; sheets?: string[] }) {
  const { customers, partners, orders, addTemplate, updateTemplate } = useData();
  const close = useUI((s) => s.closeModal);
  const [t, setT] = useState<ExcelTpl>(() => JSON.parse(JSON.stringify(init)));
  const [orderId, setOrderId] = useState(orders[0]?.id ?? '');
  const [add, setAdd] = useState({ sheet: sheets?.[0] ?? t.cells[0]?.sheet ?? t.tables[0]?.sheet ?? 'Sheet1', cell: '', field: FIELDS[0].key });
  const set = (p: Partial<ExcelTpl>) => setT({ ...t, ...p });
  const owners = t.for === '客户' ? customers.map((c) => ({ id: c.id, name: c.name })) : t.for === '通用' ? [] : partners.filter((p) => p.type === t.for).map((p) => ({ id: p.id, name: p.name }));
  const unknown = t.placeholders.filter((p) => !fieldByKey(p) && !/^货物\./.test(p) && !/^合计\./.test(p));
  const fieldSelect = (value: string, onChange: (v: string) => void, label: string) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {[...new Set(FIELDS.map((f) => f.group))].map((g) => (
        <optgroup key={g} label={g}>{FIELDS.filter((f) => f.group === g).map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}</optgroup>
      ))}
    </select>
  );
  const save = () => {
    if (!t.name.trim()) return toast('请填写模板名称');
    if (isNew) addTemplate(t);
    else updateTemplate(t.id, (x) => Object.assign(x, t));
    close();
    toast(isNew ? `已保存模板「${t.name}」：在订单的「单据导出」里使用` : '模板已更新');
  };
  const tryFill = async () => {
    const o = useData.getState().orders.find((x) => x.id === orderId);
    if (o) await exportTpl(o, t);
  };
  const total = t.cells.length + t.tables.reduce((n, x) => n + x.cols.length, 0) + t.placeholders.length;

  return (
    <div className="tpl-ed">
      <div className="tpl-top">
        <label>模板名称<input value={t.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label>用于<select value={t.for} onChange={(e) => set({ for: e.target.value as TplFor, partnerId: undefined })}>{TPL_FOR.map((x) => <option key={x}>{x}</option>)}</select></label>
        {t.for !== '通用' && (
          <label>只给
            <select value={t.partnerId ?? ''} onChange={(e) => set({ partnerId: e.target.value || undefined })}>
              <option value="">所有{t.for}</option>
              {owners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <p className="muted tpl-hint">
        {total ? `共找到 ${total} 处要填的位置。` : '没有自动找到要填的位置。'}
        下面按标签自动对应的字段可以改；不对的点 ✕ 去掉，漏掉的点「＋ 添加位置」。也可以在 Excel 里直接写 {'{{字段名}}'} 占位符。
      </p>

      <div className="tpl-sec">
        <h4>单个字段 <span className="muted">（标签旁边或下面的空格）</span></h4>
        {t.cells.map((c, i) => (
          <div key={i} className="tpl-row">
            <code>{c.sheet}!{c.cell}</code>
            <span className="tpl-label" title={c.label}>{c.label ? `「${c.label}」` : '手动添加'}</span>
            <span className="tpl-arrow">填</span>
            {fieldSelect(c.field, (v) => set({ cells: t.cells.map((x, j) => (j === i ? { ...x, field: v } : x)) }), `${c.cell} 填什么`)}
            <button className="del" aria-label="去掉这个位置" onClick={() => set({ cells: t.cells.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div className="tpl-row add">
          {(sheets?.length ?? 0) > 1 && <select aria-label="工作表" value={add.sheet} onChange={(e) => setAdd({ ...add, sheet: e.target.value })}>{sheets!.map((s) => <option key={s}>{s}</option>)}</select>}
          <input aria-label="单元格" placeholder="单元格，如 B12" value={add.cell} onChange={(e) => setAdd({ ...add, cell: e.target.value.toUpperCase() })} />
          <span className="tpl-arrow">填</span>
          {fieldSelect(add.field, (v) => setAdd({ ...add, field: v }), '新位置填什么')}
          <button className="btn sm" onClick={() => {
            if (!/^[A-Z]{1,3}\d{1,4}$/.test(add.cell)) return toast('单元格写法如 B12');
            set({ cells: [...t.cells, { sheet: add.sheet, cell: add.cell, field: add.field }] });
            setAdd({ ...add, cell: '' });
          }}>＋ 添加位置</button>
        </div>
      </div>

      {t.tables.map((tb, ti) => (
        <div key={ti} className="tpl-sec">
          <h4>货物表 <span className="muted">（{tb.sheet} 第 {tb.header} 行表头，原有 {tb.rows} 个空行{tb.total ? `，合计在第 ${tb.total} 行` : ''}；货物多时自动插入行）</span></h4>
          <div className="tpl-cols">
            {tb.cols.map((c, ci) => (
              <label key={ci} className="tpl-col">
                <span>「{c.label}」</span>
                <select value={c.field} onChange={(e) => set({ tables: t.tables.map((x, j) => (j === ti ? { ...x, cols: x.cols.map((y, k) => (k === ci ? { ...y, field: e.target.value } : y)) } : x)) })}>
                  <option value="">不填</option>
                  <option value="唛头">唛头（写在第一行）</option>
                  {ITEM_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.key}{ITEM_TOTALS[f.key] ? '（合计）' : ''}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button className="btn ghost sm" onClick={() => set({ tables: t.tables.filter((_, j) => j !== ti) })}>这不是货物表，去掉</button>
        </div>
      ))}

      {!!t.placeholders.length && (
        <div className="tpl-sec">
          <h4>文件里的占位符</h4>
          <div className="tpl-ph">{[...new Set(t.placeholders)].map((p) => <code key={p} className={unknown.includes(p) ? 'bad' : ''} title={unknown.includes(p) ? '没有这个字段，填写时会保留原样' : ''}>{`{{${p}}}`}</code>)}</div>
          {!!unknown.length && <p className="tpl-warn">标红的占位符不是软件里的字段名，填写时会原样保留。字段名见「字段清单」。</p>}
        </div>
      )}

      <div className="modal-f tpl-foot">
        <span className="tpl-try">
          用订单试填
          <select aria-label="试填用的订单" value={orderId} onChange={(e) => setOrderId(e.target.value)}>{orders.map((o) => <option key={o.id} value={o.id}>{o.no} {o.name}</option>)}</select>
          <button className="btn sm" disabled={!orderId} onClick={() => void tryFill()}>试填导出</button>
        </span>
        <button className="btn" onClick={close}>取消</button>
        <button className="btn pri" onClick={save}>保存模板</button>
      </div>
    </div>
  );
}

/** 字段清单：点一下复制占位符 */
export function openFieldList() {
  const copy = (s: string) => navigator.clipboard?.writeText(s).then(() => toast(`已复制 ${s}`), () => toast('复制失败，请手动输入'));
  const groups = [...new Set(FIELDS.map((f) => f.group))];
  useUI.getState().openModal({
    title: '字段清单（点一下复制，粘到 Excel 单元格里）', wide: true,
    body: (
      <div className="tpl-fields">
        {groups.map((g) => (
          <div key={g}><h4>{g}</h4><div className="tpl-ph">{FIELDS.filter((f) => f.group === g).map((f) => <button key={f.key} onClick={() => copy(`{{${f.key}}}`)}>{`{{${f.key}}}`}</button>)}</div></div>
        ))}
        <div>
          <h4>货物（写在同一行，这一行会按货物行数自动复制）</h4>
          <div className="tpl-ph">{ITEM_FIELDS.map((f) => <button key={f.key} onClick={() => copy(`{{货物.${f.key}}}`)}>{`{{货物.${f.key}}}`}</button>)}</div>
        </div>
        <div>
          <h4>货物合计</h4>
          <div className="tpl-ph">{Object.keys(ITEM_TOTALS).map((k) => <button key={k} onClick={() => copy(`{{合计.${k}}}`)}>{`{{合计.${k}}}`}</button>)}</div>
        </div>
      </div>
    ),
  });
}

export function TemplatesPage() {
  const { templates = [], customers, partners, deleteTemplate } = useData();
  const ownerName = (t: ExcelTpl) => (t.partnerId ? (t.for === '客户' ? customers : partners).find((x) => x.id === t.partnerId)?.name ?? '（已删除）' : `所有${t.for === '通用' ? '订单' : t.for}`);
  return (
    <LibPage
      title="Excel 模板"
      right={
        <>
          <button className="btn" onClick={async () => {
            const { sampleTemplate } = await import('../export/template');
            const { saveFiles } = await import('../export/save');
            const r = await saveFiles('模板', [{ name: '示例-订舱委托书模板.xlsx', data: await sampleTemplate() }]);
            toast(r.paths[0] ? '示例模板已保存到「文档/外贸超级工作台/模板」' : '示例模板已下载');
          }}>下载示例模板</button>
          <button className="btn" onClick={openFieldList}>字段清单</button>
          <button className="btn pri" onClick={() => void uploadTemplate()}>＋ 上传 Excel 模板</button>
        </>
      }
    >
      <div className="note tpl-intro">
        客户、货代、工厂常有自己的固定表格（订舱单、托书、发票格式…）。把那份空白 Excel 上传，软件会自动找出要填的位置：
        <b>「Shipper」「Port of Loading」「毛重」这类标签旁边或下面的空格</b>，以及<b>货物表头</b>（品名、数量、毛重…，货物多时自动插入行，合计行也会填）。
        识别结果可以逐条确认、修改。也可以在 Excel 里直接写 <code>{'{{买方名称}}'}</code>、<code>{'{{货物.数量}}'}</code> 这样的占位符。
        保存后在订单的「单据导出」里勾选，或绑定给某个客户 / 货代，打包时自动带上。
      </div>
      {templates.length ? (
        <div className="tpl-list">
          {templates.map((t) => (
            <div key={t.id} className="panel tpl-card">
              <div className="tpl-card-h">
                <span className="code">XLSX</span>
                <b>{t.name}</b>
                <span className="pill">{t.for}</span>
              </div>
              <small className="muted">用于：{ownerName(t)} · {t.fileName}</small>
              <small className="muted">识别 {t.cells.length} 个字段位置{t.tables.length ? ` · 货物表 ${t.tables[0].cols.length} 列` : ''}{t.placeholders.length ? ` · 占位符 ${t.placeholders.length} 个` : ''}</small>
              <div className="tpl-card-a">
                <button className="btn sm" onClick={() => openTplEditor(t, false)}>设置</button>
                <button className="btn ghost sm danger-t" onClick={async () => {
                  if (await confirmAction({ title: '删除模板', danger: true, ok: '删除', body: <p>删除模板「{t.name}」？已经导出的文件不受影响。</p> })) { deleteTemplate(t.id); toast('已删除模板 ' + t.name); }
                }}>删除</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel empty">还没有模板。先点「下载示例模板」看看效果，或直接上传客户 / 货代发来的空白 Excel。</div>
      )}
    </LibPage>
  );
}
