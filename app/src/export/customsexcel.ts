import ExcelJS from 'exceljs';
import { TRANSPORT_CD } from '../domain/constants';
import { calcOrder } from '../domain/calc';
import { codeName, curCn, unitCn, ymd8 } from '../domain/customsForm';
import { pkgSummary } from '../domain/package';
import { docFile } from '../modules/defs';
import type { Order, Partner } from '../domain/types';

const black = { style: 'thin' as const, color: { argb: 'FF333333' } };
const box = { top: black, left: black, bottom: black, right: black };
/** 报关单上的数字不加千位分隔，单价最多 4 位小数 */
const plain = (n: number, d: number) => String(Number((n || 0).toFixed(d)));

/** 报关单 Excel：和 PDF 一样按海关《出口货物报关单》的格子排（9 列，表头格子按列合并） */
export async function renderCustomsExcel(o: Order, partners: Partner[] = []): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  const ws = wb.addWorksheet('报关单', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [6, 13, 30, 14, 14, 10, 11, 12, 10].map((width) => ({ width }));
  const k = calcOrder(o), pk = pkgSummary(o, k), cd = o.customs;
  const broker = partners.find((p) => p.id === o.partners.broker);
  let r = 1;

  const text = (row: number, c1: number, c2: number, v: string, opt: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; border?: boolean } = {}) => {
    if (c2 > c1) ws.mergeCells(row, c1, row, c2);
    const cell = ws.getCell(row, c1);
    cell.value = v;
    cell.font = { name: 'Arial', size: opt.size ?? 9, bold: opt.bold };
    cell.alignment = { horizontal: opt.align ?? 'left', vertical: 'top', wrapText: true };
    if (opt.border) for (let c = c1; c <= c2; c++) ws.getCell(row, c).border = box;
  };
  /** 一格：小字栏目名 + 内容（和报关单一样写在同一格里） */
  const field = (c1: number, c2: number, label: string, v: string) => {
    if (c2 > c1) ws.mergeCells(r, c1, r, c2);
    const cell = ws.getCell(r, c1);
    cell.value = { richText: [{ text: label + '\n', font: { name: 'Arial', size: 7, color: { argb: 'FF666666' } } }, { text: v || ' ', font: { name: 'Arial', size: 9 } }] };
    cell.alignment = { vertical: 'top', wrapText: true };
    for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = box;
  };
  const row = (cells: [number, number, string, string][], lines = 2) => {
    cells.forEach(([a, b, l, v]) => field(a, b, l, v));
    const n = Math.max(lines, ...cells.map(([, , , v]) => String(v ?? '').split('\n').length + 1));
    ws.getRow(r).height = n * 12 + 4;
    r++;
  };

  text(r, 1, 9, '中华人民共和国海关出口货物报关单', { size: 15, bold: true, align: 'center' });
  ws.getRow(r).height = 26; r++;
  text(r, 1, 3, '预录入编号：'); text(r, 4, 7, '海关编号：'); text(r, 8, 9, `订单 ${o.no}`, { align: 'right' }); r++;

  const seller = [o.seller.nameCn, o.seller.tax].filter(Boolean).join('\n');
  row([[1, 3, '境内发货人', seller], [4, 4, '出境关别', cd.exportPort], [5, 5, '出口日期', ymd8(o.shipping.etd)], [6, 7, '申报日期', ''], [8, 9, '备案号', '']]);
  row([[1, 3, '境外收货人', o.buyer.name], [4, 4, '运输方式', TRANSPORT_CD[o.terms.transport] ?? ''], [5, 6, '运输工具名称及航次号', o.shipping.vessel], [7, 9, '提运单号', o.shipping.blNo]]);
  row([[1, 3, '生产销售单位', seller], [4, 4, '监管方式', codeName(cd.supervision)], [5, 5, '征免性质', codeName(cd.exemption)], [6, 9, '许可证号', cd.license]]);
  row([[1, 2, '合同协议号', o.numbers.contract], [3, 3, '贸易国（地区）', cd.tradeCountry], [4, 5, '运抵国（地区）', cd.destCountry], [6, 7, '指运港', o.terms.pod], [8, 9, '离境口岸', o.terms.pol]]);
  row([[1, 2, '包装种类', cd.packageType], [3, 3, '件数', pk.count ? String(pk.count) : ''], [4, 4, '毛重（千克）', k.rows.length ? plain(pk.gw, 2) : ''], [5, 5, '净重（千克）', k.rows.length ? plain(k.nw, 2) : ''], [6, 6, '成交方式', o.terms.incoterm], [7, 7, '运费', cd.freight], [8, 8, '保费', cd.insFee], [9, 9, '杂费', '']]);
  row([[1, 9, '随附单证及编号', cd.docs]]);
  row([[1, 9, '标记唛码及备注', o.shipping.marks || 'N/M']], 3);

  // 货物表：白底黑框
  ['项号', '商品编号', '商品名称及规格型号', '数量及单位', '单价/总价/币制', '原产国（地区）', '最终目的国（地区）', '境内货源地', '征免'].forEach((h, i) => text(r, i + 1, i + 1, h, { size: 8, align: 'center', border: true }));
  ws.getRow(r).height = 26; r++;
  const items = k.rows.length ? k.rows : null;
  (items ?? Array.from({ length: 6 }, () => null)).forEach((it, i) => {
    const vals = it
      ? [String(i + 1), it.hs, [it.nameCn, it.elements].filter(Boolean).join('\n'), `${plain(it.nwT, 2)}千克\n${plain(it.q, 4)}${unitCn(it.unit)}`, `${plain(it.p, 4)}\n${it.a.toFixed(2)}\n${curCn(o.terms.currency)}`, '中国', cd.destCountry, cd.sourceArea, '照章征税']
      : Array(9).fill('');
    vals.forEach((v, c) => text(r, c + 1, c + 1, v, { align: c === 0 || c >= 5 ? 'center' : c === 3 || c === 4 ? 'right' : 'left', border: true }));
    ws.getRow(r).height = 40; r++;
  });

  text(r, 1, 9, '特殊关系确认：　　　　价格影响确认：　　　　支付特许权使用费确认：　　　　自报自缴：', { border: true });
  ws.getRow(r).height = 18; r++;
  text(r, 1, 3, `报关人员　　　报关人员证号　　　电话\n\n申报单位  ${broker?.name ?? ''}`, { border: true });
  text(r, 4, 7, '兹申明对以上内容承担如实申报、依法纳税之法律责任\n\n　　　　　　　　申报单位（签章）', { border: true });
  text(r, 8, 9, '海关批注及签章', { border: true });
  ws.getRow(r).height = 62; r += 2;
  text(r, 1, 9, '说明：根据订单数据生成的预录入草稿，供报关行核对；「数量及单位」第一行为净重、第二行为成交数量，法定计量单位和数量以报关行按税则核定为准，正式以单一窗口申报为准。', { size: 8 });
  ws.getRow(r).height = 26;

  ws.headerFooter.oddFooter = `&L${docFile(o, 'customs')}&R&P / &N`;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
