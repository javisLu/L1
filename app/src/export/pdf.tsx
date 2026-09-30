import { Document, Font, Page, Text, View, pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { PdfProvider, type PdfImpl, type St } from '../docs/primitives';
import { DocView } from '../docs/templates';
import { DOCNAMES, docFile, type DocKey } from '../modules/defs';
import type { Order } from '../domain/types';

const FONT = 'NotoSansSC';
let fontsReady = false;

/** 注册内嵌中文字体（Noto Sans SC，OFL 协议）。浏览器 / 桌面版从 fonts/ 目录加载，测试时传入文件路径 */
export function registerFonts(regular?: string, bold?: string) {
  if (fontsReady) return;
  const base = typeof document !== 'undefined' ? document.baseURI : '';
  Font.register({
    family: FONT,
    fonts: [
      { src: regular ?? new URL('fonts/NotoSansSC-Regular.ttf', base).href, fontWeight: 400 },
      { src: bold ?? new URL('fonts/NotoSansSC-Bold.ttf', base).href, fontWeight: 700 },
    ],
  });
  // 中文没有空格分词：把中日韩字符拆成单字，允许在任意两字之间换行（不加连字符）
  Font.registerHyphenationCallback((word) =>
    /[⺀-鿿豈-﫿＀-￯　-〿]/.test(word) ? Array.from(word).flatMap((c) => [c, '']) : [word],
  );
  fontsReady = true;
}

/** DOM 样式 → react-pdf 样式：去掉 px、background 改 backgroundColor、字重归为 400/700，丢弃 PDF 不支持的属性 */
export function toPdfStyle(s: St): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(s)) {
    if (raw == null || k.startsWith('--')) continue;
    if (['display', 'whiteSpace', 'fontStyle', 'fontFamily', 'cursor'].includes(k)) continue;
    const v = typeof raw === 'string' ? raw.replace(/(\d)px/g, '$1') : raw;
    if (k === 'background') out.backgroundColor = v;
    else if (k === 'fontWeight') out.fontWeight = v === 'bold' || Number(v) >= 600 ? 700 : 400;
    else out[k] = v;
  }
  // react-pdf 会把继承来的倍数行距按父级字号换算成固定值；自带字号的元素要按自己的字号重新计算
  if (out.fontSize != null && out.lineHeight == null) out.lineHeight = 1.45;
  return out;
}

const impl: PdfImpl = {
  View: View as unknown as PdfImpl['View'],
  Text: Text as unknown as PdfImpl['Text'],
  Page: ((props: { style?: unknown; children?: React.ReactNode }) => (
    <Page size="A4" style={[props.style, { fontFamily: FONT }] as never}>{props.children}</Page>
  )) as PdfImpl['Page'],
  style: toPdfStyle,
};

export function buildPdf(order: Order, doc: DocKey): ReactElement {
  return (
    <Document title={`${DOCNAMES[doc]} ${docFile(order, doc)}`} author={order.seller.name} creator="外贸超级工作台" producer="外贸超级工作台">
      <PdfProvider value={impl}>
        <DocView doc={doc} order={order} />
      </PdfProvider>
    </Document>
  );
}

export async function renderPdf(order: Order, doc: DocKey): Promise<Uint8Array> {
  registerFonts();
  const blob = await pdf(buildPdf(order, doc)).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
