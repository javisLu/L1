import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { analyze, fill, sampleTemplate } from './template';
import { seed } from '../domain/seed';
import { emptyItem } from '../domain/factory';

const load = async (u8: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(u8 as unknown as ArrayBuffer);
  return wb;
};
const save = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer());
const txt = (wb: ExcelJS.Workbook, a: string, sheet?: string) => {
  const c = (sheet ? wb.getWorksheet(sheet)! : wb.worksheets[0]).getCell(a);
  return String(c.value ?? '');
};

describe('Excel 模板：自动识别', () => {
  it('示例模板：标签右边的空格、货物表头、合计行', async () => {
    const a = await analyze(await sampleTemplate());
    const by = Object.fromEntries(a.cells.map((c) => [c.label, `${c.cell}=${c.field}`]));
    expect(by['Shipper']).toBe('B3=发货人');
    expect(by['Consignee']).toBe('E3=收货人');
    expect(by['Notify Party']).toBe('B4=通知人');
    expect(by['Port of Loading']).toBe('E4=装运港');
    expect(by['Port of Discharge']).toBe('B5=目的港');
    expect(by['Vessel / Voyage']).toBe('E5=船名航次');
    expect(by['Container Type']).toBe('B6=柜型柜量');
    expect(by['Freight']).toBe('B7=运费条款');
    expect(by['Invoice No.']).toBe('B8=发票号');
    expect(by['PO No.']).toBe('E8=PO号');
    expect(a.tables).toHaveLength(1);
    const t = a.tables[0];
    expect(t).toMatchObject({ header: 10, first: 11, rows: 3, total: 14 });
    expect(t.cols.map((c) => c.field)).toEqual(['唛头', '品名', '数量', '箱数', '毛重', '净重', '体积']);
    expect(a.placeholders).toEqual(['订舱要求', '今天']);
    // 「Date:」右边已经有 {{今天}}，不再另找位置
    expect(a.cells.some((c) => c.label === 'Date')).toBe(false);
  });

  it('货代格式：合并单元格的大框、标签在上值在下、中文标签', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('托书');
    ws.mergeCells('A1:C1'); ws.getCell('A1').value = '托运人 Shipper';
    ws.mergeCells('A2:C4');
    ws.mergeCells('D1:F1'); ws.getCell('D1').value = '订舱号';
    ws.getCell('A5').value = '收货人 Consignee'; ws.mergeCells('A6:C7');
    ws.getCell('D5').value = '起运港'; ws.getCell('E5').value = '';
    ws.getCell('D6').value = '目的港：';
    ws.getCell('D7').value = '毛重(KGS)';
    ws.getCell('A9').value = '品名'; ws.getCell('B9').value = '件数'; ws.getCell('C9').value = '毛重'; ws.getCell('D9').value = '体积';
    const a = await analyze(await save(wb));
    const by = Object.fromEntries(a.cells.map((c) => [c.field, c.cell]));
    expect(by['发货人']).toBe('A2');
    expect(by['收货人']).toBe('A6');
    expect(by['装运港']).toBe('E5');
    expect(by['目的港']).toBe('E6');
    expect(by['总毛重']).toBe('E7');
    expect(a.tables[0].cols.map((c) => c.field)).toEqual(['品名', '箱数', '毛重', '体积']);
  });
});

