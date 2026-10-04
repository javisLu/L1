import type { ReactNode } from 'react';
import { AssetsProvider, Box, Fld, Img, Page, Row, Table, Txt, useAssets, useIsPdf, type DocAssets, type St } from './primitives';
import { THEMES, TRANSPORT_CD } from '../domain/constants';
import { amountWords, fixed, int, intWords, money, needAddr, sym, calcOrder, toNum, type Row as CalcRow } from '../domain/calc';
import { getPath } from '../store/data';
import type { Order } from '../domain/types';
import type { DocKey } from '../modules/defs';
import { Labels, type LabelOptions } from './labels';

const MONO = 'var(--f-doc-num)';
const accent = (o: Order) => THEMES[o.docset.theme] ?? '#1d3f72';
const F = (o: Order, p: string, ph?: string) => <Fld p={p} v={getPath(o, p)} ph={ph} />;
const B = ({ children }: { children: ReactNode }) => <Txt style={{ fontWeight: 700 }}>{children}</Txt>;

function Head({ o, title, meta }: { o: Order; title: string; meta: [string, ReactNode][] }) {
  const a = accent(o);
  const { logo } = useAssets();
  return (
    <>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Row style={{ width: '56%', alignItems: 'flex-start' }}>
          {!!logo && <Img src={logo} style={{ height: 40, maxWidth: 110, marginRight: 10 }} />}
          <Box style={{ flexGrow: 1, flexShrink: 1, color: '#444' }}>
            <Txt style={{ fontSize: 11, fontWeight: 700, color: a, marginBottom: 3 }}>{F(o, 'seller.name')}</Txt>
            <Txt>{F(o, 'seller.address')}</Txt>
            <Txt>Tel: {F(o, 'seller.phone')}   Email: {F(o, 'seller.email')}</Txt>
          </Box>
        </Row>
        <Box style={{ alignItems: 'flex-end' }}>
          <Txt style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1, color: a, marginBottom: 6 }}>{title}</Txt>
          {meta.map(([l, v]) => (
            <Row key={l} style={{ justifyContent: 'flex-end' }}>
              <Txt style={{ color: '#777', marginRight: 6 }}>{l}</Txt>
              <Txt style={{ fontFamily: MONO, fontSize: 7.5, minWidth: 80 }}>{v}</Txt>
            </Row>
          ))}
        </Box>
      </Row>
      <Box style={{ height: 2.2, background: a, margin: '12px 0 13px' }} />
    </>
  );
}

const boxSt: St = { border: '0.75px solid #d9dde3', padding: '7px 9px', width: '48.5%' };
const Lab = ({ o, children }: { o: Order; children: ReactNode }) => (
  <Txt style={{ fontSize: 6.5, letterSpacing: 1.2, color: accent(o), fontWeight: 700, marginBottom: 3 }}>{children}</Txt>
);

function BuyerBox({ o, label }: { o: Order; label: string }) {
  return (
    <Box style={boxSt}>
      <Lab o={o}>{label}</Lab>
      <Txt style={{ fontWeight: 700 }}>{F(o, 'buyer.name', '[买方公司名称]')}</Txt>
      <Txt>{F(o, 'buyer.address', '[买方地址]')}</Txt>
      <Txt>Attn: {F(o, 'buyer.contact', '—')}   Tel: {F(o, 'buyer.phone', '—')}</Txt>
      {!!o.buyer.email && <Txt>{F(o, 'buyer.email')}</Txt>}
      {!!o.buyer.tax && <Txt>Tax/VAT: {F(o, 'buyer.tax')}</Txt>}
    </Box>
  );
}

function ShipBox({ o }: { o: Order }) {
  return (
    <Box style={boxSt}>
      <Lab o={o}>SHIPMENT</Lab>
      <Txt>From {F(o, 'terms.pol')} to {F(o, 'terms.pod', '[目的港]')}</Txt>
      <Txt>By {F(o, 'shipping.vessel', '[船名航次]')}</Txt>
      <Txt>B/L No.: {F(o, 'shipping.blNo', '[提单号]')}   ETD: {F(o, 'shipping.etd', '—')}</Txt>
      <Txt>Container: {F(o, 'shipping.container', '—')}</Txt>
      {!!o.terms.deliveryAddress && needAddr(o) && <Txt>Deliver to: {F(o, 'terms.deliveryAddress')}</Txt>}
    </Box>
  );
}

