import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { blAskText, blNoIn, checkBl, hasName, numbersBefore } from './bl';
import { calcOrder, fixed } from './calc';
import { pkgSummary } from './package';

/** 2026-002：已出货，有船名、提单号、柜号封号 */
// 示例信用证单现在是 TO ORDER；这里按收货人 = 买方的草稿来测
const order = () => { const o = seed().orders[1]; o.shipping.consigneeMode = 'buyer'; return o; };

/** 按订单拼一份「货代格式」的提单草稿：栏目顺序、写法和我们的单据都不一样 */
function draft(o: ReturnType<typeof order>, patch: (s: string) => string = (s) => s) {
  const k = calcOrder(o), pk = pkgSummary(o, k);
  const s = `B/L NO.: ${o.shipping.blNo}
SHIPPER
${o.seller.name.toUpperCase()}
${o.seller.address.toUpperCase()}
CONSIGNEE
${o.buyer.name.toUpperCase()}, ${o.buyer.address.toUpperCase()}
NOTIFY PARTY
SAME AS CONSIGNEE
OCEAN VESSEL / VOY NO. ${o.shipping.vessel}
PORT OF LOADING ${o.terms.pol.toUpperCase()}    PORT OF DISCHARGE ${o.terms.pod.toUpperCase()}
CONTAINER NO./SEAL NO. CSNU 7234561 / ${o.shipping.seal}
MARKS & NOS     NO. OF PKGS     DESCRIPTION OF GOODS     GROSS WEIGHT     MEASUREMENT
${o.shipping.marks.replace(/\{PO\}/, o.numbers.po).replace(/\{CTNS\}/, String(k.ctns))}
${pk.count} CARTONS
${o.items.map((it) => String(it.nameEn).toUpperCase()).join('\n')}
${fixed(pk.gw, 2)} KGS     ${fixed(pk.cbm, 3)} CBM
SAY TOTAL ONE HUNDRED (${pk.count}) CARTONS ONLY
FREIGHT ${o.terms.incoterm === 'FOB' ? 'COLLECT' : 'PREPAID'}`;
  return patch(s);
}

describe('提单核对', () => {
  it('货代格式的草稿：各项都能对上', () => {
    const o = order();
    o.shipping.marks = o.shipping.marks.replace(/\{PO\}/, o.numbers.po).replace(/\{CTNS\}/, String(calcOrder(o).ctns));
    const r = checkBl(o, draft(o));
    const bad = r.filter((c) => c.result === 'missing' || c.result === 'diff');
    expect(bad).toEqual([]);
    expect(r.map((c) => c.item)).toEqual(expect.arrayContaining(['托运人', '收货人', '通知人', '装运港', '卸货港', '船名航次', '柜号', '封号', '件数', '毛重', '体积', '唛头', '货描', '运费']));
    expect(blNoIn(draft(o))).toBe(o.shipping.blNo);
  });

  it('毛重写错、柜号不是这票的、收货人漏了：标出来并生成修改意见', () => {
    const o = order();
    const pk = pkgSummary(o, calcOrder(o));
    const t = draft(o, (s) => s.replace(`${fixed(pk.gw, 2)} KGS`, '1,406.00 KGS').replace('CSNU 7234561', 'TGHU 1234567').replace(o.buyer.name.toUpperCase(), 'SOMEBODY ELSE'));
    const r = checkBl(o, t);
    const gw = r.find((c) => c.item === '毛重')!;
    expect(gw).toMatchObject({ result: 'diff', found: '1,406.00 KGS' });
    expect(r.find((c) => c.item === '柜号' && c.result === 'missing')).toBeTruthy();
    expect(r.find((c) => c.item === '柜号' && c.result === 'diff')?.found).toBe('TGHU1234567');
    expect(r.find((c) => c.item === '收货人')?.result).toBe('missing');
    const ask = blAskText(o, r, '陈小姐');
    expect(ask).toContain('陈小姐好');
    expect(ask).toContain(`毛重应为 ${fixed(pk.gw, 2)} KGS（草稿是 1,406.00）`);
    expect(ask).toContain('收货人（CONSIGNEE）请写');
  });

  it('运费条款反了；TO ORDER 收货人', () => {
    const o = order();
    o.shipping.freight = 'PREPAID';
    expect(checkBl(o, 'FREIGHT COLLECT').find((c) => c.item === '运费')).toMatchObject({ result: 'diff', found: 'FREIGHT COLLECT' });
    o.shipping.consigneeMode = 'order';
    expect(checkBl(o, 'CONSIGNEE: TO ORDER OF SHIPPER').find((c) => c.item === '收货人')?.result).toBe('ok');
  });

  it('毛重、体积写在表头下面、数字后不跟单位也能对上；写错了仍然报', () => {
    const o = order();
    const pk = pkgSummary(o, calcOrder(o));
    const table = `G.W. (KGS)   MEAS. (CBM)\n${fixed(pk.gw, 2)}   ${fixed(pk.cbm, 3)}`;
    expect(checkBl(o, table).find((c) => c.item === '毛重')?.result).toBe('ok');
    expect(checkBl(o, table).find((c) => c.item === '体积')?.result).toBe('ok');
    expect(checkBl(o, 'G.W. 999.00 KGS').find((c) => c.item === '毛重')?.result).toBe('diff');
  });

  it('工具函数', () => {
    expect(numbersBefore('74 CTNS / 1,460.00 KGS / 11.236 CBM', 'KGS?')).toEqual([1460]);
    expect(numbersBefore('TOTAL 2 PALLETS (74 CARTONS)', 'PALLETS?|CARTONS?')).toEqual([2, 74]);
    expect(hasName('ABC TRADING L.L.C. 123 MAIN ST', 'ABC Trading LLC')).toBe(true);
    expect(blNoIn('B/L No: COSU6384521900')).toBe('COSU6384521900');
    expect(blNoIn('B/L No.\n2026-09-26')).toBe('');
  });
});
