import { describe, expect, it } from 'vitest';
import { seed } from './seed';
import { asOrder, changeNote, diffDoc, docVersions, recordSend, recordVersions, takeSnap, totalChanges } from './history';
import { emptyItem } from './factory';
import type { Order } from './types';

const order = (): Order => {
  const o = seed().orders[1];
  o.contractClauses.forEach((c, i) => (c.id = 'cl' + i));
  return o;
};
let n = 0;
const send = (o: Order, docs: string[], to?: string, at = `2026-10-0${++n % 9 + 1} 10:00`) => recordSend(o, { id: 'r' + n, at, docs, to, snap: takeSnap(o) });

describe('发出记录', () => {
  it('留底只取单据用到的数据', () => {
    const o = order();
    o.exports = { pi: { at: 'x', sig: 'y' } };
    o.dismissed = ['a'];
    const s = takeSnap(o) as unknown as Record<string, unknown>;
    expect(s.items).toBeTruthy();
    expect(s.exports).toBeUndefined();
    expect(s.dismissed).toBeUndefined();
    expect(s.status).toBeUndefined();
  });

  it('同样的内容只存一份；版本号只在内容变了时增加；单价不影响箱单的版本', () => {
    const o = order();
    send(o, ['pi', 'pl'], '客户');
    send(o, ['pi'], '工厂');
    expect(Object.keys(o.snaps!).length).toBe(1);
    expect(docVersions(o, 'pi').length).toBe(1);
    o.items[0].price = 95;
    send(o, ['pi', 'pl'], '客户');
    expect(docVersions(o, 'pi').map((v) => v.v)).toEqual([1, 2]);
    expect(docVersions(o, 'pl').length).toBe(1);
    expect(recordVersions(o, o.sent![2])).toEqual({ pi: 2, pl: 1 });
    expect(recordVersions(o, o.sent![1])).toEqual({ pi: 1 });
  });

  it('最多保留 60 条，没人用的留底删掉', () => {
    const o = order();
    for (let i = 0; i < 65; i++) {
      o.items[0].qty = 100 + i;
      recordSend(o, { id: 'x' + i, at: `2026-10-01 10:${String(i).padStart(2, '0')}`, docs: ['pi'], snap: takeSnap(o) });
    }
    expect(o.sent!.length).toBe(60);
    expect(Object.keys(o.snaps!).length).toBe(60);
  });
});

describe('改版对比', () => {
  it('数量、单价、交期、付款条款、总金额', () => {
    const o = order();
    const prev = asOrder(takeSnap(o), o);
    o.items[0].qty = 80;
    o.items[1].price = 12;
    o.terms.leadTime = '30 days';
    o.terms.paymentText = '30% T/T in advance, 70% against B/L copy';
    o.terms.payment = 'T/T 电汇';
    const ch = diffDoc(prev, o, 'pi');
    const labels = ch.map((c) => c.label);
    expect(labels).toContain('第 1 行 AL-H500 · 数量');
    expect(ch.find((c) => c.label === '第 1 行 AL-H500 · 数量')).toMatchObject({ from: '60', to: '80' });
    expect(ch.find((c) => c.label === '第 2 行 AL-S200 · 单价')).toMatchObject({ from: '12.50', to: '12.00' });
    expect(labels.some((l) => l.startsWith('交期'))).toBe(true);
    expect(labels.some((l) => l.includes('付款条款'))).toBe(true);
    // 付款方式的内部选项不单独列出（付款条款文字已经体现）
    expect(labels.filter((l) => l.includes('付款')).length).toBe(1);
    const tot = totalChanges(prev, o, 'pi');
    expect(tot.find((c) => c.label === '总金额')).toMatchObject({ from: 'USD 9,090.00', to: 'USD 10,720.00' });
  });

  it('新增、删除货物行；箱单不看单价；合同条款改动', () => {
    const o = order();
    const prev = asOrder(takeSnap(o), o);
    const add = { ...emptyItem(), id: 'new1', model: 'AC-01', nameEn: 'Accessory Kit', qty: 50, unit: 'PCS', price: 3 };
    o.items.push(add);
    const removed = o.items.shift()!;
    o.items[0].price = 11;
    o.contractClauses[0].body = 'Changed clause body';
    const pi = diffDoc(prev, o, 'pi');
    expect(pi.find((c) => c.kind === 'add')?.label).toContain('AC-01');
    expect(pi.find((c) => c.kind === 'del')?.label).toContain(removed.model);
    const pl = diffDoc(prev, o, 'pl');
    expect(pl.some((c) => c.label.includes('单价'))).toBe(false);
    expect(diffDoc(prev, o, 'contract').some((c) => c.label.includes('条款'))).toBe(true);
  });

  it('提单、唛头、外包装用中文说明，不显示内部代码', () => {
    const o = order();
    const prev = asOrder(takeSnap(o), o);
    o.shipping.blType = 'telex';
    o.shipping.marks = 'ABC\nNEW MARK';
    const si = diffDoc(prev, o, 'si');
    expect(si.find((c) => c.to === '电放')).toBeTruthy();
    const mk = diffDoc(prev, o, 'marks');
    expect(mk.find((c) => c.label === '唛头')).toBeTruthy();
  });

  it('没改就没有改动', () => {
    const o = order();
    const prev = asOrder(takeSnap(o), o);
    expect(diffDoc(prev, o, 'pi')).toEqual([]);
    expect(totalChanges(prev, o, 'pi')).toEqual([]);
  });

  it('改版说明：英文给客户、中文给工厂货代', () => {
    const o = order();
    const prev = asOrder(takeSnap(o), o);
    o.items[0].qty = 80;
    const ch = [...diffDoc(prev, o, 'pi'), ...totalChanges(prev, o, 'pi')];
    const en = changeNote(o, 'pi', ch, 'en', 2);
    expect(en).toContain('Dear John,');
    expect(en).toContain('Proforma Invoice No. PI-2026-002 (Rev. 2)');
    expect(en).toContain('- Quantity of AL-H500 changed from 60 to 80');
    expect(en).toContain('- Total amount changed from USD 9,090.00 to USD 10,870.00');
    const zh = changeNote(o, 'pi', ch, 'zh', 2);
    expect(zh).toContain('PI 形式发票（PI-2026-002）第 2 版改动如下');
    expect(zh).toContain('1. 第 1 行 AL-H500 · 数量：60 → 80');
  });
});