const Two = ({ children }: { children: ReactNode }) => <Row style={{ justifyContent: 'space-between', marginBottom: 11 }}>{children}</Row>;

function Words({ o, children }: { o: Order; children: ReactNode }) {
  return (
    <Box style={{ margin: '8px 0', padding: '6px 8px', borderLeft: '2.2px solid ' + accent(o), background: '#f6f7f9' }}>
      <Txt style={{ fontWeight: 600 }}>{children}</Txt>
    </Box>
  );
}

function Section({ o, title, children }: { o: Order; title: string; children: ReactNode }) {
  return (
    <Box style={{ marginTop: 11 }}>
      <Txt style={{ fontSize: 7, letterSpacing: 1.2, color: accent(o), fontWeight: 700, marginBottom: 3 }}>{title}</Txt>
      {children}
    </Box>
  );
}

function Sign({ o, left, right }: { o: Order; left: ReactNode; right: ReactNode }) {
  const isPdf = useIsPdf();
  const assets = useAssets();
  const line = (seller: boolean) => (
    <Box style={{ height: 42, borderBottom: '0.75px solid #333', marginBottom: 3, position: 'relative' }}>
      {seller && o.docset.stamp && !!assets.stamp && (
        <Img src={assets.stamp} style={{ position: 'absolute', left: 8, bottom: -18, width: 76, height: 76 }} />
      )}
      {seller && o.docset.stamp && !!assets.signature && (
        <Img src={assets.signature} style={{ position: 'absolute', left: 96, bottom: 3, height: 30, maxWidth: 120 }} />
      )}
      {/* 未上传公章时，预览里提示位置；导出的 PDF 不打印占位 */}
      {seller && o.docset.stamp && !assets.stamp && !isPdf && (
        <Box style={{ position: 'absolute', left: 14, bottom: 4, width: 52, height: 52, border: '1px dashed #b8322a', borderRadius: 26, alignItems: 'center', justifyContent: 'center', opacity: 0.75 }}>
          <Txt style={{ color: '#b8322a', fontSize: 6, textAlign: 'center' }}>{'公章位置\n设置里上传'}</Txt>
        </Box>
      )}
    </Box>
  );
  return (
    <Row keep style={{ justifyContent: 'space-between', marginTop: 26 }}>
      <Box style={{ width: '44%' }}>{line(true)}<Txt>{left}</Txt></Box>
      <Box style={{ width: '44%' }}>{line(false)}<Txt>{right}</Txt></Box>
    </Row>
  );
}

const EmptyRow = (n: number): ReactNode[][] => [[<Txt style={{ color: '#999' }}>尚未添加货物</Txt>, ...Array(n - 1).fill('')]];