describe('Excel 模板：填写', () => {
  it('示例模板填好：单个字段、货物行、合计、占位符；货物多于空行时插入行，下面的内容和合并单元格跟着下移', async () => {
    const o = seed().orders[1];
    for (let i = 0; i < 3; i++) o.items.push({ ...emptyItem(), id: 'x' + i, model: 'X' + i, nameEn: 'Extra ' + i, qty: 10, unit: 'PCS', price: 1, pcsPerCtn: 10, gw: 5, nw: 4, l: 10, w: 10, h: 10 });
    const tpl = await sampleTemplate();
    const a = await analyze(tpl);
    const wb = await load(await fill(tpl, a, o));
    expect(txt(wb, 'B3')).toContain('Qingdao Hengyuan');
    expect(txt(wb, 'E3')).toContain('ABC Trading LLC');
    expect(txt(wb, 'E4')).toBe('Qingdao, China');
    expect(txt(wb, 'B7')).toBe('FREIGHT PREPAID');
    expect(txt(wb, 'E8')).toBe('ABC-2026-118');
    // 5 行货物，原有 3 个空行 → 插入 2 行
    expect(txt(wb, 'B11')).toBe('Aluminium Display Rack - Heavy Duty');
    expect(txt(wb, 'B15')).toBe('Extra 2');
    expect(txt(wb, 'A11')).toContain('ABC');
    expect(txt(wb, 'A16')).toBe('TOTAL');
    expect(Number(txt(wb, 'C16'))).toBe(390);
    expect(Number(txt(wb, 'D16'))).toBe(213);
    expect(txt(wb, 'B18')).toBe(o.shipping.bookingNote ?? '');
    expect(txt(wb, 'B19')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 合并单元格：E3:G3 之类没被破坏
    expect(wb.worksheets[0].getCell('F3').master.address).toBe('E3');
  });

  it('占位符模板：{{货物.xx}} 那一行按货物复制，{{合计.xx}}、混合文字', async () => {
    const o = seed().orders[1];
    const wb0 = new ExcelJS.Workbook();
    const ws = wb0.addWorksheet('PL');
    ws.getCell('A1').value = 'Invoice: {{发票号}} / PO {{PO号}}';
    ws.getCell('A3').value = '{{货物.序号}}'; ws.getCell('B3').value = '{{货物.品名}}'; ws.getCell('C3').value = '{{货物.数量}}'; ws.getCell('D3').value = '{{货物.毛重}}';
    ws.mergeCells('E3:F3'); ws.getCell('E3').value = '{{货物.型号}}';
    ws.getCell('A4').value = 'TOTAL'; ws.getCell('C4').value = '{{合计.数量}}'; ws.getCell('D4').value = '{{总毛重}}';
    ws.mergeCells('A6:D6'); ws.getCell('A6').value = '{{件数大写}}';
    const wb = await load(await fill(await save(wb0), { cells: [], tables: [] }, o));
    const s = wb.worksheets[0];
    expect(txt(wb, 'A1')).toBe('Invoice: CI-2026-002 / PO ABC-2026-118');
    expect(s.getCell('A3').value).toBe(1);
    expect(s.getCell('A4').value).toBe(2);
    expect(txt(wb, 'B4')).toBe('Aluminium Display Rack - Standard');
    expect(s.getCell('C4').value).toBe(300);
    expect(txt(wb, 'E4')).toBe('AL-S200');
    expect(s.getCell('F4').master.address).toBe('E4');
    expect(txt(wb, 'A5')).toBe('TOTAL');
    expect(s.getCell('C5').value).toBe(360);
    expect(s.getCell('D5').value).toBe(4260);
    expect(txt(wb, 'A7')).toContain('SAY TOTAL');
    expect(s.getCell('B7').master.address).toBe('A7');
  });

  it('空白货物行从没编辑过、货物比空行多时也能插入', async () => {
    const o = seed().orders[0];
    const wb0 = new ExcelJS.Workbook();
    const ws = wb0.addWorksheet('Booking');
    ws.getCell('A1').value = 'Shipper:';
    ['Description', 'Quantity', 'G.W.', 'CBM'].forEach((h, i) => (ws.getCell(5, i + 1).value = h));
    ws.getCell('A8').value = 'TOTAL';
    const u8 = await save(wb0);
    const a = await analyze(u8);
    expect(a.tables[0]).toMatchObject({ first: 6, rows: 2, total: 8 });
    const wb = await load(await fill(u8, a, o));
    expect(txt(wb, 'A8')).toBe(o.items[2].nameEn);
    expect(txt(wb, 'A9')).toBe('TOTAL');
    expect(Number(txt(wb, 'B9'))).toBe(320);
  });
});
