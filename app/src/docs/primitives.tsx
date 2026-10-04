import { createContext, useContext, type ComponentType, type CSSProperties, type ReactNode } from 'react';

/**
 * 单据排版积木。模板只用 Box / Row / Txt / Fld / Page 书写，样式限定在 flex 布局子集，
 * 坐标单位按 A4 = 595 × 842（pt）计。默认渲染为 DOM 预览；
 * 在 PdfProvider 内渲染时改用 @react-pdf/renderer 的组件，输出矢量 PDF —— 预览与导出共用同一套模板。
 */
export type St = CSSProperties;

/** PDF 渲染实现（由导出模块在运行时注入，避免主包加载 PDF 库） */
export interface PdfImpl {
  View: ComponentType<{ style?: unknown; wrap?: boolean; children?: ReactNode }>;
  Text: ComponentType<{ style?: unknown; children?: ReactNode }>;
  Page: ComponentType<{ size?: string | [number, number]; style?: unknown; children?: ReactNode }>;
  Image: ComponentType<{ src: string; style?: unknown }>;
  style: (s: St) => unknown;
}
const Pdf = createContext<PdfImpl | null>(null);
export const PdfProvider = Pdf.Provider;

/** 公司 Logo、公章、签名图片（来自「设置」），预览与 PDF 共用 */
export interface DocAssets { logo: string; stamp: string; signature: string }
const AssetsCtx = createContext<DocAssets>({ logo: '', stamp: '', signature: '' });
export const AssetsProvider = AssetsCtx.Provider;
export const useAssets = () => useContext(AssetsCtx);

export function Img({ src, style }: { src: string; style?: St }) {
  const pdf = useContext(Pdf);
  // 限制了最大宽度时保持原图比例（不压扁），靠左对齐
  if (pdf) return <pdf.Image src={src} style={[pdf.style(style ?? {}), { objectFit: 'contain', objectPositionX: 0 }] as never} />;
  return <img src={src} alt="" style={{ display: 'block', objectFit: 'contain', ...style }} />;
}
/** 是否在渲染导出用的 PDF（预览专用的提示元素在 PDF 里不输出） */
export const useIsPdf = () => useContext(Pdf) != null;

const InText = createContext(false);

export function Box({ style, children, keep }: { style?: St; children?: ReactNode; keep?: boolean }) {
  const pdf = useContext(Pdf);
  const st: St = { display: 'flex', flexDirection: 'column', ...style };
  if (pdf) return <pdf.View style={pdf.style(st)} {...(keep ? { wrap: false } : {})}>{children}</pdf.View>;
  return <div style={st}>{children}</div>;
}

/** keep：PDF 分页时整行不拆开（表格行、签字栏） */
export function Row({ style, children, keep }: { style?: St; children?: ReactNode; keep?: boolean }) {
  const pdf = useContext(Pdf);
  const st: St = { display: 'flex', flexDirection: 'row', ...style };
  if (pdf) return <pdf.View style={pdf.style(st)} {...(keep ? { wrap: false } : {})}>{children}</pdf.View>;
  return <div style={st}>{children}</div>;
}

export function Txt({ style, children }: { style?: St; children?: ReactNode }) {
  const pdf = useContext(Pdf);
  if (pdf) return <pdf.Text style={pdf.style(style ?? {})}>{children}</pdf.Text>;
  const nested = useContext(InText);
  const Tag = nested ? 'span' : 'div';
  return (
    <InText.Provider value>
      <Tag style={style}>{children}</Tag>
    </InText.Provider>
  );
}

/** 可点击字段：点预览上的内容跳到对应输入框；空值显示红色占位 */
export function Fld({ p, v, ph = '待填写', style }: { p: string; v: unknown; ph?: string; style?: St }) {
  const pdf = useContext(Pdf);
  const s = v == null ? '' : String(v);
  const empty = !s.trim();
  // 导出的 PDF 里空字段留白，不打印占位提示
  if (pdf) return <pdf.Text style={pdf.style(style ?? {})}>{empty ? '' : s}</pdf.Text>;
  return (
    <span className={'fld' + (empty ? ' miss' : '')} data-f={p} style={{ whiteSpace: 'pre-line', ...style }}>
      {empty ? ph : s}
    </span>
  );
}