/* ---------- 报价单 / PI ---------- */
function QuotePI({ o, kind }: { o: Order; kind: 'quote' | 'pi' }) {
  const k = calcOrder(o), c = o.terms.currency, a = accent(o);
  const meta: [string, ReactNode][] = kind === 'quote'
    ? [['No.', F(o, 'numbers.quote')], ['Date', F(o, 'numbers.date')], ['Valid Until', F(o, 'numbers.validUntil', '—')]]
    : [['No.', F(o, 'numbers.pi')], ['Date', F(o, 'numbers.date')], ['PO No.', F(o, 'numbers.po', '—')]];
  const term = (label: string, v: ReactNode, w = '33.3%') => (
    <Box style={{ width: w, marginBottom: 4, paddingRight: 8 }}>
      <Txt style={{ fontSize: 6, letterSpacing: 1, color: '#7b8594' }}>{label.toUpperCase()}</Txt>
      <Txt>{v}</Txt>
    </Box>
  );
  const rows = k.rows.map((r, i) => [
    String(i + 1),
    <Fld p={`items.${i}.model`} v={r.model} />,
    <><Fld p={`items.${i}.nameEn`} v={r.nameEn} ph="[品名]" />{'\n'}<Txt style={{ color: '#777', fontSize: 7 }}><Fld p={`items.${i}.spec`} v={r.spec} ph="规格" /></Txt></>,
    <Fld p={`items.${i}.unit`} v={r.unit} />,
    <Fld p={`items.${i}.qty`} v={r.q ? int(r.q) : ''} ph="0" />,
    <Fld p={`items.${i}.price`} v={r.p ? money(r.p) : ''} ph="0.00" />,
    <Txt style={{ fontWeight: 600 }}>{money(r.a)}</Txt>,
  ]);
  const clauses = o.docset.clauses.split('\n').filter((x) => x.trim());
  return (
    <Page accent={a}>
      <Head o={o} title={kind === 'quote' ? 'QUOTATION' : 'PROFORMA INVOICE'} meta={meta} />
      <Two>
        <BuyerBox o={o} label="TO / BUYER" />
        <Box style={boxSt}><Lab o={o}>BANK INFORMATION</Lab><Txt>{F(o, 'seller.bank', '[收款银行信息]')}</Txt></Box>
      </Two>
      <Row style={{ flexWrap: 'wrap', background: '#f4f6f9', padding: '7px 9px 3px', marginBottom: 11 }}>
        {term('Incoterms 2020', <>{F(o, 'terms.incoterm')} {F(o, 'terms.place')}</>)}
        {term('Payment', F(o, 'terms.paymentText'), '66.6%')}
        {term('Lead Time', F(o, 'terms.leadTime', '—'))}
        {term('Port of Loading', F(o, 'terms.pol'))}
        {term('Destination', F(o, 'terms.pod', '[目的港]'))}
        {term('Currency', F(o, 'terms.currency'))}
        {(!!o.terms.deliveryAddress || needAddr(o)) && term('Place of Delivery', F(o, 'terms.deliveryAddress', '[交货地址]'), '66.6%')}
      </Row>
      <Table
        accent={a}
        cols={[{ label: 'No.', w: '5%', align: 'center' }, { label: 'Model', w: '12%' }, { label: 'Description', w: '37%' }, { label: 'Unit', w: '7%', align: 'center' }, { label: 'Qty', w: '10%', align: 'right' }, { label: `Unit Price (${c})`, w: '13%', align: 'right' }, { label: `Amount (${c})`, w: '16%', align: 'right' }]}
        rows={rows.length ? rows : EmptyRow(7)}
        foot={[{ w: '61%', c: `TOTAL  ${(o.terms.incoterm + ' ' + o.terms.place).toUpperCase()}` }, { w: '10%', align: 'right', c: int(k.qty) }, { w: '13%', c: '' }, { w: '16%', align: 'right', c: sym(c) + money(k.amount) }]}
      />
      <Words o={o}>{amountWords(k.amount, c)}</Words>
      <Txt style={{ color: '#666' }}>Packing: {k.ctns} cartons  ·  G.W. {fixed(k.gw, 2)} kg  ·  Meas. {fixed(k.cbm, 3)} m³</Txt>
      {!!o.docset.remarks && <Section o={o} title="REMARKS">{F(o, 'docset.remarks')}</Section>}
      {clauses.length > 0 && (
        <Section o={o} title="TERMS & CONDITIONS">
          {clauses.map((x, i) => <Txt key={i}>{i + 1}. <Fld p="docset.clauses" v={x} /></Txt>)}
        </Section>
      )}
      <Sign o={o} left={<>For and on behalf of <B>{o.seller.name}</B></>} right={<>Accepted by <B>{o.buyer.name || 'the Buyer'}</B></>} />
    </Page>
  );
}

