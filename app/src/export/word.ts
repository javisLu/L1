import {
  AlignmentType, BorderStyle, Document, HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, Packer, Paragraph, ShadingType, Table,
  TableCell, TableRow, TextRun, TextWrappingType, VerticalPositionRelativeFrom, WidthType,
} from 'docx';
import { THEMES } from '../domain/constants';
import { amountWords, int, money, needAddr, sym, calcOrder } from '../domain/calc';
import type { Order } from '../domain/types';
import type { DocAssets } from '../docs/primitives';
import { fit, imageInfo, type ImgInfo } from './images';

const EMU = 9525; // 每像素
/** 浮动图片：不占文字位置，叠在文字上方（Logo 在标题左侧，公章压在签字线上） */
const floatImage = (img: ImgInfo, size: { width: number; height: number }, pos: { x: number; y: number; margin?: boolean }) =>
  new ImageRun({
    type: img.ext === 'png' ? 'png' : 'jpg',
    data: img.bytes,
    transformation: size,
    floating: {
      horizontalPosition: pos.margin ? { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.LEFT } : { relative: HorizontalPositionRelativeFrom.COLUMN, offset: pos.x * EMU },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: pos.y * EMU },
      wrap: { type: TextWrappingType.NONE },
      allowOverlap: true,
      layoutInCell: true,
    },
  });

const FONT = { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'SimSun', cs: 'Arial' };
const run = (text: string, opt: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, bold: opt.bold, italics: opt.italics, size: (opt.size ?? 10) * 2, color: opt.color });
/** 支持换行的文字 */
const runs = (text: string, opt: Parameters<typeof run>[1] = {}) =>
  String(text ?? '').split('\n').flatMap((t, i) => (i ? [new TextRun({ break: 1 }), run(t, opt)] : [run(t, opt)]));
const para = (children: (TextRun | ImageRun)[], opt: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number } = {}) =>
  new Paragraph({ children, alignment: opt.align, spacing: { after: opt.after ?? 60, before: opt.before ?? 0 } });

const border = { style: BorderStyle.SINGLE, size: 4, color: 'C9CFD8' };
const borders = { top: border, bottom: border, left: border, right: border };

