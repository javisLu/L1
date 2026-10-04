import { useMemo, useState } from 'react';
import { useData } from '../store/data';
import { toast, useUI } from '../store/ui';
import { pickFile, readBytes } from '../io/image';
import { ITEM_FIELDS, analyzeItems, buildItems, parsePasted, withHeaderRow, type IK, type ItemSheet } from '../io/items';
import { toNum } from '../domain/calc';
import type { Order } from '../domain/types';

/** 打开「导入货物」：可传入已粘贴的文字（在货物表格里直接 Ctrl+V 多行时） */
export function openItemImport(order: Order, pasted?: string) {
  const sheet = pasted ? analyzeItems(parsePasted(pasted)) : null;
  useUI.getState().openModal({ title: '导入货物：粘贴 Excel / 客户 PO', wide: true, body: <ItemImport orderId={order.id} initial={sheet} /> });
}

const isBlankItem = (o: Order, i: number) => {
  const it = o.items[i];
  return !it.model && !it.nameEn && !it.nameCn && !toNum(it.qty);
};

function ItemImport({ orderId, initial }: { orderId: string; initial: ItemSheet | null }) {
  const close = useUI((s) => s.closeModal);
  const { products, updateOrder } = useData();
  const order = useData((s) => s.orders.find((o) => o.id === orderId))!;
  const [sheet, setSheet] = useState<ItemSheet | null>(initial);
  const [text, setText] = useState('');
  const [file, setFile] = useState('');
  const [fill, setFill] = useState(true);
  const existing = order.items.filter((_, i) => !isBlankItem(order, i)).length;
  const [mode, setMode] = useState<'append' | 'replace'>(existing ? 'append' : 'replace');
  const [usePo, setUsePo] = useState(true);
  const [err, setErr] = useState('');

  const result = useMemo(() => (sheet ? buildItems(sheet.rows, sheet.mapping, products, fill) : null), [sheet, products, fill]);

  const load = (table: string[][], name: string) => {
    if (!table.length) return setErr('没有读到内容');
    setErr('');
    setFile(name);
    const s = analyzeItems(table);
    setSheet(s);
    setUsePo(!!s.po && (!order.numbers.po || order.numbers.po === s.po));
  };
  const chooseFile = async () => {
    const f = await pickFile('.xlsx,.csv,.txt');
    if (!f) return;
    try {
      const { readTable } = await import('../io/table');
      load(await readTable(f.name, await readBytes(f)), f.name);
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
    updateOrder(orderId, (o) => {
      if (mode === 'replace') o.items = result.items;
      else {
        // 去掉末尾的空行再追加
        while (o.items.length && isBlankItem(o, o.items.length - 1)) o.items.pop();
        o.items.push(...result.items);
      }
      if (po) o.numbers.po = po;
    });
    close();
    toast(`已导入 ${result.items.length} 行货物${result.matched ? `，${result.matched} 行按产品库补全了资料` : ''}${po ? `，PO 号 ${po}` : ''}`, {
      label: '撤销',
      run: () => {
        updateOrder(orderId, (o) => { o.items = before.items; o.numbers.po = before.po; });
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
              const again = analyzeItems(sheet.table);
              setSheet(again.headerRow >= 0 ? again : withHeaderRow(sheet, 0));
            }} />
          第一行是表头
        </label>
        <button className="btn ghost sm" onClick={() => { setSheet(null); setFile(''); }}>重新粘贴</button>
      </div>
      <div className="eyebrow" style={{ margin: '10px 0 6px' }}>每一列对应的内容（识别不对可以改）</div>
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
          <div className="imp-mode">
            <label className="chk-inline"><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} />加到现有 {existing} 行货物后面</label>
            <label className="chk-inline"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} />替换现有货物</label>
          </div>
        )}
      </div>

      <div className="imp-sum">
        {noKey ? (
          <span style={{ color: 'var(--warn)' }}>请至少指定「型号」或「品名」列</span>
        ) : (
          <>将导入 <b>{result?.items.length ?? 0}</b> 行{fill && result?.matched ? <>，其中 <b>{result.matched}</b> 行在产品库找到</> : null}</>
        )}
      </div>
      {!noKey && result?.errors.slice(0, 4).map((e) => <div key={e} className="imp-err">· {e}（导入后可在表格里补上）</div>)}
      {!noKey && (result?.errors.length ?? 0) > 4 && <div className="imp-err">…… 还有 {result!.errors.length - 4} 条</div>}

      <div className="modal-f" style={{ margin: '12px -20px -16px' }}>
        <button className="btn" onClick={close}>取消</button>
        <button className="btn pri" disabled={noKey || !result?.items.length} onClick={doImport}>导入 {result?.items.length ?? 0} 行</button>
      </div>
    </>
  );
}