/* ---------- 销售合同 ---------- */
function Contract({ o }: { o: Order }) {
  const k = calcOrder(o), c = o.terms.currency, a = accent(o);
  const { logo } = useAssets();
  const base: [string, ReactNode][] = [
    ['装运港 Port of Loading', F(o, 'terms.pol')],
    ['目的港 Port of Destination', F(o, 'terms.pod', '[目的港]')],
    ['成交方式 Terms', <>{F(o, 'terms.incoterm')} {F(o, 'terms.place')} (Incoterms 2020)</>],
  ];
  if (o.terms.deliveryAddress || needAddr(o)) base.push(['交货地点 Place of Delivery', F(o, 'terms.deliveryAddress', '[交货地址]')]);
  base.push(
    ['包装 Packing', F(o, 'terms.packing')],
    ['唛头 Shipping Marks', F(o, 'shipping.marks', 'N/M')],
    ['付款方式 Payment', F(o, 'terms.paymentText')],
    ['装运期限 Shipment', <>{F(o, 'terms.shipment')}；分批 Partial: {F(o, 'terms.partial')}；转运 Transshipment: {F(o, 'terms.transship')}</>],
    ['保险 Insurance', F(o, 'terms.insurance')],
  );
  const clauses: [ReactNode, ReactNode][] = base.map(([t, v], i) => [`${i + 1}. ${t}`, v]);
  o.contractClauses.forEach((cl, i) => {
    if (cl.on) clauses.push([<>{clauses.length + 1}. <Fld p={`contractClauses.${i}.title`} v={cl.title} ph="[条款标题]" /></>, <Fld p={`contractClauses.${i}.body`} v={cl.body} ph="[条款内容]" />]);
  });
  const rows = k.rows.map((r, i) => [
    String(i + 1),
    <><Fld p={`items.${i}.nameEn`} v={r.nameEn} ph="[品名]" />{'\n'}<Txt style={{ color: '#777', fontSize: 7 }}><Fld p={`items.${i}.model`} v={r.model} /> · <Fld p={`items.${i}.spec`} v={r.spec} ph="规格" /></Txt></>,
    <><Fld p={`items.${i}.qty`} v={r.q ? int(r.q) : ''} ph="0" /> {r.unit}</>,
    <Fld p={`items.${i}.price`} v={r.p ? money(r.p) : ''} ph="0.00" />,
    <Txt style={{ fontWeight: 600 }}>{money(r.a)}</Txt>,
  ]);
  return (
    <Page accent={a}>
      {/* 有 Logo 时三栏：Logo | 标题 | 等宽留白，标题保持居中 */}
      <Row style={{ alignItems: 'center' }}>
        {!!logo && <Box style={{ width: 110, flexShrink: 0 }}><Img src={logo} style={{ height: 40, maxWidth: 110 }} /></Box>}
        <Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
          <Txt style={{ width: '100%', textAlign: 'center', fontSize: 18, fontWeight: 700, letterSpacing: 9, color: a }}>销售合同</Txt>
          <Txt style={{ width: '100%', textAlign: 'center', letterSpacing: 3, color: '#777', fontSize: 7.5, marginTop: 2 }}>SALES CONTRACT</Txt>
        </Box>
        {!!logo && <Box style={{ width: 110, flexShrink: 0 }} />}
      </Row>
      <Box style={{ height: 1.5, background: a, margin: '10px 0 12px' }} />
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Box>
          <Txt><B>合同号 Contract No.:</B> {F(o, 'numbers.contract')}</Txt>
          <Txt><B>签约地 Signed at:</B> {F(o, 'numbers.signedAt')}</Txt>
        </Box>
        <Txt><B>日期 Date:</B> {F(o, 'numbers.date')}</Txt>
      </Row>
      <Box style={{ marginBottom: 5 }}>
        <Txt><B>卖方 SELLER:</B> {F(o, 'seller.name')}</Txt>
        <Txt>地址 Address: {F(o, 'seller.address')}</Txt>
        <Txt>电话 Tel: {F(o, 'seller.phone')}</Txt>
      </Box>
      <Box style={{ marginBottom: 8 }}>
        <Txt><B>买方 BUYER:</B> {F(o, 'buyer.name', '[买方公司名称]')}</Txt>
        <Txt>地址 Address: {F(o, 'buyer.address', '[买方地址]')}</Txt>
        <Txt>电话 Tel: {F(o, 'buyer.phone', '—')}</Txt>
      </Box>
      <Box style={{ marginBottom: 8 }}>
        <Txt>双方同意按下列条款由卖方出售、买方购进下述商品：</Txt>
        <Txt style={{ color: '#555', fontStyle: 'italic' }}>This Contract is made by and between the Buyer and the Seller, whereby the Buyer agrees to buy and the Seller agrees to sell the under-mentioned goods on the terms and conditions stated below:</Txt>
      </Box>
      <Table
        accent={a}
        cols={[{ label: '序号 No.', w: '7%', align: 'center' }, { label: '品名及规格 Commodity & Specification', w: '43%' }, { label: '数量 Quantity', w: '15%', align: 'right' }, { label: `单价 (${c}) Unit Price`, w: '15%', align: 'right' }, { label: `金额 (${c}) Amount`, w: '20%', align: 'right' }]}
        rows={rows.length ? rows : EmptyRow(5)}
        foot={[{ w: '50%', c: `总计 TOTAL ${(o.terms.incoterm + ' ' + o.terms.place).toUpperCase()}` }, { w: '15%', align: 'right', c: `${k.ctns} CTNS` }, { w: '15%', c: '' }, { w: '20%', align: 'right', c: sym(c) + money(k.amount) }]}
      />
      <Words o={o}>金额大写 Amount in Words: {amountWords(k.amount, c)}</Words>
      <Box style={{ marginTop: 4 }}>
        {clauses.map(([t, v], i) => (
          <Row key={i} style={{ marginBottom: 2.5 }}>
            <Txt style={{ width: '30%', fontWeight: 600, paddingRight: 8 }}>{t}</Txt>
            <Txt style={{ width: '70%' }}>{v}</Txt>
          </Row>
        ))}
      </Box>
      <Sign o={o} left="卖方 THE SELLER" right="买方 THE BUYER" />
    </Page>
  );
}

