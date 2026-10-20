import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { buildLib, controlText, elementsHint, fillItems, findByName, learn, normName, suggestNames, tariffOf } from './hs';
import { mapHs, mapTariff } from '../io/library';
import { checkOrder } from '../modules/check';
import type { HsEntry, TariffRow } from './types';

const T: TariffRow[] = [
  { hs: '9403200000', name: '其他金属家具', elements: '0:品牌类型;1:出口享惠情况;2:用途;3:材质;4:品牌;5:型号', rebate: 13, unit: '千克', control: '' },
  { hs: '7318159001', name: '螺栓', elements: '0:品牌类型;1:出口享惠情况;2:用途;3:材质', rebate: 9, unit: '千克', control: 'AB' },
];

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

  it('按记忆库补全：只补空着的；有编号没退税率的按税则表', () => {
    const s = seed();
    const lib = buildLib(s.products, s.orders);
    const o = s.orders[1];
    o.items[0].hs = '';
    o.items[0].elements = '';
    o.items[1].hs = '9999999999';
    o.items[1].elements = '自己填的';
    o.items.forEach((it) => (it.rebate = ''));
    const r = fillItems(o, lib, T);
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

describe('税则表', () => {
  it('按 10 位查，查不到按前 8 位；申报要素格式变成填写提示；监管条件说明', () => {
    expect(tariffOf(T, '9403.20.0000')?.name).toBe('其他金属家具');
    expect(tariffOf(T, '9403200090')?.hs).toBe('9403200000');
    expect(tariffOf(T, '9403')).toBeUndefined();
    expect(elementsHint(T[0])).toBe('品牌类型|出口享惠情况|用途|材质|品牌|型号');
    expect(controlText('AB')).toBe('A（入境检验检疫）、B（出境检验检疫）');
  });

  it('导入：识别表头，退税率 13%、0.13 都算 13，章节标题行跳过', () => {
    const r = mapTariff([
      ['税则号列', '货品名称', '规范申报要素', '出口退税率', '第一法定单位', '监管条件'],
      ['94', '家具', '', '', '', ''],
      ['9403200000', '其他金属家具', '0:品牌类型;1:用途', '13%', '千克', ''],
      ['9617001100', '保温杯', '0:品牌类型', '0.13', '个', 'B'],
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.rebate)).toEqual([13, 13]);
    expect(r.rows[1].control).toBe('B');
    expect(r.errors[0]).toContain('1 行编号不足 8 位');
  });

  it('记忆库导入：没有品名的行跳过，编号不是 10 位的提示', () => {
    const r = mapHs([['品名', 'HS编码', '申报要素', '退税率'], ['水杯', '96170011', '0|0', '13'], ['', '', '', '']]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0]).toContain('不是 10 位');
  });

  it('单据检查：编号不在税则表、有监管条件的提醒（没导入税则表不查）', () => {
    const o = seed().orders[0];
    o.items[0].hs = '9403209999';
    const iss = checkOrder(o, [], T);
    expect(iss.some((x) => x.text.includes('不在导入的税则表里'))).toBe(true);
    expect(iss.some((x) => x.text.includes('监管条件 A（入境检验检疫）'))).toBe(true);
    expect(checkOrder(o).some((x) => x.text.includes('税则表'))).toBe(false);
  });
});
