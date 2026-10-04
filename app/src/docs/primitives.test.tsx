import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Box, PdfProvider, Row, type PdfImpl } from './primitives';

describe('排版积木', () => {
  // react-pdf 把显式传入的 wrap={undefined} 当成「不可分页」，长表格会整块挪到下一页或被截掉
  it('不需要整块保持时不传 wrap 属性', () => {
    const seen: Record<string, unknown>[] = [];
    const View = (p: Record<string, unknown>) => { seen.push(p); return <i>{p.children as never}</i>; };
    const impl = { View, Text: View, Page: View, Image: View, style: (s: unknown) => s } as unknown as PdfImpl;
    renderToStaticMarkup(<PdfProvider value={impl}><Box /><Row /><Box keep /><Row keep /></PdfProvider>);
    expect(seen.map((p) => ('wrap' in p ? p.wrap : 'none'))).toEqual(['none', 'none', false, false]);
  });
});