/* ---------- 商业发票 ---------- */
function Invoice({ o }: { o: Order }) {
  const k = calcOrder(o), c = o.terms.currency, a = accent(o);
  const rows = k.rows.map((r, i) => [
    <><Fld p={`items.${i}.nameEn`} v={r.nameEn} ph="[品名]" />{'\n'}<Txt style={{ color: '#777', fontSize: 7 }}><Fld p={`items.${i}.model`} v={r.model} /> · HS <Fld p={`items.${i}.hs`} v={r.hs} ph="—" /></Txt></>,
    <><Fld p={`items.${i}.qty`} v={r.q ? int(r.q) : ''} ph="0" /> {r.unit}</>,
    <Fld p={`items.${i}.price`} v={r.p ? money(r.p) : ''} ph="0.00" />,
    <Txt style={{ fontWeight: 600 }}>{money(r.a)}</Txt>,
  ]);
  return (
    <Page accent={a}>
      <Head o={o} title="COMMERCIAL INVOICE" meta={[['Invoice No.', F(o, 'numbers.ci')], ['Date', F(o, 'numbers.date')], ['Contract No.', F(o, 'numbers.contract')], ['PO No.', F(o, 'numbers.po', '—')]]} />
      <Two><BuyerBox o={o} label="SOLD TO / CONSIGNEE" /><ShipBox o={o} /></Two>
      <Row style={{ background: '#f4f6f9', padding: '6px 9px', marginBottom: 11 }}>
        <Txt style={{ width: '33%' }}>Terms: {F(o, 'terms.incoterm')} {F(o, 'terms.place')}</Txt>
        <Txt style={{ width: '42%' }}>Payment: {F(o, 'terms.paymentText')}</Txt>
        <Txt style={{ width: '25%' }}>Origin: {F(o, 'shipping.origin')}</Txt>
      </Row>
      <Table
        accent={a}
        lead={{ label: 'Marks & Nos.', w: '17%', content: <Txt style={{ fontSize: 7 }}>{F(o, 'shipping.marks', 'N/M')}</Txt> }}
        cols={[{ label: 'Description of Goods', w: '43%' }, { label: 'Quantity', w: '13%', align: 'right' }, { label: `Unit Price (${c})`, w: '12%', align: 'right' }, { label: `Amount (${c})`, w: '15%', align: 'right' }]}
        rows={rows.length ? rows : EmptyRow(4)}
        foot={[{ w: '60%', c: 'TOTAL' }, { w: '13%', align: 'right', c: int(k.qty) }, { w: '12%', c: '' }, { w: '15%', align: 'right', c: sym(c) + money(k.amount) }]}
      />
      <Words o={o}>{amountWords(k.amount, c)}</Words>
      <Section o={o} title="DECLARATION">
        <Txt>We hereby certify that the information on this invoice is true and correct and that the contents of this shipment are as stated above.</Txt>
      </Section>
      <Sign o={o} left={<>For and on behalf of <B>{o.seller.name}</B></>} right="Authorized Signature" />
    </Page>
  );
}

