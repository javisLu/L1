import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPdf, registerFonts } from './pdf';
import { seed } from '../domain/seed';
import { ringPng } from '../test/png';
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

describe('PDF 带 Logo、公章、签名', () => {
  it('图片嵌入 PDF', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    const order = seed().orders[0];
    const plain = await renderToBuffer(buildPdf(order, 'pi'));
    const buf = await renderToBuffer(buildPdf(order, 'pi', { logo: png, stamp: png, signature: png }));
    expect(buf.toString('latin1')).toContain('/Subtype /Image');
    expect(plain.toString('latin1')).not.toContain('/Subtype /Image');
  }, 30000);
  it('合同 PDF 也有 Logo（与公章、签名共 3 张图）', async () => {
    const ring = ringPng(), logo = ringPng(240, 80);
    const buf = await renderToBuffer(buildPdf(seed().orders[0], 'contract', { logo, stamp: ring, signature: ring }));
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/contract-img.pdf`, buf);
    expect(buf.toString('latin1').match(/\/Subtype \/Image/g)?.length).toBeGreaterThanOrEqual(3);
  }, 30000);
});
