import * as pdfjs from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = worker;

/**
 * 读出 PDF 里的文字（按行拼起来）。只对能选中文字的 PDF 有效；扫描件（图片）读出来是空的。
 * 同一行的文字片段按 y 坐标归到一起，按 x 排序，片段之间留空格。
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      (rows.get(y) ?? rows.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str });
    }
    const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((x) => x.s).join(' '));
    pages.push(lines.join('\n'));
  }
  await doc.destroy();
  return pages.join('\n\n');
}
