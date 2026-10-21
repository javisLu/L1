import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { seed } from './seed';
import { certHs, certOf, certsFor, criterionOf, declPlace, destOf, routeText, CERTS } from './origin';
import { checkOrder } from '../modules/check';
import { neededMods } from '../modules/defs';
import { renderCoExcel } from '../export/coexcel';

describe('产地证：按目的国提示证书', () => {
  it('目的国取报关资料的运抵国；协定证书在前、一般原产地证最后', () => {
    const o = seed().orders[0];
    expect(destOf(o)).toMatchObject({ cn: '新加坡', en: 'SINGAPORE', from: 'customs' });
    expect(certsFor('新加坡').map((c) => c.key)).toEqual(['singapore', 'rcep', 'asean', 'general']);
    expect(certOf(o).key).toBe('singapore');
    expect(certsFor('日本').map((c) => c.key)).toEqual(['rcep', 'general']);
    expect(certsFor('美国').map((c) => c.key)).toEqual(['general']);
  });

  it('没填运抵国时按买方地址 / 目的港推断', () => {
    const o = seed().orders[0];
    o.customs.destCountry = '';
    o.buyer.address = '12 Rue de Rivoli, 75001 Paris, France';
    o.terms.pod = 'Le Havre';
    expect(destOf(o)).toMatchObject({ cn: '法国', en: 'FRANCE', from: 'guess' });
    o.buyer.address = '1-2-3 Ginza, Tokyo, Japan';
    expect(destOf(o)).toMatchObject({ cn: '日本', from: 'guess' });
    o.buyer.address = '';
    o.terms.pod = '';
    expect(destOf(o).from).toBe('none');
  });

  it('运输路线、编码位数', () => {
    const o = seed().orders[0];
    expect(routeText(o)).toBe('FROM QINGDAO, CHINA TO SINGAPORE BY SEA');
    o.co = { type: '', criterion: '', route: 'FROM QINGDAO TO SINGAPORE VIA HONG KONG BY SEA', remarks: '', place: '' };
    expect(routeText(o)).toBe('FROM QINGDAO TO SINGAPORE VIA HONG KONG BY SEA');
    expect(certHs('9403200000', CERTS.rcep)).toBe('9403.20');
    expect(certHs('9403200000', CERTS.general)).toBe('9403200000');
  });

  it('原产地标准不替用户假设；申报地点不重复写 CHINA', () => {
    const o = seed().orders[0];
    expect(criterionOf(o)).toBe('');
    o.numbers.signedAt = 'Qingdao, China';
    expect(declPlace(o)).toBe('QINGDAO, CHINA');
    o.numbers.signedAt = 'Qingdao';
    expect(declPlace(o)).toBe('QINGDAO, CHINA');
    o.co = { type: 'rcep', criterion: '', route: '', remarks: '', place: '' };
    expect(checkOrder(o).some((x) => x.text.startsWith('产地证：原产地标准还没填'))).toBe(true);
  });

  it('目的国有自贸协定时产地证标为要做；只选一般原产地证、协定证书缺编码时提醒', () => {
    const o = seed().orders[0];
    expect(neededMods(o).has('origin')).toBe(true);
    o.co = { type: 'general', criterion: '', route: '', remarks: '', place: '' };
    expect(checkOrder(o).some((x) => x.mod === 'origin' && x.text.includes('少交关税'))).toBe(true);
    o.co.type = 'rcep';
    o.items[1].hs = '';
    expect(checkOrder(o).some((x) => x.text.includes('第 2 行没有商品编码'))).toBe(true);
    const us = seed().orders[1];
    us.customs.destCountry = '美国';
    expect(neededMods(us).has('origin')).toBe(false);
  });

  it('Excel：按证书栏目，协定证书编码 6 位、带发票金额，合计后打 *****', async () => {
    const o = seed().orders[0];
    o.co = { type: 'rcep', criterion: 'WO', route: '', remarks: '', place: '' };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await renderCoExcel(o)) as unknown as ArrayBuffer);
    const text: string[] = [];
    wb.worksheets[0].eachRow((r) => r.eachCell((c) => text.push(String(c.value ?? ''))));
    const all = text.join('\n');
    expect(all).toContain('RCEP 原产地证明');
    expect(all).toContain('9403.20');
    expect(all).toContain('USD 1250.00');
    expect(all).toContain('*****');
    expect(all).toContain('FROM QINGDAO, CHINA TO SINGAPORE BY SEA');
  });
});
