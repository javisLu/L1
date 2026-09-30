import { useState } from 'react';
import { useData, type ImportMode } from '../store/data';
import { toast, useUI } from '../store/ui';
import { pickFile, readBytes } from '../io/image';
import type { MapResult } from '../io/library';
import type { Customer, Product } from '../domain/types';

type Kind = 'products' | 'customers';
const NAMES: Record<Kind, { what: string; key: string }> = {
  products: { what: '产品', key: '型号' },
  customers: { what: '客户', key: '公司名称' },
};

function Preview({ kind, result, file }: { kind: Kind; result: MapResult<Product | Customer>; file: string }) {
  const close = useUI((s) => s.closeModal);
  const [mode, setMode] = useState<ImportMode>('overwrite');
  const n = NAMES[kind];
  const ok = result.rows.length > 0;
  return (
    <>
      <div style={{ fontSize: 13.5 }}>文件：{file}</div>
      <div className="eyebrow" style={{ marginTop: 12 }}>识别到的列</div>
      <div className="imp-cols">{result.columns.length ? result.columns.map((c) => <span key={c}>{c}</span>) : <em className="muted">没有识别到</em>}</div>
      <div style={{ fontSize: 14, marginBottom: 8 }}>
        可导入 <b>{result.rows.length}</b> 个{n.what}
        {result.errors.length > 0 && <>，<span style={{ color: 'var(--warn)' }}>{result.errors.length} 行有问题</span></>}
      </div>
      {result.errors.slice(0, 5).map((e) => <div key={e} className="imp-err">· {e}</div>)}
      {result.errors.length > 5 && <div className="imp-err">…… 还有 {result.errors.length - 5} 条</div>}
      {ok && (
        <>
          <div className="eyebrow" style={{ marginTop: 12, marginBottom: 6 }}>{n.key}已存在时</div>
          <label className="opt"><input type="radio" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} /><span><b>用文件里的内容更新</b><small>只更新文件里有的列（如只有价格列就只改价格），其他资料保持不变</small></span></label>
          <label className="opt"><input type="radio" checked={mode === 'skip'} onChange={() => setMode('skip')} /><span><b>跳过，保留现有内容</b><small>只新增文件里的新{n.what}</small></span></label>
        </>
      )}
      <div className="modal-f" style={{ margin: '12px -20px -16px' }}>
        <button className="btn" onClick={close}>取消</button>
        <button
          className="btn pri"
          disabled={!ok}
          onClick={() => {
            const st = useData.getState();
            const r = kind === 'products' ? st.importProducts(result.rows as Product[], mode, result.fields) : st.importCustomers(result.rows as Customer[], mode, result.fields);
            close();
            toast(`导入完成：新增 ${r.added} 个，更新 ${r.updated} 个，跳过 ${r.skipped} 个`);
          }}
        >
          导入
        </button>
      </div>
    </>
  );
}

/** 选择 Excel / CSV 文件 → 识别表头 → 预览 → 确认导入 */
export async function startImport(kind: Kind) {
  const f = await pickFile('.xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv');
  if (!f) return;
  try {
    const [{ readTable }, lib] = await Promise.all([import('../io/table'), import('../io/library')]);
    const table = await readTable(f.name, await readBytes(f));
    const result = kind === 'products' ? lib.mapProducts(table) : lib.mapCustomers(table);
    useUI.getState().openModal({ title: `导入${NAMES[kind].what}`, body: <Preview kind={kind} result={result} file={f.name} /> });
  } catch (e) {
    toast('读取文件失败：' + (e instanceof Error ? e.message : String(e)), undefined, 8000);
  }
}

/** 导出资料库或模板为 Excel，保存到「文档/外贸超级工作台/资料库/」 */
export async function exportLibrary(kind: Kind, template = false) {
  try {
    const lib = await import('../io/library');
    const { saveFiles, reveal } = await import('../export/save');
    const st = useData.getState();
    const data = kind === 'products'
      ? await (template ? lib.productTemplate() : lib.productsToXlsx(st.products))
      : await (template ? lib.customerTemplate() : lib.customersToXlsx(st.customers));
    const d = new Date();
    const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const name = template ? `${NAMES[kind].what}导入模板.xlsx` : `${NAMES[kind].what}库-${date}.xlsx`;
    const r = await saveFiles('资料库', [{ name, data }]);
    const p = r.paths[0];
    if (p) toast('已保存 ' + name, { label: '打开文件夹', run: () => void reveal(p) });
    else toast('已下载 ' + name);
  } catch (e) {
    toast('导出失败：' + (e instanceof Error ? e.message : String(e)));
  }
}
