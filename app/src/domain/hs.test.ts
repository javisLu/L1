import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { buildLib, fillItems, findByName, hsLookupUrl, learn, normName, renameRow, suggestNames } from './hs';
import { mapHs } from '../io/library';
import type { HsEntry } from './types';

describe('HS 记忆库', () => {
  it('品名比较忽略空格、全半角括号、大小写', () => {
    expect(normName(' 铝合金展示架（标准款） ')).toBe(normName('铝合金展示架(标准款)'));
    expect(normName('LED  Lamp')).toBe('led lamp');
  });

  it('从产品库和订单生成：同品名只记一条，订单里的退税率也记下', () => {
    const s = seed();
    const lib = buildLib(s.products, s.orders);
    expect(lib.length).toBe(s.products.length);
    expect(findByName(lib, '配件包（挂钩及螺栓）')).toMatchObject({ hs: '7318159001', rebate: 9 });
    expect(findByName(lib, '钢制货架 80cm')?.rebate).toBe('');
  });

  it('导出时记住：新品名新增，同品名更新为最新填写；编号不足 8 位不记', () => {
    const lib: HsEntry[] = [];
    expect(learn(lib, [{ nameCn: '不锈钢水杯', hs: '9617.0011.00', elements: '0|0|饮水用|不锈钢', rebate: 13 }], '2026-10-01')).toEqual({ added: 1, updated: 0 });
    expect(lib[0]).toMatchObject({ hs: '9617001100', source: 'order', used: '2026-10-01' });
    expect(learn(lib, [{ nameCn: '不锈钢水杯 ', hs: '9617001900', elements: '', rebate: undefined }], '2026-10-05')).toEqual({ added: 0, updated: 1 });
    expect(lib[0]).toMatchObject({ hs: '9617001900', elements: '0|0|饮水用|不锈钢', rebate: 13, used: '2026-10-05' });
    expect(learn(lib, [{ nameCn: '杯盖', hs: '3924', elements: '', rebate: '' }]).added).toBe(0);
  });

  it('输入时的候选：开头一致的在前', () => {
    const lib = buildLib(seed().products, []);
    lib.push({ id: 'x', nameCn: '展示架配件（铝合金）', hs: '9403900000', elements: '', rebate: '', source: 'manual', used: '' });
    const names = suggestNames(lib, '铝合金').map((e) => e.nameCn);
    expect(names.slice(0, 2).sort()).toEqual(['铝合金展示架（加重款）', '铝合金展示架（标准款）']);
    expect(names[2]).toBe('展示架配件（铝合金）');
    expect(suggestNames(lib, '7318').map((e) => e.hs)).toEqual(['7318159001']);
  });

  it('按记忆库补全：只补空着的', () => {
    const s = seed();
    const lib = buildLib(s.products, s.orders);
    const o = s.orders[1];
    o.items[0].hs = '';
    o.items[0].elements = '';
    o.items[1].hs = '9999999999';
    o.items[1].elements = '自己填的';
    o.items.forEach((it) => (it.rebate = ''));
    const r = fillItems(o, lib);
    expect(o.items[0].hs).toBe('9403200000');
    expect(o.items[0].elements).toBe('0|0|展示用|铝合金|无品牌|AL-H500');
    expect(o.items[0].rebate).toBe(13);
    // 已填的编号、申报要素不动；编号和记忆库不一致时不带申报要素和退税率
    expect(o.items[1].hs).toBe('9999999999');
    expect(o.items[1].elements).toBe('自己填的');
    expect(o.items[1].rebate).toBe('');
    expect(r.rows).toEqual([0]);
  });
});

describe('改中文品名', () => {
  it('改成本单其它行已有的品名：整行换成那一行的编号、申报要素', () => {
    const s = seed();
    const lib = buildLib(s.products, s.orders);
    const o = s.orders[0];
    o.items.push({ ...o.items[2], id: 'n1', nameCn: '产品说明书', hs: '4901100000', elements: '0|0|说明用', rebate: '' });
    o.items[2].nameCn = '产品说明书';
    expect(renameRow(o, 2, lib)).toBe('replaced');
    expect(o.items[2]).toMatchObject({ hs: '4901100000', elements: '0|0|说明用', rebate: '' });
  });

  it('改成记忆库里有的品名：按记忆库换；都找不到：不动', () => {
    const s = seed();
    const lib = buildLib(s.products, s.orders);
    const o = s.orders[0];
    o.items[2].nameCn = '钢制货架 80cm';
    expect(renameRow(o, 2, lib)).toBe('replaced');
    // 原来配件包的退税率 9 不能留着
    expect(o.items[2]).toMatchObject({ hs: '9403200000', elements: '0|0|仓储用|钢制|无品牌|SH-80', rebate: '' });
    o.items[1].nameCn = '没见过的东西';
    expect(renameRow(o, 1, lib)).toBe('none');
    expect(o.items[1].hs).toBe('9403200000');
  });

  it('补全时也按本单其它同品名的行', () => {
    const s = seed();
    const o = s.orders[0];
    o.items.push({ ...o.items[0], id: 'n2', hs: '', elements: '', rebate: '' });
    const r = fillItems(o, []);
    expect(r.rows).toEqual([3]);
    expect(o.items[3]).toMatchObject({ hs: o.items[0].hs, elements: o.items[0].elements, rebate: 13 });
  });
});

describe('导入与网上查', () => {
  it('记忆库导入：没有品名的行跳过，编号不是 10 位的提示，退税率 13% / 0.13 都算 13', () => {
    const r = mapHs([['品名', 'HS编码', '申报要素', '退税率'], ['水杯', '96170011', '0|0', '13%'], ['杯盖', '3924100000', '', '0.13'], ['', '', '', '']]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.rebate)).toEqual([13, 13]);
    expect(r.errors[0]).toContain('不是 10 位');
  });

  it('网上查：有 10 位编码按编码打开，没有按品名搜', () => {
    expect(hsLookupUrl('9403.20.0000')).toBe('https://www.hsbianma.com/Code/9403200000.html');
    expect(hsLookupUrl('', '帆布袋')).toBe('https://www.hsbianma.com/search?keywords=%E5%B8%86%E5%B8%83%E8%A2%8B');
    expect(hsLookupUrl('4202', '帆布袋')).toBe('https://www.hsbianma.com/search?keywords=4202');
  });
});
