import ExcelJS from 'exceljs';
import { THEMES } from '../domain/constants';
import { calcOrder, money, needAddr, sym, toNum } from '../domain/calc';
import { pkgSummary } from '../domain/package';
import { isBlank, blTypeCn, blTypeText, consigneeText, containerRows, freightText, goodsLines, insureNeeded, notifyText, shipperText } from '../domain/shipping';
import { docFile } from '../modules/defs';
import type { Order } from '../domain/types';

const thin = { style: 'thin' as const, color: { argb: 'FF9AA3AE' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

/** 订舱委托书 / SI 提单补料 Excel：货代常要可编辑版本。四列网格（标签 | 内容 | 标签 | 内容） */
export async function renderShipExcel(o: Order, doc: 'booking' | 'si', forwarder = ''): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  const ws = wb.addWorksheet(doc === 'booking' ? '订舱委托书' : 'SI', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 18 }, { width: 34 }, { width: 18 }, { width: 34 }];
  const acc = 'FF' + (THEMES[o.docset.theme] ?? '#1d3f72').slice(1).toUpperCase();
  const k = calcOrder(o), pk = pkgSummary(o, k);
  let r = 1;
  const title = (t: string, size = 16) => {
    ws.mergeCells(r, 1, r, 4);
    const c = ws.getCell(r, 1);
    c.value = t; c.font = { name: 'Arial', bold: true, size, color: { argb: acc } }; c.alignment = { horizontal: 'center' };
    r++;
  };
  const lines = (v: string) => Math.max(1, String(v ?? '').split('\n').length);
  const label = (c: ExcelJS.Cell, t: string) => { c.value = t; c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF4B5563' } }; c.alignment = { vertical: 'top', wrapText: true }; c.border = box; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F8' } }; };
  const value = (c: ExcelJS.Cell, t: string) => { c.value = t; c.font = { name: 'Arial', size: 10 }; c.alignment = { vertical: 'top', wrapText: true }; c.border = box; };
  /** 一行两组；只给一组时内容跨三列 */
  const pair = (l1: string, v1: string, l2?: string, v2?: string) => {
    label(ws.getCell(r, 1), l1);
    if (l2 == null) { ws.mergeCells(r, 2, r, 4); value(ws.getCell(r, 2), v1); }
    else { value(ws.getCell(r, 2), v1); label(ws.getCell(r, 3), l2); value(ws.getCell(r, 4), v2 ?? ''); }
    ws.getRow(r).height = Math.max(18, Math.max(lines(v1), lines(v2 ?? '')) * 13 + 4);
    r++;
  };

  ws.mergeCells(r, 1, r, 4);
  ws.getCell(r, 1).value = o.seller.name; ws.getCell(r, 1).font = { name: 'Arial', bold: true, size: 12, color: { argb: acc } };
  r++;
  ws.mergeCells(r, 1, r, 4);
  ws.getCell(r, 1).value = [o.seller.address, o.seller.phone && `Tel: ${o.seller.phone}`, o.seller.email && `Email: ${o.seller.email}`].filter(Boolean).join('   ');
  ws.getCell(r, 1).font = { name: 'Arial', size: 9 };
  r += 2;
  const dest = o.terms.deliveryAddress && needAddr(o) ? o.terms.deliveryAddress : o.terms.pod;
  const goods = goodsLines(o, k).join('\n');
  // 还没有货物（空白模板）：件数、重量、体积留空
  const has = k.rows.length > 0;
  const z = (x: string) => (has ? x : '');
  const pkgText = z(`${pk.count} ${pk.unitEn}${pk.contains ? ` (${pk.contains})` : ''}`);

  if (doc === 'booking') {
    title('订舱委托书  BOOKING FORM');
    r++;
    pair('致 TO', forwarder || '', '委托编号 Ref.', o.no ? `BK-${o.no}` : '');
    pair('委托方 FROM', `${o.seller.nameCn || o.seller.name}  ${o.seller.phone}`, '日期 Date', o.numbers.date);
    pair('托运人 Shipper', shipperText(o), '收货人 Consignee', consigneeText(o));
    pair('通知人 Notify Party', notifyText(o), '运费 / 提单 / 术语', `${freightText(o)}\n${blTypeText(o)}${blTypeCn(o) ? `（${blTypeCn(o)}）` : ''}\n${o.terms.incoterm} ${o.terms.place}`);
    pair('起运港 POL', o.terms.pol, '目的港 POD', o.terms.pod);
    pair('交货地 Place of Delivery', dest, '运输方式', o.terms.transport);
    pair('柜型柜量 Equipment', o.shipping.equipment ?? '', '货好时间 Cargo Ready', o.shipping.cargoReady ?? '');
    pair('预计开船 ETD', o.shipping.etd, 'PO No.', o.numbers.po);
    pair('件数 Packages', pkgText, '毛重 G.W. (KGS)', z(pk.gw.toFixed(2)));
    pair('体积 Meas. (CBM)', z(pk.cbm.toFixed(3)), '净重 N.W. (KGS)', z(k.nw.toFixed(2)));
    pair('品名 / HS Code', goods);
    pair('唛头 Marks', o.shipping.marks || 'N/M');
    pair('投保 Insurance', isBlank(o) ? '' : insureNeeded(o) ? `请代为投保，保额按发票金额 110%${has ? `（发票金额 ${sym(o.terms.currency)}${money(k.amount)}）` : ''}\nPlease arrange insurance for 110% of invoice value.` : '无需投保 No insurance required.');
    pair('特殊要求 Remarks', o.shipping.bookingNote ?? '');
  } else {
    title('SHIPPING INSTRUCTION');
    r++;
    pair('Ref.', o.no ? `SI-${o.no}` : '', 'B/L No.', o.shipping.blNo);
    pair('Date', o.numbers.date);
    pair('SHIPPER', shipperText(o), 'VESSEL / VOYAGE', o.shipping.vessel);
    pair('CONSIGNEE', consigneeText(o), 'NOTIFY PARTY', notifyText(o));
    pair('PORT OF LOADING', o.terms.pol, 'PORT OF DISCHARGE', o.terms.pod);
    pair('PLACE OF DELIVERY', dest, 'ETD', o.shipping.etd);
    pair('FREIGHT', freightText(o), 'B/L TYPE', blTypeText(o));
    pair('MARKS & NOS.', o.shipping.marks || 'N/M');
    pair('DESCRIPTION OF GOODS', goods);
    pair('PACKAGES', pkgText, 'G.W. (KGS)', z(pk.gw.toFixed(2)));
    pair('MEAS. (CBM)', z(pk.cbm.toFixed(3)), 'INVOICE / PO', [o.numbers.ci, o.numbers.po].filter(Boolean).join(' / '));
    const boxes = containerRows(o, k);
    if (boxes.length) {
      r++;
      const heads = ['Container No.', 'Seal No. / Type', 'Packages', 'G.W. / CBM'];
      heads.forEach((h, i) => { const c = ws.getCell(r, i + 1); c.value = h; c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: acc } }; c.border = box; });
      r++;
      for (const b of boxes) {
        [b.no, `${b.seal} / ${b.type}`, String(b.pkgs ?? ''), `${toNum(b.gw).toFixed(2)} KGS / ${toNum(b.cbm).toFixed(3)} CBM`].forEach((v, i) => value(ws.getCell(r, i + 1), v));
        r++;
      }
    }
    r++;
    ws.mergeCells(r, 1, r, 4);
    ws.getCell(r, 1).value = z(pk.words); ws.getCell(r, 1).font = { name: 'Arial', bold: true, size: 10 };
  }
  // 结尾说明和签章栏（和 PDF 一致）
  r += 2;
  const note = (t: string) => { ws.mergeCells(r, 1, r, 4); const c = ws.getCell(r, 1); c.value = t; c.font = { name: 'Arial', size: 9, color: { argb: 'FF555555' } }; c.alignment = { wrapText: true }; ws.getRow(r).height = 28; r++; };
  if (doc === 'booking') note('请确认船期后回传订舱确认（S/O），并在开船前发送提单草稿核对。Please confirm the booking and send us the draft B/L before sailing.');
  else if (!isBlank(o)) note(`${freightText(o)} · ${blTypeText(o)}${o.shipping.bookingNote ? ` · ${o.shipping.bookingNote}` : ''}`);
  ws.getRow(r).height = 44; r++;
  const sig = (c1: number, c2: number, t: string) => { ws.mergeCells(r, c1, r, c2); const c = ws.getCell(r, c1); c.value = t; c.font = { name: 'Arial', size: 9 }; c.border = { top: { style: 'thin', color: { argb: 'FF333333' } } }; };
  sig(1, 2, doc === 'booking' ? `委托方签章 For ${o.seller.name}` : `For and on behalf of ${o.seller.name}`);
  sig(3, 4, doc === 'booking' ? '货代确认 Forwarder' : 'Authorized Signature');

  ws.headerFooter.oddFooter = `&L${docFile(o, doc)}&R&P / &N`;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
