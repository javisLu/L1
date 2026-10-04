import { describe, expect, it } from 'vitest';
import { analyzeItems, buildItems, findPo, parsePasted, updateExisting, withHeaderRow } from './items';
import { seed } from '../domain/seed';

const products = seed().products;

describe('导入货物', () => {
  it('从 Excel 粘贴（制表符）：认表头、跳过合计行、带单位的数量', () => {
    const text = 'Item No.\tDescription\tQty\tUnit Price (USD)\tAmount\r\nAL-S200\tRack Standard\t1,200 SETS\t12.5\t15000\r\nAL-H500\t"Heavy Duty\nRack"\t20\t89\t1780\r\n\tTOTAL\t1220\t\t16780\r\n';
    const s = analyzeItems(parsePasted(text));
    expect(s.headerRow).toBe(0);
    expect(s.mapping).toEqual(['model', 'nameEn', 'qty', 'price', 'amount']);
    const r = buildItems(s.rows, s.mapping, [], false);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ model: 'AL-S200', qty: 1200, unit: 'SETS', price: 12.5 });
    expect(r.items[1].nameEn).toBe('Heavy Duty\nRack');
    expect(r.errors).toEqual([]);
  });

  it('PO 抬头区找 PO 号，表头不在第一行', () => {
    const table = [
      ['PURCHASE ORDER'], ['Buyer:', 'Global Ventures'], ['PO No.:', 'GV-PO-8899'], ['Date', '2026-10-01'], [],
      ['No.', 'Model', 'Product Name', 'Quantity', 'Price'], ['1', 'AC-01', 'Accessory Kit', '300', '3.2'],
    ].filter((r) => r.length);
    const s = analyzeItems(table);
    expect(s.po).toBe('GV-PO-8899');
    expect(s.rows).toHaveLength(1);
    expect(findPo([['P.O. Number: 4500123456']])).toBe('4500123456');
    expect(findPo([['订单号：', 'HY-2026-77']])).toBe('HY-2026-77');
  });

  it('只有金额时反算单价；只有箱数时算每箱装', () => {
    const s = analyzeItems([['型号', '数量', '金额', '箱数'], ['X1', '100', '250', '10']]);
    const it0 = buildItems(s.rows, s.mapping).items[0];
    expect(it0.price).toBe(2.5);
    expect(it0.pcsPerCtn).toBe(10);
  });

  it('按型号从产品库补全，文件里已有的不覆盖', () => {
    const s = analyzeItems([['Model', 'Qty', 'Unit Price'], ['al-s200', '50', '11'], ['NEW-1', '5', '1']]);
    const r = buildItems(s.rows, s.mapping, products, true);
    expect(r.matched).toBe(1);
    expect(r.items[0]).toMatchObject({ price: 11, hs: '9403200000', pcsPerCtn: 2, gw: 16 });
    expect(r.items[0].nameCn).toContain('铝合金');
    expect(r.items[1].hs).toBe('');
    const off = buildItems(s.rows, s.mapping, products, false);
    expect(off.items[0].hs).toBe('');
  });

  it('没有表头的纯数据：列待手动指定；可切换第一行是否表头', () => {
    const s = analyzeItems(parsePasted('AL-S200\t100\t12.5\nAC-01\t300\t3.2'));
    expect(s.headerRow).toBe(-1);
    expect(s.rows).toHaveLength(2);
    const r = buildItems(s.rows, ['model', 'qty', 'price']);
    expect(r.items.map((x) => x.qty)).toEqual([100, 300]);
    expect(withHeaderRow(s, 0).rows).toHaveLength(1);
  });

  it('缺数量的行给出提示', () => {
    const r = buildItems([['A1', '']], ['model', 'qty']);
    expect(r.errors[0]).toContain('没有数量');
  });
});

