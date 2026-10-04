import ExcelJS from 'exceljs';

/** 解码文本文件：先按 UTF-8 严格解码，失败则按 GB18030（兼容 GBK，Excel 另存的中文 CSV 常用） */
export function decodeText(bytes: Uint8Array): string {
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    return new TextDecoder('gb18030').decode(body);
  }
}

/** RFC 4180 CSV 解析：支持引号、引号内逗号与换行、"" 转义；自动识别逗号 / 分号 / 制表符分隔 */
export function parseCsv(text: string, forceSep?: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = forceSep ?? [',', ';', '\t'].map((c) => [c, firstLine.split(c).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ('result' in v) return cellText((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return String((v as ExcelJS.CellHyperlinkValue).text);
    return '';
  }
  return String(v);
}

/** 读取 .xlsx 第一个工作表为二维文本数组 */
export async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const out: string[] = [];
    for (let c = 1; c <= r.cellCount; c++) out.push(cellText(r.getCell(c).value).trim());
    rows.push(out);
  });
  return rows.filter((r) => r.some((c) => c !== ''));
}

export async function readTable(name: string, bytes: Uint8Array): Promise<string[][]> {
  if (/\.xlsx$/i.test(name)) return parseXlsx(bytes);
  if (/\.xls$/i.test(name)) throw new Error('暂不支持旧版 .xls，请在 Excel 里另存为 .xlsx 或 .csv');
  return parseCsv(decodeText(bytes));
}

export interface FieldSpec<K extends string> { key: K; label: string; aliases: string[]; required?: boolean }

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-/()（）:：.。*]/g, '');

/**
 * 在前 15 行里找表头行（命中字段最多的一行），返回列 → 字段映射。
 * 先找完全一致的列名，再按前缀匹配（如「Unit Price (USD)」→ 单价、「Amount USD」→ 金额），前缀取最长的别名。
 */
export function detectHeader<K extends string>(table: string[][], fields: FieldSpec<K>[]) {
  let best = { row: -1, map: new Map<number, K>() };
  table.slice(0, 15).forEach((cells, ri) => {
    const map = new Map<number, K>();
    const used = new Set<K>();
    const names = cells.map(norm);
    names.forEach((n, ci) => {
      if (!n) return;
      const f = fields.find((x) => !used.has(x.key) && x.aliases.some((a) => norm(a) === n));
      if (f) { map.set(ci, f.key); used.add(f.key); }
    });
    names.forEach((n, ci) => {
      if (!n || map.has(ci) || n.length > 30) return;
      let hit: { key: K; len: number } | null = null;
      for (const f of fields) {
        if (used.has(f.key)) continue;
        for (const a of f.aliases.map(norm)) {
          const enough = /[^\x00-\x7f]/.test(a) ? a.length >= 2 : a.length >= 3;
          if (enough && n.startsWith(a) && (!hit || a.length > hit.len)) hit = { key: f.key, len: a.length };
        }
      }
      if (hit) { map.set(ci, hit.key); used.add(hit.key); }
    });
    if (map.size > best.map.size) best = { row: ri, map };
  });
  return best;
}

export const toNumber = (s: string) => {
  const n = parseFloat(String(s ?? '').replace(/[,，\s]/g, '').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** 「60x40x30」「60*40*30 cm」「60×40×30」→ [60, 40, 30] */
export function parseDims(s: string): [number, number, number] | null {
  const m = String(s ?? '').match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
