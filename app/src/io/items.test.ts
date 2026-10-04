import { describe, expect, it } from 'vitest';
import { analyzeItems, buildItems, findPo, parsePasted, withHeaderRow } from './items';
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
