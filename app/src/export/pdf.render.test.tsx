import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPdf, registerFonts } from './pdf';
import { seed } from '../domain/seed';
import type { DocKey } from '../modules/defs';

registerFonts(resolve('public/fonts/NotoSansSC-Regular.ttf'), resolve('public/fonts/NotoSansSC-Bold.ttf'));

describe('PDF 导出', () => {
  const order = seed().orders[0];
  for (const doc of ['quote', 'pi', 'contract', 'ci', 'pl', 'customs', 'marks'] as DocKey[]) {
    it(`生成 ${doc}`, async () => {
      const buf = await renderToBuffer(buildPdf(order, doc));
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buf.length).toBeLessThan(400_000);
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${doc}.pdf`, buf);
    }, 30000);
  }
});
