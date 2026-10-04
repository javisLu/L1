import { useMemo, useState } from 'react';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { pickFile, readBytes } from '../io/image';
import { ITEM_FIELDS, analyzeItems, buildItems, parsePasted, updateExisting, withHeaderRow, type IK, type ItemSheet } from '../io/items';
import { toNum } from '../domain/calc';
import { prunePacks } from '../domain/packs';
import { PKG_MODES } from '../domain/package';
import type { Order } from '../domain/types';

export type ImportPurpose = 'items' | 'packing' | 'customs';
type Mode = 'append' | 'update' | 'replace';
const TITLES: Record<ImportPurpose, string> = {
  items: '导入货物：粘贴 Excel / 客户 PO',
  packing: '导入装箱资料：粘贴 Excel / 工厂箱单',
  customs: '导入报关资料：粘贴 Excel',
};

/**
 * 打开导入窗口。pasted：在表格里直接 Ctrl+V 的内容；
 * purpose：从哪个步骤打开（箱单、报关资料默认「按型号 / 品名更新现有货物」）
 */
export function openItemImport(order: Order, pasted?: string, purpose: ImportPurpose = 'items') {
  const sheet = pasted ? analyzeItems(parsePasted(pasted)) : null;
  useUI.getState().openModal({ title: TITLES[purpose], wide: true, body: <ItemImport orderId={order.id} initial={sheet} purpose={purpose} /> });
}

const isBlankItem = (o: Order, i: number) => {
  const it = o.items[i];
  return !it.model && !it.nameEn && !it.nameCn && !toNum(it.qty);
};