describe('导入工厂箱单', () => {
  // 仿照用户的箱单：品名中英文一格、箱数列、净毛重为每行合计、毛重合并单元格（混装）、表格下方的说明文字
  const table = [
    ['DESCRIPTIONS', 'Qty (pcs)', 'Unit price (EUR)', 'Total Value (EUR)', 'HS code', 'Carton Qty (pcs)', 'N.W.(KGS)', 'G.W(KGS) Carton', 'Packing Size'],
    ['Tote bags 帆布袋', '500', '0.5', '250', '4202129000', '10', '125', '133.85'],
    ['Keychain 钥匙扣', '130', '0.4', '52', '8308100000', '1', '7.8', '29.5'],
    ['Leaflet 宣传单页', '900', '0.04', '36', '4901100000', '1', '13.5', '29.5'],
    ['Sample box 产品样盒', '46', '0.1', '4.6', '4819200000', '1', '1.15', '29.5'],
    ['TOTAL', '1576', '', '342.6', '', '13', '147.45', '163.35'],
    ['MARKS & No.', '', '', '', '', '', '', ''],
    ['Country of Origin:', 'China', '', '', '', '', '', ''],
  ];
  const merged = table.map((r, ri) => r.map((_, ci) => ci === 7 && (ri === 3 || ri === 4)));

  it('认出合计重量、拆中英文品名、跳过说明文字', () => {
    const s = analyzeItems(table);
    expect(s.mapping).toEqual(['nameEn', 'qty', 'price', 'amount', 'hs', 'ctns', 'nwT', 'gwT', 'dims']);
    const r = buildItems(s.rows, s.mapping, [], false);
    expect(r.items).toHaveLength(4);
    expect(r.skipped).toBe(2);
    expect(r.errors).toEqual([]);
    expect(r.items[0]).toMatchObject({ nameEn: 'Tote bags', nameCn: '帆布袋', pcsPerCtn: 50, nw: 12.5, gw: 13.385 });
  });

  it('毛重合并单元格 = 混装：箱数和净毛重计在第一行', () => {
    const s = analyzeItems(table, merged);
    const r = buildItems(s.rows, s.mapping, [], false, s.merged);
    const [, key, leaf, box] = r.items;
    expect(key).toMatchObject({ pcsPerCtn: 130, gw: 29.5 });
    expect(key.nw).toBeCloseTo(7.8 + 13.5 + 1.15, 3);
    expect(leaf.pcsPerCtn).toBe('');
    expect(box.pcsPerCtn).toBe('');
    expect(r.notes[0]).toContain('第 2–4 行是混装');
    expect(r.mixed.size).toBe(2);
  });

  it('按品名更新现有货物，只改文件里有的列', async () => {
    const { emptyItem } = await import('../domain/factory');
    const a = { ...emptyItem(), nameEn: 'Tote bags', qty: 500, price: 0.6, spec: '40×35 cm' };
    const s = analyzeItems(table.map((r) => r.filter((_, i) => i !== 2 && i !== 3 && i !== 8)));
    const r = buildItems(s.rows, s.mapping, [], false);
    const u = updateExisting([a], r, s.mapping);
    expect(u.updated).toBe(1);
    expect(u.added).toBe(3);
    expect(u.items[0]).toMatchObject({ nameEn: 'Tote bags', nameCn: '帆布袋', price: 0.6, spec: '40×35 cm', pcsPerCtn: 50, nw: 12.5 });
  });
});

describe('读取 Excel 合并单元格', () => {
  it('合并区域里非左上角的格子标为 merged，内容与左上角相同', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const { parseXlsxMeta } = await import('./table');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('PL');
    ws.addRows([['Desc', 'Qty', 'G.W.'], ['A', 1, 29.5], ['B', 2, null], ['C', 3, null]]);
    ws.mergeCells('C2:C4');
    const buf = new Uint8Array(await wb.xlsx.writeBuffer() as ArrayBuffer);
    const { rows, merged } = await parseXlsxMeta(buf);
    expect(rows.map((r) => r[2])).toEqual(['G.W.', '29.5', '29.5', '29.5']);
    expect(merged.map((r) => r[2])).toEqual([false, false, true, true]);
  });
});
