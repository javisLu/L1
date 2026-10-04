import { Box, Page, Row, Txt } from './primitives';
import { LABEL_LAYOUTS, cartonLabels, type CartonLabel } from '../domain/labels';
import { fixed, int } from '../domain/calc';
import type { LabelSettings, Order } from '../domain/types';

export interface LabelOptions extends LabelSettings {
  from?: number;
  to?: number;
  /** 预览只画前几页 */
  maxPages?: number;
}

/** 一张箱贴：正唛（含本箱箱号）+ 可选的货物信息 */
function Label({ l, w, h, info }: { l: CartonLabel; w: number; h: number; info: boolean }) {
  const lines = l.mark.split('\n');
  const longest = Math.max(4, ...lines.map((x) => x.length));
  const markH = (h - 16) * (info ? 0.62 : 0.92);
  const fs = Math.max(7, Math.min(22, markH / (lines.length * 1.35), (w - 18) / (longest * 0.62)));
  const small = Math.max(6, Math.min(10, fs * 0.55, h / 22));
  const infoLines = [
    l.name.startsWith('MIXED:') ? l.name : `ITEM: ${[l.model, l.name].filter(Boolean).join('  ')}`,
    `QTY: ${int(l.qty)} ${l.unit}`,
    `N.W.: ${fixed(l.nw, 2)} KGS   G.W.: ${fixed(l.gw, 2)} KGS`,
    ...(l.dims ? [`MEAS: ${l.dims}`] : []),
  ];
  return (
    <Box keep style={{ width: w, height: h, border: '1.5px solid #111', padding: '8px 9px', justifyContent: 'space-between', overflow: 'hidden' }}>
      <Box style={{ flexGrow: 1, justifyContent: 'center' }}>
        <Txt style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: fs, lineHeight: 1.35, whiteSpace: 'pre-line' }}>{l.mark}</Txt>
      </Box>
      {info && (
        <Box style={{ borderTop: '0.75px solid #111', paddingTop: 4 }}>
          {infoLines.map((t) => <Txt key={t} style={{ fontSize: small, lineHeight: 1.35 }}>{t}</Txt>)}
        </Box>
      )}
    </Box>
  );
}

/** 箱贴批量打印：每箱一张，按版式排到 A4 或标签纸上 */
export function Labels({ o, opt }: { o: Order; opt: LabelOptions }) {
  const lay = LABEL_LAYOUTS[opt.layout] ?? LABEL_LAYOUTS['a4-4'];
  const all = cartonLabels(o, opt.from ?? 1, opt.to ?? Infinity);
  const per = lay.cols * lay.rows;
  const [pw, ph] = lay.page;
  // 少算 1pt，避免小数误差让最后一行挤到下一页
  const w = Math.floor((pw - lay.margin * 2 - lay.gap * (lay.cols - 1)) / lay.cols) - 1;
  const h = Math.floor((ph - lay.margin * 2 - lay.gap * (lay.rows - 1)) / lay.rows) - 1;
  if (!all.length) {
    return (
      <Page accent="#111" size={lay.page} pad={`${lay.margin}px`}>
        <Txt style={{ fontSize: 11, color: '#b8322a', marginTop: 40, textAlign: 'center' }}>还没有箱数：请先在「箱单」里填写每箱装数量和箱规</Txt>
      </Page>
    );
  }
  const pages: CartonLabel[][] = [];
  for (let i = 0; i < all.length; i += per) pages.push(all.slice(i, i + per));
  return (
    <>
      {pages.slice(0, opt.maxPages ?? pages.length).map((pg, pi) => (
        <Page key={pi} accent="#111" size={lay.page} pad={`${lay.margin}px`}>
          {Array.from({ length: lay.rows }, (_, ri) => {
            const row = pg.slice(ri * lay.cols, ri * lay.cols + lay.cols);
            if (!row.length) return null;
            return (
              <Row key={ri} style={{ marginBottom: ri < lay.rows - 1 ? lay.gap : 0 }}>
                {row.map((l, ci) => (
                  <Box key={l.n} style={{ marginRight: ci < lay.cols - 1 ? lay.gap : 0 }}>
                    <Label l={l} w={w} h={h} info={opt.info} />
                  </Box>
                ))}
              </Row>
            );
          })}
        </Page>
      ))}
    </>
  );
}