/* ---------- 装箱单 ---------- */
function Packing({ o }: { o: Order }) {
  const k = calcOrder(o), a = accent(o);
  const packIdx = (r: CalcRow) => (o.packs ?? []).findIndex((p) => p.id === r.pack?.id);
  const cnoText = (r: CalcRow) => (r.from ? (r.from === r.to ? String(r.from) : `${r.from}-${r.to}`) : '—');
  const rows = k.rows.map((r, i) => {
    const pi = packIdx(r);
    const sub = r.pack
      ? <Txt style={{ color: '#777', fontSize: 7 }}>{r.model ? `${r.model} · ` : ''}MIXED · 混装 C/NO. {cnoText(r)}</Txt>
      : <Txt style={{ color: '#777', fontSize: 7 }}>{r.model} · <Fld p={`items.${i}.pcsPerCtn`} v={r.pcsPerCtn ? `${r.pcsPerCtn} ${r.unit}/CTN` : ''} ph="[每箱装]" /></Txt>;
    return [
      r.pack ? cnoText(r) : r.n ? `${r.from}-${r.to}` : '—',
      <><Fld p={`items.${i}.nameEn`} v={r.nameEn} ph="[品名]" />{'\n'}{sub}</>,
      int(r.q),
      r.pack ? (r.n ? String(r.n) : '') : String(r.n),
      <Fld p={`items.${i}.nw`} v={r.nwT ? fixed(r.nwT, 2) : ''} ph="0" />,
      <Fld p={r.pack ? `packs.${pi}.gw` : `items.${i}.gw`} v={r.gwT ? fixed(r.gwT, 2) : ''} ph="0" />,
      <Fld p={r.pack ? `packs.${pi}.l` : `items.${i}.l`} v={r.cbmT || (r.pack && toNum(r.pack.l)) ? fixed(r.cbmT, 3) : ''} ph="0" />,
    ];
  });
  const mixedNote = (o.packs ?? []).length > 0;
  return (
    <Page accent={a}>
      <Head o={o} title="PACKING LIST" meta={[['Invoice No.', F(o, 'numbers.ci')], ['Date', F(o, 'numbers.date')], ['Contract No.', F(o, 'numbers.contract')]]} />
      <Two><BuyerBox o={o} label="CONSIGNEE" /><ShipBox o={o} /></Two>
      <Table
        accent={a}
        lead={{ label: 'Marks', w: '15%', content: <Txt style={{ fontSize: 7 }}>{F(o, 'shipping.marks', 'N/M')}</Txt> }}
        cols={[{ label: 'C/No.', w: '8%', align: 'center' }, { label: 'Description', w: '29%' }, { label: 'Qty', w: '9%', align: 'right' }, { label: 'CTNs', w: '7%', align: 'right' }, { label: 'N.W. (kg)', w: '11%', align: 'right' }, { label: 'G.W. (kg)', w: '11%', align: 'right' }, { label: 'Meas. (m³)', w: '10%', align: 'right' }]}
        rows={rows.length ? rows : EmptyRow(7)}
        foot={[{ w: '52%', c: 'TOTAL' }, { w: '9%', align: 'right', c: int(k.qty) }, { w: '7%', align: 'right', c: String(k.ctns) }, { w: '11%', align: 'right', c: fixed(k.nw, 2) }, { w: '11%', align: 'right', c: fixed(k.gw, 2) }, { w: '10%', align: 'right', c: fixed(k.cbm, 3) }]}
      />
      <Words o={o}>SAY TOTAL {intWords(k.ctns)} ({k.ctns}) CARTONS ONLY</Words>
      {mixedNote && <Txt style={{ fontSize: 7, color: '#666', marginTop: 4 }}>Note: goods marked MIXED are packed together in the same carton(s); the carton gross weight is allocated to each item in proportion to its net weight.</Txt>}
      <Sign o={o} left={<>For and on behalf of <B>{o.seller.name}</B></>} right="Authorized Signature" />
    </Page>
  );
}