/** 单据页面：默认 A4；箱贴等可指定页面尺寸（pt）和页边距 */
export function Page({ accent, children, size, pad = '38px 42px 44px' }: { accent: string; children: ReactNode; size?: [number, number]; pad?: string }) {
  const pdf = useContext(Pdf);
  if (pdf) {
    return (
      <pdf.Page size={size ?? 'A4'} style={pdf.style({ padding: pad, color: '#1a1d22', fontSize: 8, lineHeight: 1.45 })}>
        {children}
      </pdf.Page>
    );
  }
  return (
    <div
      className="paper"
      style={{
        width: size?.[0] ?? 595, minHeight: size?.[1] ?? 842, padding: pad, background: '#fff', color: '#1a1d22',
        fontFamily: 'var(--f-doc)', fontSize: 8, lineHeight: 1.45, display: 'flex', flexDirection: 'column',
        ['--acc' as string]: accent,
      }}
    >
      {children}
    </div>
  );
}

/* ---------- 表格 ---------- */
export interface Col { label: ReactNode; w: string; align?: 'left' | 'center' | 'right' }

const cellBase = (c: Col, accent: string, headRow: boolean): St => ({
  width: c.w, flexShrink: 0, padding: '4px 4px', borderRight: '0.75px solid ' + (headRow ? accent : '#d6dae0'),
  textAlign: c.align ?? 'left', justifyContent: headRow ? 'center' : 'flex-start',
});

export function Table({
  cols, rows, accent, foot, lead,
}: {
  cols: Col[];
  rows: ReactNode[][];
  accent: string;
  /** 合计行：各格自带宽度（占整表百分比） */
  foot?: { w: string; align?: Col['align']; c: ReactNode }[];
  /** 左侧跨行的一列（如唛头），宽度与内容 */
  lead?: { label: ReactNode; w: string; content: ReactNode };
}) {
  const bodyW = lead ? `${100 - parseFloat(lead.w)}%` : '100%';
  const colsIn = lead ? cols.map((c) => ({ ...c, w: `${(parseFloat(c.w) / parseFloat(bodyW)) * 100}%` })) : cols;
  const header = (
    <Row style={{ background: accent, color: '#fff', fontWeight: 600, fontSize: 7, borderBottom: '0.75px solid ' + accent }}>
      {lead && <Box style={{ ...cellBase({ label: '', w: lead.w, align: 'center' }, accent, true) }}><Txt>{lead.label}</Txt></Box>}
      <Row style={{ width: bodyW }}>
        {colsIn.map((c, i) => (
          <Box key={i} style={cellBase(c, accent, true)}><Txt style={{ textAlign: c.align ?? 'center' }}>{c.label}</Txt></Box>
        ))}
      </Row>
    </Row>
  );
  const body = (
    <Box style={{ width: bodyW }}>
      {rows.map((r, ri) => (
        <Row key={ri} keep style={{ borderBottom: '0.75px solid #d6dae0' }}>
          {r.map((cell, ci) => (
            <Box key={ci} style={cellBase(colsIn[ci], accent, false)}><Txt style={{ textAlign: colsIn[ci].align ?? 'left', whiteSpace: 'pre-line' }}>{cell}</Txt></Box>
          ))}
        </Row>
      ))}
    </Box>
  );
  return (
    <Box style={{ borderLeft: '0.75px solid #cfd4db', borderTop: '0.75px solid #cfd4db' }}>
      {header}
      {lead ? (
        <Row>
          <Box style={{ ...cellBase({ label: '', w: lead.w }, accent, false), borderBottom: '0.75px solid #d6dae0' }}>{lead.content}</Box>
          {body}
        </Row>
      ) : body}
      {foot && (
        <Row style={{ background: '#f3f5f8', fontWeight: 700, borderBottom: '0.75px solid #d6dae0' }}>
          {foot.map((cell, ci) => (
            <Box key={ci} style={cellBase({ label: '', w: cell.w, align: cell.align }, accent, false)}><Txt style={{ textAlign: cell.align ?? 'left' }}>{cell.c}</Txt></Box>
          ))}
        </Row>
      )}
    </Box>
  );
}
