import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { cnFields, toEnglish, translateLine, translateOrder } from './english';
import { checkOrder } from '../modules/check';

describe('英文单据', () => {
  it('示例订单的报价单、PI、发票、箱单上没有中文', () => {
    for (const o of seed().orders) expect(cnFields(o)).toEqual([]);
  });

  it('找出会印到单据上的中文，按单据区分', () => {
    const o = seed().orders[0];
    o.docset.clauses = '价格有效期30天\n交期：收到定金后25-30个工作日';
    o.items[0].unit = '件';
    o.docset.statement = '不含木质包装';
    expect(cnFields(o, 'pi').map((f) => f.label)).toEqual(['报价单 / PI 条款', '第 1 行单位']);
    expect(cnFields(o, 'pl').map((f) => f.label)).toEqual(['发票 / 箱单注明', '第 1 行单位']);
    expect(checkOrder(o).filter((x) => x.text.startsWith('客户单据上有中文')).length).toBe(3);
  });

  it.each([
    ['价格有效期30天。', 'Prices are valid for 30 days.'],
    ['报价有效期至2026年11月30日', 'This quotation is valid until 2026-11-30.'],
    ['以上价格为FOB青岛', 'Prices above are quoted on FOB QINGDAO basis.'],
    ['交期：收到定金后25-30个工作日', 'Delivery time: 25-30 working days after receipt of deposit.'],
    ['收到定金后20天内发货', 'Delivery within 20 days after receipt of deposit.'],
    ['30%定金，70%尾款发货前付清', '30% T/T deposit in advance, 70% balance before shipment.'],
    ['质量异议须在收货后7天内提出', 'Any quality claim must be raised within 7 days after receipt of goods.'],
    ['银行手续费由买方承担', 'Bank charges are borne by the Buyer.'],
    ['数量允许溢短装5%', 'Quantity tolerance of ±5% is allowed.'],
    ['起订量：500件', 'MOQ: 500 PCS.'],
    ['不含木质包装', 'NO WOOD PACKING MATERIAL IS USED.'],
    ['不允许分批装运', 'Partial shipment not allowed.'],
    ['1. 样品免费，运费由客户承担', 'Samples are free of charge; courier cost is borne by the Buyer.'],
    ['20-25个工作日', '20-25 working days'],
    ['套', 'SETS'],
    ['青岛港', 'QINGDAO, CHINA'],
  ])('%s → %s', (cn, en) => expect(translateLine(cn)).toBe(en));

  it('认不出的句子保留原文、列出来；一键翻只改能翻的', () => {
    const r = toEnglish('价格有效期30天\n我们的产品质量非常好');
    expect(r.text).toBe('Prices are valid for 30 days.\n我们的产品质量非常好');
    expect(r.left).toEqual(['我们的产品质量非常好']);
    const o = seed().orders[0];
    o.docset.clauses = '价格有效期30天\n银行费用由双方各自承担';
    o.docset.remarks = '请尽快确认';
    o.items[1].unit = '套';
    const t = translateOrder(o, 'pi');
    expect(t.done).toBe(2);
    expect(o.docset.clauses).toBe('Prices are valid for 30 days.\nEach party bears its own bank charges.');
    expect(o.items[1].unit).toBe('SETS');
    expect(t.left.map((f) => f.label)).toEqual(['备注']);
  });
});
