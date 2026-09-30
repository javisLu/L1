import { describe, expect, it } from 'vitest';
import { decodeText, parseCsv, parseDims, parseXlsx } from './table';
import { mapCustomers, mapProducts, mergeCustomer, mergeProduct, productsToXlsx } from './library';
import { makeBackup, parseBackup } from './backup';
import { formatOrderNo } from '../domain/settings';
import { seed } from '../domain/seed';

const hex = (h: string) => new Uint8Array(h.match(/../g)!.map((b) => parseInt(b, 16)));

describe('CSV', () => {
  it('解析引号、引号内逗号与换行、"" 转义', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n"多\n行",z\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['多\n行', 'z']]);
  });
  it('识别分号和制表符分隔', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('GBK 编码的 Excel 另存 CSV 自动识别', () => {
    const text = decodeText(hex('d0cdbac52cd6d0cec4c6b7c3fb2cb5a5bcdb2ccde2cfe4b3dfb4e70d0a414c2d312c22c2c1bacfbdf0bcdc2c20b1ead7bc222c31322e352c36307834307833300d0a'));
    const r = mapProducts(parseCsv(text));
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ model: 'AL-1', nameCn: '铝合金架, 标准', price: 12.5, l: 60, w: 40, h: 30 });
  });
  it('UTF-8 带 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('型号\nA')]);
    expect(decodeText(bytes)).toBe('型号\nA');
  });
});

describe('产品导入', () => {
  it('中英文表头别名、表头不在第一行、无型号行报错', () => {
    const r = mapProducts([
      ['产品清单 2026'],
      ['Item No.', 'Description', 'Unit Price', 'PCS/CTN', 'G.W.', 'HS Code'],
      ['X-1', 'Steel Shelf', '$1,234.50', '4', '12.2kg', '9403.20.0000'],
      ['', 'no model', '1', '', '', ''],
    ]);
    expect(r.headerRow).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ model: 'X-1', nameEn: 'Steel Shelf', price: 1234.5, pcsPerCtn: 4, gw: 12.2, hs: '9403200000', unit: 'PCS' });
    expect(r.errors[0]).toContain('第 4 行');
  });
  it('没有型号列时给出原因', () => {
    expect(mapProducts([['名称', '单价'], ['a', '1']]).errors[0]).toContain('型号');
  });
  it('箱规写法', () => {
    expect(parseDims('60 × 40 × 30 cm')).toEqual([60, 40, 30]);
    expect(parseDims('60*40*30')).toEqual([60, 40, 30]);
    expect(parseDims('abc')).toBeNull();
  });
  it('导出 Excel 再导入，数据一致', async () => {
    const { products } = seed();
    const back = mapProducts(await parseXlsx(await productsToXlsx(products)));
    expect(back.rows.map((p) => [p.model, p.nameCn, p.price, p.l, p.gw])).toEqual(products.map((p) => [p.model, p.nameCn, p.price, p.l, p.gw]));
  });
});

describe('客户导入', () => {
  it('公司名、联系人、币种', () => {
    const r = mapCustomers([['客户名称', '国家', 'Contact', 'Email', '币种', '贸易术语'], ['ACME GmbH', '德国', 'Hans', 'h@acme.de', 'eur', 'cif']]);
    expect(r.rows[0]).toMatchObject({ name: 'ACME GmbH', country: '德国' });
    expect(r.rows[0].contacts[0]).toMatchObject({ name: 'Hans', email: 'h@acme.de' });
    expect(r.rows[0].habits).toMatchObject({ currency: 'EUR', incoterm: 'CIF' });
  });
});

describe('备份', () => {
  it('备份后恢复内容一致', () => {
    const d = seed();
    const r = parseBackup(makeBackup(d));
    expect(r.data.orders).toHaveLength(d.orders.length);
    expect(r.data.orders[0].numbers.pi).toBe(d.orders[0].numbers.pi);
  });
  it('拒绝非本软件的文件或残缺备份', () => {
    expect(() => parseBackup('not json')).toThrow('无法解析');
    expect(() => parseBackup('{"a":1}')).toThrow('不是外贸超级工作台');
    expect(() => parseBackup(JSON.stringify({ app: 'trade-workbench', data: { orders: [] } }))).toThrow('不完整');
  });
});

describe('编号规则', () => {
  const base = { seqDigits: 3, quote: 'QT-', pi: 'PI-', contract: 'SC-', ci: 'CI-' };
  const d = new Date(2026, 8, 30);
  it('按模板生成订单号', () => {
    expect(formatOrderNo({ ...base, orderPattern: '{YYYY}-{SEQ}' }, 7, d)).toBe('2026-007');
    expect(formatOrderNo({ ...base, orderPattern: 'HY{YY}{MM}{SEQ}', seqDigits: 4 }, 12, d)).toBe('HY26090012');
    expect(formatOrderNo({ ...base, orderPattern: 'ABC' }, 5, d)).toBe('ABC005');
  });
});

describe('覆盖更新只改文件里有的列', () => {
  it('只有型号和单价时，不清空箱规和重量', () => {
    const p = seed().products[0];
    const r = mapProducts([['型号', '单价'], [p.model, '99']]);
    expect(r.fields).toEqual(['model', 'price']);
    const target = { ...p };
    mergeProduct(target, r.rows[0], r.fields);
    expect(target).toMatchObject({ price: 99, nw: p.nw, gw: p.gw, l: p.l, nameCn: p.nameCn });
  });
  it('外箱尺寸列展开为长宽高', () => {
    expect(mapProducts([['型号', '外箱尺寸'], ['A', '1x2x3']]).fields).toEqual(['model', 'l', 'w', 'h']);
  });
  it('客户只更新邮箱，不动地址和交易习惯', () => {
    const c = seed().customers[0];
    const r = mapCustomers([['公司名称', 'Email'], [c.name, 'new@x.com']]);
    const target = JSON.parse(JSON.stringify(c));
    mergeCustomer(target, r.rows[0], r.fields);
    expect(target.contacts[0].email).toBe('new@x.com');
    expect(target.contacts[0].name).toBe(c.contacts[0].name);
    expect(target.address).toBe(c.address);
    expect(target.habits.incoterm).toBe(c.habits.incoterm);
  });
});

