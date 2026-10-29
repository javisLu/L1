import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { renderExcel } from './excel';
import { renderPoExcel } from './poexcel';
import { renderCoExcel } from './coexcel';
import { renderShipExcel } from './shipexcel';
import { seed } from '../domain/seed';

/** Excel 里所有格子的文字（带格式的文字也算） */
const text = async (u8: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(u8 as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.worksheets[0].eachRow((row) => row.eachCell((c) => out.push(c.text)));
  return out.join('\n');
};

describe('Excel 和 PDF 内容一致', () => {
  it('报关单 Excel 按报关单格式：标题、栏目、8 位日期、名称(代码)、中文单位币制、底部栏', async () => {
    const s = seed();
    const t = await text(await renderExcel(s.orders[1], 'customs', undefined, s.partners));
    for (const x of ['中华人民共和国海关出口货物报关单', '预录入编号', '申报日期', '备案号', '杂费', '随附单证及编号', '20261008', '一般贸易(0110)', '一般征税(101)', '1680千克', '60套', '美元', '特殊关系确认', '海关批注及签章', '青岛海通报关有限公司'])
      expect(t).toContain(x);
  });
  it('报价单 / PI：客户税号、收款银行、装货港、目的港、币种、包装、条款标题、客户确认栏', async () => {
    const o = seed().orders[0];
    for (const doc of ['quote', 'pi'] as const) {
      const t = await text(await renderExcel(o, doc));
      for (const x of ['Tax/VAT: UEN 201912345K', 'Bank Information', 'Port of Loading', 'Destination', 'Currency', 'Packing: 74 cartons', 'TERMS & CONDITIONS', 'TOTAL FOB QINGDAO', 'Accepted by'])
        expect(t, doc).toContain(x);
    }
  });
  it('发票：型号、开船日期、完整声明；箱单：型号、每箱装、开船日期', async () => {
    const o = seed().orders[1];
    const ci = await text(await renderExcel(o, 'ci'));
    for (const x of ['AL-H500', 'ETD', '2026-10-08', 'Tax/VAT: EIN 95-1234567', 'DECLARATION', 'contents of this shipment are as stated above']) expect(ci).toContain(x);
    const pl = await text(await renderExcel(o, 'pl'));
    for (const x of ['AL-S200', '2 PCS/CTN', '1 SETS/CTN', 'ETD']) expect(pl).toContain(x);
  });
  it('采购单：需方地址、交货日期；产地证：声明和说明；订舱 / 补料：结尾说明和签章栏', async () => {
    const s = seed();
    const po = await text(await renderPoExcel(s.orders[0], 'p4', s.partners));
    expect(po).toContain('No. 18 Haier Road');
    expect(po).toContain('交货日期');
    const co = await text(await renderCoExcel(s.orders[0]));
    expect(co).toContain('Rules of Origin');
    expect(co).toContain('第 12 栏由签发机构填写');
    const bk = await text(await renderShipExcel(s.orders[1], 'booking', 'FF'));
    expect(bk).toContain('Please confirm the booking');
    expect(bk).toContain('Please arrange insurance for 110% of invoice value.');
    expect(bk).toContain('货代确认 Forwarder');
    const si = await text(await renderShipExcel(s.orders[1], 'si', 'FF'));
    expect(si).toContain('FREIGHT PREPAID · 3/3 ORIGINAL B/L');
    expect(si).toContain('Authorized Signature');
  });
});
