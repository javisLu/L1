import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { renderExcel } from './excel';
import { renderContractDocx } from './word';
import { seed } from '../domain/seed';
import { ringPng } from '../test/png';
import { imageInfo } from './images';

const order = () => seed().orders[0];

describe('Excel 导出', () => {
  it('PI：明细、金额公式、合计公式', async () => {
    const buf = await renderExcel(order(), 'pi');
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT + '/pi.xlsx', buf);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    const cells: string[] = [];
    ws.eachRow((r) => r.eachCell((c) => cells.push(String((c.value as { formula?: string })?.formula ?? c.value))));
    expect(cells).toContain('PROFORMA INVOICE');
    expect(cells).toContain('Aluminium Display Rack - Standard');
    expect(cells.some((x) => /^F\d+\*G\d+$/.test(x))).toBe(true);
    expect(cells.some((x) => /^SUM\(H\d+:H\d+\)$/.test(x))).toBe(true);
    expect(cells).toContain('SAY US DOLLARS THREE THOUSAND SIX HUNDRED AND SEVENTY ONLY');
  });
  it('箱单、发票、报关、报价单都能生成', async () => {
    for (const d of ['pl', 'ci', 'customs', 'quote'] as const) {
      const buf = await renderExcel(order(), d);
      expect(buf.length).toBeGreaterThan(5000);
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${d}.xlsx`, buf);
    }
  });
});

describe('Word 导出', () => {
  it('合同包含编号、货物、自定义条款', async () => {
    const o = order();
    o.contractClauses.push({ id: 'x', k: 'custom', title: '环保要求 Environmental', body: '货物须符合 REACH 要求。', on: true });
    const buf = await renderContractDocx(o);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT + '/contract.docx', buf);
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const text = xml.replace(/<[^>]+>/g, '');
    expect(text).toContain('SC-2026-003');
    expect(text).toContain('Aluminium Display Rack - Heavy Duty');
    expect(text).toContain('环保要求 Environmental');
    expect(text).toContain('30% T/T deposit in advance');
  });
});

describe('Excel / Word 带 Logo、公章、签名', () => {
  const ring = ringPng(), logo = ringPng(240, 80);
  const assets = { logo, stamp: ring, signature: ring };
  const media = async (buf: Uint8Array, dir: string) => Object.keys((await JSZip.loadAsync(buf)).files).filter((f) => f.startsWith(dir) && /\.(png|jpe?g)$/.test(f));

  it('发票、箱单、PI、报价单 Excel 嵌入 Logo 与公章，报关表不放', async () => {
    for (const d of ['pi', 'quote', 'ci', 'pl'] as const) {
      const buf = await renderExcel(order(), d, assets);
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${d}-img.xlsx`, buf);
      expect((await media(buf, 'xl/media/')).length).toBeGreaterThanOrEqual(1);
      const drawing = await (await JSZip.loadAsync(buf)).file('xl/drawings/drawing1.xml')!.async('string');
      expect(drawing.match(/<xdr:pic>/g)?.length).toBe(3);
    }
    expect(await media(await renderExcel(order(), 'customs', assets), 'xl/media/')).toEqual([]);
  });
  it('订单关闭盖章时 Excel 只放 Logo', async () => {
    const o = order();
    o.docset.stamp = false;
    const drawing = await (await JSZip.loadAsync(await renderExcel(o, 'ci', assets))).file('xl/drawings/drawing1.xml')!.async('string');
    expect(drawing.match(/<xdr:pic>/g)?.length).toBe(1);
  });
  it('Word 合同嵌入 Logo、公章、签名', async () => {
    const buf = await renderContractDocx(order(), assets);
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT + '/contract-img.docx', buf);
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    expect(xml.match(/<wp:anchor/g)?.length).toBe(3);
    expect((await media(buf, 'word/media/')).length).toBeGreaterThanOrEqual(1);
    const plain = await (await JSZip.loadAsync(await renderContractDocx(order()))).file('word/document.xml')!.async('string');
    expect(plain).not.toContain('<wp:anchor');
  });
  it('读取 PNG / JPEG 尺寸', () => {
    expect(imageInfo(logo)).toMatchObject({ ext: 'png', w: 240, h: 80 });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 30, 0, 50, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    let bin = '';
    jpg.forEach((b) => (bin += String.fromCharCode(b)));
    expect(imageInfo('data:image/jpeg;base64,' + btoa(bin))).toMatchObject({ ext: 'jpeg', w: 50, h: 30 });
    expect(imageInfo('')).toBeNull();
  });
});

describe('订舱委托书 / SI Excel', () => {
  it('包含收货人、通知人、运费、件毛体', async () => {
    const { renderShipExcel } = await import('./shipexcel');
    const o = seed().orders[1];
    for (const d of ['booking', 'si'] as const) {
      const buf = await renderShipExcel(o, d, '宁波远航货代');
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${d}.xlsx`, buf);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf.buffer as ArrayBuffer);
      const cells: string[] = [];
      wb.worksheets[0].eachRow((r) => r.eachCell((c) => cells.push(String(c.value))));
      const all = cells.join('\n');
      expect(all).toContain('ABC Trading LLC');
      expect(all).toContain('FREIGHT PREPAID');
      expect(all).toMatch(/CARTONS/);
      if (d === 'booking') { expect(all).toContain('宁波远航货代'); expect(all).toContain('1×40HQ'); expect(all).toContain('请代为投保'); }
      else expect(all).toContain('CSNU7234561');
    }
  });
});