/** 销售合同 Word 版：与软件内合同一致（订单数据生成的条款 + 可自定义条款），方便客户继续修改 */
export async function renderContractDocx(o: Order, assets?: DocAssets): Promise<Uint8Array> {
  const k = calcOrder(o);
  const c = o.terms.currency;
  const acc = (THEMES[o.docset.theme] ?? '#1d3f72').slice(1);

  const cell = (text: string, opt: { head?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width: number; bold?: boolean; sub?: string }) =>
    new TableCell({
      width: { size: opt.width, type: WidthType.PERCENTAGE },
      borders,
      shading: opt.head ? { type: ShadingType.CLEAR, fill: acc, color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [
        new Paragraph({ alignment: opt.align, children: runs(text, { bold: opt.head || opt.bold, size: 9, color: opt.head ? 'FFFFFF' : undefined }) }),
        ...(opt.sub ? [new Paragraph({ alignment: opt.align, children: runs(opt.sub, { size: 8, color: '777777' }) })] : []),
      ],
    });
  const W = [8, 42, 15, 15, 20];
  const header = new TableRow({
    tableHeader: true,
    children: ['序号\nNo.', '品名及规格\nCommodity & Specification', '数量\nQuantity', `单价 (${c})\nUnit Price`, `金额 (${c})\nAmount`].map((t, i) =>
      cell(t, { head: true, width: W[i], align: AlignmentType.CENTER })),
  });
  const rows = k.rows.map((r, i) => new TableRow({
    children: [
      cell(String(i + 1), { width: W[0], align: AlignmentType.CENTER }),
      cell(r.nameEn, { width: W[1], sub: [r.model, r.spec].filter(Boolean).join(' · ') }),
      cell(`${int(r.q)} ${r.unit}`, { width: W[2], align: AlignmentType.RIGHT }),
      cell(money(r.p), { width: W[3], align: AlignmentType.RIGHT }),
      cell(money(r.a), { width: W[4], align: AlignmentType.RIGHT, bold: true }),
    ],
  }));
  const total = new TableRow({
    children: [
      new TableCell({ columnSpan: 2, width: { size: W[0] + W[1], type: WidthType.PERCENTAGE }, borders, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [para(runs(`总计 TOTAL ${(o.terms.incoterm + ' ' + o.terms.place).toUpperCase()}`, { bold: true, size: 9 }))] }),
      cell(`${k.ctns} CTNS`, { width: W[2], align: AlignmentType.RIGHT, bold: true }),
      cell('', { width: W[3] }),
      cell(sym(c) + money(k.amount), { width: W[4], align: AlignmentType.RIGHT, bold: true }),
    ],
  });

  const clauses: [string, string][] = [
    ['装运港 Port of Loading', o.terms.pol],
    ['目的港 Port of Destination', o.terms.pod],
    ['成交方式 Terms', `${o.terms.incoterm} ${o.terms.place} (Incoterms 2020)`],
  ];
  if (o.terms.deliveryAddress || needAddr(o)) clauses.push(['交货地点 Place of Delivery', o.terms.deliveryAddress]);
  clauses.push(
    ['包装 Packing', o.terms.packing],
    ['唛头 Shipping Marks', o.shipping.marks || 'N/M'],
    ['付款方式 Payment', o.terms.paymentText],
    ['装运期限 Shipment', `${o.terms.shipment}；分批 Partial: ${o.terms.partial}；转运 Transshipment: ${o.terms.transship}`],
    ['保险 Insurance', o.terms.insurance],
    ...o.contractClauses.filter((x) => x.on).map((x) => [x.title, x.body] as [string, string]),
  );
  const clauseParas = clauses.map(([t, v], i) =>
    new Paragraph({ spacing: { after: 80 }, indent: { left: 360, hanging: 360 }, children: [run(`${i + 1}. ${t}：`, { bold: true, size: 9.5 }), ...runs(v ?? '', { size: 9.5 })] }));

  const logo = imageInfo(assets?.logo ?? '');
  const stamp = o.docset.stamp ? imageInfo(assets?.stamp ?? '') : null;
  const sign = o.docset.stamp ? imageInfo(assets?.signature ?? '') : null;
  // 卖方一侧：公章盖在签字线上（不压住“卖方”标题），签名写在签字线上
  const sellerImages = [
    ...(stamp ? [floatImage(stamp, fit(stamp, 100, 100), { x: 165, y: 12 })] : []),
    ...(sign ? [floatImage(sign, fit(sign, 130, 42), { x: 190, y: 30 })] : []),
  ];
  const signCell = (label: string, images: ImageRun[] = []) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    children: [para([run(label, { bold: true }), ...images], { after: 600 }), para([run('签字 / 盖章 Signature & Seal: ____________________', { size: 9 })]), para([run('日期 Date: ____________________', { size: 9 })])],
  });

  const doc = new Document({
    creator: '外贸超级工作台',
    title: `销售合同 ${o.numbers.contract}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } },
      children: [
        para([...(logo ? [floatImage(logo, fit(logo, 140, 48), { x: 0, y: 0, margin: true })] : []), run('销 售 合 同', { bold: true, size: 20, color: acc })], { align: AlignmentType.CENTER, after: 40 }),
        para([run('SALES CONTRACT', { size: 10, color: '777777' })], { align: AlignmentType.CENTER, after: 240 }),
        para([run('合同号 Contract No.: ', { bold: true }), run(o.numbers.contract), run('        日期 Date: ', { bold: true }), run(o.numbers.date)]),
        para([run('签约地 Signed at: ', { bold: true }), run(o.numbers.signedAt)], { after: 160 }),
        para([run('卖方 SELLER: ', { bold: true }), run(o.seller.name)]),
        para([run('地址 Address: '), run(o.seller.address)]),
        para([run('电话 Tel: '), run(o.seller.phone)], { after: 120 }),
        para([run('买方 BUYER: ', { bold: true }), run(o.buyer.name)]),
        para([run('地址 Address: '), ...runs(o.buyer.address)]),
        para([run('电话 Tel: '), run(o.buyer.phone)], { after: 160 }),
        para([run('双方同意按下列条款由卖方出售、买方购进下述商品：')]),
        para([run('This Contract is made by and between the Buyer and the Seller, whereby the Buyer agrees to buy and the Seller agrees to sell the under-mentioned goods on the terms and conditions stated below:', { italics: true, color: '555555', size: 9 })], { after: 160 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows, total] }),
        para([run('金额大写 Amount in Words: ', { bold: true }), run(amountWords(k.amount, c), { bold: true })], { before: 160, after: 200 }),
        ...clauseParas,
        para([], { after: 300 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [signCell('卖方 THE SELLER', sellerImages), signCell('买方 THE BUYER')] })] }),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