function ItemImport({ orderId, initial, purpose }: { orderId: string; initial: ItemSheet | null; purpose: ImportPurpose }) {
  const close = useUI((s) => s.closeModal);
  const { products, updateOrder } = useData();
  const order = useData((s) => s.orders.find((o) => o.id === orderId))!;
  const [sheet, setSheet] = useState<ItemSheet | null>(initial);
  const [text, setText] = useState('');
  const [file, setFile] = useState('');
  const [fill, setFill] = useState(true);
  const existing = order.items.filter((_, i) => !isBlankItem(order, i)).length;
  const [mode, setMode] = useState<Mode>(!existing ? 'replace' : purpose === 'items' ? 'append' : 'update');
  const [usePo, setUsePo] = useState(true);
  const [err, setErr] = useState('');

  const result = useMemo(() => (sheet ? buildItems(sheet.rows, sheet.mapping, products, fill, sheet.merged) : null), [sheet, products, fill]);
  const plan = useMemo(() => (sheet && result && mode === 'update' ? updateExisting(order.items, result, sheet.mapping) : null), [sheet, result, mode, order.items]);

  const load = (table: string[][], name: string, merged?: boolean[][]) => {
    if (!table.length) return setErr('没有读到内容');
    setErr('');
    setFile(name);
    const s = analyzeItems(table, merged);
    setSheet(s);
    setUsePo(!!s.po && (!order.numbers.po || order.numbers.po === s.po));
  };
  const chooseFile = async () => {
    const f = await pickFile('.xlsx,.csv,.txt');
    if (!f) return;
    try {
      const { readTableMeta } = await import('../io/table');
      const t = await readTableMeta(f.name, await readBytes(f));
      load(t.rows, f.name, t.merged);
    } catch (e) {
      setErr('读取文件失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };
  const setMap = (ci: number, k: IK | '') =>
    setSheet((s) => s && { ...s, mapping: s.mapping.map((m, i) => (i === ci ? k : m === k && k ? '' : m)) });

  const doImport = () => {
    if (!result?.items.length) return;
    const before = { items: order.items, po: order.numbers.po };
    const po = usePo && sheet?.po ? sheet.po : null;
    const beforePacks = order.packs ?? [];
    const beforePkg = order.pkg;
    const beforeType = order.customs.packageType;
    updateOrder(orderId, (o) => {
      if (mode === 'replace') { o.items = result.items; o.packs = result.packs; }
      else {
        if (mode === 'update' && plan) o.items = plan.items;
        else {
          // 去掉末尾的空行再追加
          while (o.items.length && isBlankItem(o, o.items.length - 1)) o.items.pop();
          o.items.push(...result.items);
        }
        o.packs = [...(o.packs ?? []), ...result.packs];
      }
      prunePacks(o);
      if (result.pkg) { o.pkg = result.pkg; o.customs.packageType = PKG_MODES[result.pkg.mode].customs; }
      if (po) o.numbers.po = po;
    });
    close();
    const what = mode === 'update' && plan ? `已更新 ${plan.updated} 行${plan.added ? `、新增 ${plan.added} 行` : ''}货物` : `已导入 ${result.items.length} 行货物`;
    toast(`${what}${result.matched ? `，${result.matched} 行按产品库补全了资料` : ''}${po ? `，PO 号 ${po}` : ''}`, {
      label: '撤销',
      run: () => {
        updateOrder(orderId, (o) => { o.items = before.items; o.packs = beforePacks; o.pkg = beforePkg; o.customs.packageType = beforeType; o.numbers.po = before.po; });
        toast('已撤销导入');
      },
    });
  };

  if (!sheet) {
    return (
      <>
        <p className="imp-lead">在 Excel 里选中要导入的行（可以连表头一起），<b>复制后粘贴到下面</b>；也可以直接选择客户的 PO 文件。软件会自动识别型号、品名、数量、单价等列。</p>
        <textarea
          className="imp-paste"
          id="imp-paste"
          rows={9}
          placeholder={'例如：\nItem No.\tDescription\tQty\tUnit Price\nAL-S200\tAluminium Display Rack\t100\t12.50'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t.includes('\t') || t.includes('\n')) {
              e.preventDefault();
              load(parsePasted(t), '粘贴的内容');
            }
          }}
        />
        {err && <div className="imp-err">{err}</div>}
        <div className="modal-f" style={{ margin: '12px -20px -16px', justifyContent: 'space-between' }}>
          <button className="btn" onClick={chooseFile}>选择 Excel / CSV 文件</button>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={close}>取消</button>
            <button className="btn pri" disabled={!text.trim()} onClick={() => load(parsePasted(text), '粘贴的内容')}>识别</button>
          </span>
        </div>
      </>
    );
  }

  const preview = sheet.rows.slice(0, 6);
  const mapped = new Set(sheet.mapping.filter(Boolean));
  const noKey = !mapped.has('model') && !mapped.has('nameEn') && !mapped.has('nameCn');
  return (
    <>
      <div className="imp-top">
        <span>来源：{file}</span>
        <label className="chk-inline">
          <input type="checkbox" checked={sheet.headerRow >= 0} onChange={(e) => {
              if (!e.target.checked) return setSheet(withHeaderRow(sheet, -1));
              const again = analyzeItems(sheet.table, sheet.tableMerged);
              setSheet(again.headerRow >= 0 ? again : withHeaderRow(sheet, 0));
            }} />
          第一行是表头
        </label>
        <button className="btn ghost sm" onClick={() => { setSheet(null); setFile(''); }}>重新粘贴</button>
      </div>
      <div className="eyebrow" style={{ margin: '10px 0 2px' }}>每一列对应的内容（识别不对可以改）</div>
      <p className="imp-help">每列上方的下拉框表示这一列在软件里是什么：蓝色是会导入的列，选「不导入」就忽略这一列（比如序号、唛头、备注），灰色的列不会导入。净重、毛重分「每箱」和「合计」两种，按你表里的写法选。</p>
      <div className="tbl-wrap imp-map">
        <table className="tbl">
          <thead>
            <tr>
              {sheet.header.map((h, ci) => (
                <th key={ci}>
                  <div className="imp-h">{h}</div>
                  <select aria-label={`第 ${ci + 1} 列对应`} value={sheet.mapping[ci] ?? ''} onChange={(e) => setMap(ci, e.target.value as IK | '')} className={sheet.mapping[ci] ? 'on' : ''}>
                    <option value="">不导入</option>
                    {ITEM_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((r, ri) => (
              <tr key={ri}>{sheet.header.map((_, ci) => <td key={ci} className={sheet.mapping[ci] ? '' : 'off'}>{r[ci] ?? ''}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.rows.length > preview.length && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>…… 共 {sheet.rows.length} 行</div>}

      <div className="imp-opts">
        <label className="chk-inline"><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} />按型号从产品库补全 HS、中文品名、箱规、重量等（文件里已有的不覆盖）</label>
        {!!sheet.po && (
          <label className="chk-inline">
            <input type="checkbox" checked={usePo} onChange={(e) => setUsePo(e.target.checked)} />
            把客户 PO 号 <b>{sheet.po}</b> 填入订单{order.numbers.po && order.numbers.po !== sheet.po ? `（现在是 ${order.numbers.po}）` : ''}
          </label>
        )}
        {existing > 0 && (
          <div className="imp-modes" role="radiogroup" aria-label="导入方式">
            {([
              ['append', `加到现有 ${existing} 行货物后面`, '文件里的货物作为新的行加在最后'],
              ['update', '按型号 / 品名更新现有货物', '找到同型号（没有型号时按品名）的货物，只更新文件里有的列（如箱数、净毛重）；找不到的加在最后。适合工厂箱单补装箱资料'],
              ['replace', '替换全部货物', `删掉现有 ${existing} 行，换成文件里的货物`],
            ] as const).map(([k, t, d]) => (
              <label key={k} className={'imp-mode-opt' + (mode === k ? ' on' : '')}>
                <input type="radio" name="imp-mode" checked={mode === k} onChange={() => setMode(k)} />
                <span><b>{t}</b><small>{d}</small></span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="imp-sum">
        {noKey ? (
          <span style={{ color: 'var(--warn)' }}>请至少指定「型号」或「品名」列</span>
        ) : (
          <>
            {plan ? <>将更新 <b>{plan.updated}</b> 行{plan.added ? <>、新增 <b>{plan.added}</b> 行</> : null}</> : <>将导入 <b>{result?.items.length ?? 0}</b> 行</>}
            {fill && result?.matched ? <>，其中 <b>{result.matched}</b> 行在产品库找到</> : null}
            {result?.skipped ? <span className="muted">（已跳过 {result.skipped} 行没有数字的说明文字，如表格下方的 MARKS、Country of Origin）</span> : null}
          </>
        )}
      </div>
      {!noKey && result?.notes.map((n) => <div key={n} className="imp-note">· {n}</div>)}
      {!noKey && result?.errors.slice(0, 4).map((e) => <div key={e} className="imp-err">· {e}（导入后可在表格里补上）</div>)}
      {!noKey && (result?.errors.length ?? 0) > 4 && <div className="imp-err">…… 还有 {result!.errors.length - 4} 条</div>}

      <div className="modal-f" style={{ margin: '12px -20px -16px' }}>
        <button className="btn" onClick={close}>取消</button>
        <button className="btn pri" disabled={noKey || !result?.items.length} onClick={doImport}>{plan ? `更新 ${plan.updated + plan.added} 行` : `导入 ${result?.items.length ?? 0} 行`}</button>
      </div>
    </>
  );
}
