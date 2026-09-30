import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { writeFileSync } from 'node:fs';
import { renderExcel } from './excel';
import { renderContractDocx } from './word';
import { seed } from '../domain/seed';

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
