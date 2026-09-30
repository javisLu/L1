import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';

/**
 * 单据排版积木。模板只用 Box / Row / Txt / Fld 书写，样式限定在 flex 布局子集，
 * 坐标单位按 A4 = 595 × 842 计。现在渲染为 DOM 预览，M1-2 以同一套模板渲染矢量 PDF。
 */
export type St = CSSProperties;

const InText = createContext(false);

export function Box({ style, children }: { style?: St; children?: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>;
}

export function Row({ style, children }: { style?: St; children?: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'row', ...style }}>{children}</div>;
}

export function Txt({ style, children }: { style?: St; children?: ReactNode }) {
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
  const s = v == null ? '' : String(v);
  const empty = !s.trim();
  return (
    <span className={'fld' + (empty ? ' miss' : '')} data-f={p} style={{ whiteSpace: 'pre-line', ...style }}>
      {empty ? ph : s}
    </span>
  );
}

export function Page({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <div
      className="paper"
      style={{
        width: 595, minHeight: 842, padding: '38px 42px 44px', background: '#fff', color: '#1a1d22',
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
        <Row key={ri} style={{ borderBottom: '0.75px solid #d6dae0' }}>
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
