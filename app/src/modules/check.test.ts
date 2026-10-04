import { describe, expect, it } from 'vitest';
import { checkOrder } from './check';
import { seed } from '../domain/seed';

const texts = (o: Parameters<typeof checkOrder>[0]) => checkOrder(o).map((x) => `[${x.level}] ${x.text}`);

describe('单据一致性检查', () => {
  it('示例订单没有问题', () => {
    for (const o of seed().orders) expect(texts(o)).toEqual([]);
  });

  it('尾箱、净重大于毛重、HS 位数、重复型号', () => {
    const o = seed().orders[0];
    o.items[0].qty = 101; // 每箱 2
    o.items[1].nw = 50; // 毛重 48 左右
    o.items[2].hs = '731815';
    o.items.push({ ...o.items[0], id: 'dup' });
    const t = texts(o).join('\n');
    expect(t).toContain('最后一箱只有 1');
    expect(t).toMatch(/\[error\] 第 2 行 AL-H500：每箱净重 50 kg 大于毛重/);
    expect(t).toContain('HS 编码 731815 是 6 位');
    expect(t).toContain('型号 AL-S200 出现了 2 次');
    expect(checkOrder(o)[0].level).toBe('error');
  });

  it('唛头箱数、PO 号、未替换的占位符', () => {
    const o = seed().orders[0];
    o.shipping.marks = 'G.V.\nPO NO.: GV-PO-0001\nC/NO. 1-60\nMADE IN CHINA {CTNS}';
    const t = texts(o).join('\n');
    expect(t).toMatch(/唛头写的是箱号 1-60，实际共 \d+ 箱/);
    expect(t).toContain('GV-PO-0001 与订单 PO 号 GV-PO-7781 不一致');
    expect(t).toContain('{PO} / {CTNS} 没有替换');
  });

  it('贸易术语：交货地址、运费保费；柜型装载；出货后缺提单号', () => {
    const o = seed().orders[1];
    o.terms.incoterm = 'DDP';
    o.terms.deliveryAddress = '';
    o.customs.freight = '';
    o.shipping.container = '1x20GP';
    o.items[1].qty = 3000;
    o.shipping.blNo = '';
    const t = texts(o).join('\n');
    expect(t).toContain('[error] DDP 需要写明交货地址');
    expect(t).toContain('[error] DDP 成交，报关单需要填运费');
    expect(t).toMatch(/总体积 [\d.]+ m³ 超过 20GP 约 28 m³/);
    expect(t).toContain('提单号还没填');
  });

  it('报价阶段缺运输信息只作提醒', () => {
    const o = seed().orders[0];
    o.customs.exportPort = '';
    const r = checkOrder(o).find((x) => x.text.startsWith('报关要素'));
    expect(r?.level).toBe('warn');
    expect(r?.text).toContain('出货前补齐');
  });

  it('唛头箱号、占位符可以一键修正', () => {
    const o = seed().orders[0];
    o.shipping.marks = 'G.V.\nPO: {PO}\nCTN NO.: 1-60\nMADE IN CHINA';
    for (const x of checkOrder(o)) x.fix?.apply(o);
    expect(o.shipping.marks).toBe('G.V.\nPO: GV-PO-7781\nCTN NO.: 1-74\nMADE IN CHINA');
    expect(checkOrder(o)).toEqual([]);
  });
});