/* ---------- 报关预录入表 ---------- */
function CustomsDraft({ o }: { o: Order }) {
  const k = calcOrder(o), c = o.terms.currency, a = accent(o);
  const cell = (label: string, v: ReactNode, span = 1) => (
    <Box style={{ width: `${span * 25}%`, borderRight: '0.75px solid #333', borderBottom: '0.75px solid #333', padding: '3px 5px', minHeight: 28 }}>
      <Txt style={{ fontSize: 6.3, color: '#666' }}>{label}</Txt>
      <Txt style={{ whiteSpace: 'pre-line' }}>{v}</Txt>
    </Box>
  );
  const rows = k.rows.map((r, i) => [
    String(i + 1),
    <Fld p={`items.${i}.hs`} v={r.hs} ph="[编码]" />,
    <><Fld p={`items.${i}.nameCn`} v={r.nameCn} ph="[中文品名]" />{'\n'}<Txt style={{ color: '#777', fontSize: 7 }}><Fld p={`items.${i}.elements`} v={r.elements} ph="[申报要素]" /></Txt></>,
    `${int(r.q)} ${r.unit}\n净重 ${fixed(r.nwT, 2)} kg\n毛重 ${fixed(r.gwT, 2)} kg`,
    `${money(r.p)}\n${money(r.a)}\n${c}`,
    '中国',
    F(o, 'customs.destCountry', '—'),
    F(o, 'customs.sourceArea', '—'),
    '照章征税',
  ]);
  return (
    <Page accent={a}>
      <Box style={{ marginBottom: 6 }}>
        <Txt style={{ width: '100%', textAlign: 'center', fontSize: 13, fontWeight: 700, letterSpacing: 3 }}>出口报关资料预录入表</Txt>
        <Txt style={{ width: '100%', textAlign: 'center', color: '#777', fontSize: 7, letterSpacing: 1, marginTop: 2 }}>草稿 · 供报关行申报参考 · 以海关系统录入为准</Txt>
      </Box>
      <Row style={{ justifyContent: 'space-between', margin: '8px 0 5px', fontSize: 7, color: '#555' }}>
        <Txt>合同协议号 {F(o, 'numbers.contract')}</Txt><Txt>发票号 {F(o, 'numbers.ci')}</Txt><Txt>订单 {o.no}</Txt>
      </Row>
      <Box style={{ borderTop: '0.75px solid #333', borderLeft: '0.75px solid #333' }}>
        <Row>{cell('境内发货人', <>{F(o, 'seller.nameCn', '[中文名称]')}{'\n'}{F(o, 'seller.tax', '[信用代码]')}</>, 2)}{cell('出境关别', F(o, 'customs.exportPort'))}{cell('出口日期', F(o, 'shipping.etd', '—'))}</Row>
        <Row>{cell('境外收货人', F(o, 'buyer.name', '[境外收货人]'), 2)}{cell('运输方式', TRANSPORT_CD[o.terms.transport] ?? '—')}{cell('运输工具名称及航次号', F(o, 'shipping.vessel', '—'))}</Row>
        <Row>{cell('生产销售单位', F(o, 'seller.nameCn', '[中文名称]'), 2)}{cell('监管方式', F(o, 'customs.supervision'))}{cell('征免性质', F(o, 'customs.exemption'))}</Row>
        <Row>{cell('提运单号', F(o, 'shipping.blNo', '—'))}{cell('许可证号', F(o, 'customs.license', '—'))}{cell('贸易国（地区）', F(o, 'customs.tradeCountry', '—'))}{cell('运抵国（地区）', F(o, 'customs.destCountry', '—'))}</Row>
        <Row>{cell('指运港', F(o, 'terms.pod', '—'))}{cell('离境口岸', F(o, 'terms.pol'))}{cell('包装种类', F(o, 'customs.packageType'))}{cell('件数', `${k.ctns} 箱`)}</Row>
        <Row>{cell('毛重（千克）', fixed(k.gw, 2))}{cell('净重（千克）', fixed(k.nw, 2))}{cell('成交方式', F(o, 'terms.incoterm'))}{cell('运费 / 保费', <>{F(o, 'customs.freight', '—')} / {F(o, 'customs.insFee', '—')}</>)}</Row>
        <Row>{cell('随附单证', F(o, 'customs.docs', '—'), 4)}</Row>
        <Row>{cell('标记唛码及备注', F(o, 'shipping.marks', 'N/M'), 4)}</Row>
      </Box>
      <Box style={{ marginTop: 10 }}>
        <Table
          accent={a}
          cols={[{ label: '项号', w: '5%', align: 'center' }, { label: '商品编号', w: '12%' }, { label: '商品名称及规格型号', w: '26%' }, { label: '数量 / 净毛重', w: '16%', align: 'right' }, { label: '单价/总价/币制', w: '12%', align: 'right' }, { label: '原产国', w: '7%', align: 'center' }, { label: '最终目的国', w: '8%', align: 'center' }, { label: '境内货源地', w: '8%', align: 'center' }, { label: '征免', w: '6%', align: 'center' }]}
          rows={rows.length ? rows : EmptyRow(9)}
        />
      </Box>
      <Txt style={{ marginTop: 10, color: '#666', fontSize: 7 }}>说明：本表根据订单数据生成，供报关行核对与录入，不作为海关正式单证。</Txt>
    </Page>
  );
}

