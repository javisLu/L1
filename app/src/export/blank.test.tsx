import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPdf, registerFonts } from './pdf';
import { renderExcel } from './excel';
import { renderShipExcel } from './shipexcel';
import { renderContractDocx } from './word';
import { blankForm } from '../domain/factory';
import { seed } from '../domain/seed';
import type { DocKey } from '../modules/defs';

registerFonts(resolve('public/fonts/NotoSansSC-Regular.ttf'), resolve('public/fonts/NotoSansSC-Bold.ttf'));

const blank = () => blankForm(seed().seller);
const cellsText = async (u8: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(u8 as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.worksheets[0].eachRow((row) => row.eachCell((c) => out.push(String(c.value ?? ''))));
  return out.join('\n');
};

describe('单据模板库：空白模板', () => {
  it('空白单据只有我方信息，没有货物、编号、条款数值', () => {
    const o = blank();
    expect(o.seller.name).toBe(seed().seller.name);
    expect(o.items).toEqual([]);
    expect(o.numbers.pi).toBe('');
    expect(o.terms.incoterm).toBe('');
    expect(o.terms.paymentText).toBe('');
    expect(o.contractClauses.length).toBeGreaterThan(0);
  });

  for (const doc of ['quote', 'pi', 'contract', 'po', 'ci', 'pl', 'booking', 'si', 'advice', 'customs'] as DocKey[]) {
    it(`空白 PDF：${doc}`, async () => {
      const buf = await renderToBuffer(buildPdf(blank(), doc));
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/blank-${doc}.pdf`, buf);
    }, 30000);
  }

  it('空白 Excel：没有 0.00 合计、没有 ZERO 大写；货物表留空行', async () => {
    for (const doc of ['quote', 'pi', 'ci', 'pl', 'customs'] as const) {
      const t = await cellsText(await renderExcel(blank(), doc));
      expect(t).not.toMatch(/ZERO|SAY TOTAL/);
      expect(t).toContain(doc === 'customs' ? seed().seller.nameCn : seed().seller.name);
    }
    for (const doc of ['booking', 'si'] as const) {
      const t = await cellsText(await renderShipExcel(blank(), doc));
      expect(t).not.toMatch(/0 CARTONS|0\.00 KGS|SAY TOTAL/);
    }
  });

  it('空白 Word 合同', async () => {
    const buf = await renderContractDocx(blank(), { logo: '', stamp: '', signature: '' });
    expect(buf.length).toBeGreaterThan(1000);
  });
});