/* ---------- 唛头 ---------- */
function Marks({ o }: { o: Order }) {
  const k = calcOrder(o), a = accent(o), r = k.rows[0];
  const side = o.shipping.side || (r ? `DESCRIPTION: ${String(r.nameEn || '').toUpperCase()}\nQTY: ${r.pcsPerCtn} ${r.unit}/CTN\nN.W.: ${fixed(Number(r.nw) || 0, 2)} KGS\nG.W.: ${fixed(Number(r.gw) || 0, 2)} KGS\nMEAS: ${r.l}×${r.w}×${r.h} CM` : '');
  const box = (content: ReactNode, cap: string, small = false) => (
    <Box style={{ width: '48%' }}>
      <Box style={{ border: '2px solid #111', padding: '16px 12px', minHeight: 165, alignItems: small ? 'flex-start' : 'center', justifyContent: 'center' }}>
        <Txt style={{ width: '100%', fontFamily: MONO, fontWeight: 700, fontSize: small ? 10 : 13, lineHeight: 1.7, textAlign: small ? 'left' : 'center' }}>{content}</Txt>
      </Box>
      <Txt style={{ fontSize: 7.5, color: '#666', marginTop: 4, textAlign: 'center', letterSpacing: 1 }}>{cap}</Txt>
    </Box>
  );
  return (
    <Page accent={a}>
      <Head o={o} title="SHIPPING MARKS" meta={[['Order', o.no], ['PO No.', F(o, 'numbers.po', '—')], ['Cartons', `${k.ctns} CTNS`]]} />
      <Row style={{ justifyContent: 'space-between', marginTop: 14 }}>
        {box(F(o, 'shipping.marks', '[正唛]'), '正唛 MAIN MARK')}
        {box(<Fld p="shipping.side" v={side} ph="[侧唛]" />, '侧唛 SIDE MARK', true)}
      </Row>
      <Section o={o} title="PRINT PLAN">
        <Table
          accent={a}
          cols={[{ label: '品名', w: '60%' }, { label: '箱号段', w: '22%', align: 'center' }, { label: '张数', w: '18%', align: 'right' }]}
          rows={k.rows.map((x) => [x.nameEn, x.n ? `${x.from}-${x.to}` : '—', String(x.n)])}
          foot={[{ w: '82%', c: '合计（每箱一张，A4 每页 4 张）' }, { w: '18%', align: 'right', c: String(k.ctns) }]}
        />
      </Section>
    </Page>
  );
}

const NO_ASSETS: DocAssets = { logo: '', stamp: '', signature: '' };

const DEFAULT_LABELS: LabelOptions = { layout: 'a4-4', info: true };

export function DocView({ doc, order, assets = NO_ASSETS, labels = DEFAULT_LABELS }: { doc: DocKey; order: Order; assets?: DocAssets; labels?: LabelOptions }) {
  return <AssetsProvider value={assets}><DocBody doc={doc} order={order} labels={labels} /></AssetsProvider>;
}

function DocBody({ doc, order, labels }: { doc: DocKey; order: Order; labels: LabelOptions }) {
  switch (doc) {
    case 'quote': return <QuotePI o={order} kind="quote" />;
    case 'pi': return <QuotePI o={order} kind="pi" />;
    case 'contract': return <Contract o={order} />;
    case 'ci': return <Invoice o={order} />;
    case 'pl': return <Packing o={order} />;
    case 'customs': return <CustomsDraft o={order} />;
    case 'marks': return <Marks o={order} />;
    case 'labels': return <Labels o={order} opt={labels} />;
  }
}
