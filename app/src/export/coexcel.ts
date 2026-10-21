import ExcelJS from 'exceljs';
import { THEMES } from '../domain/constants';
import { calcOrder, fixed, intWords } from '../domain/calc';
import { pkgSummary } from '../domain/package';
import { certHs, certOf, criterionOf, declPlace, destOf, routeText } from '../domain/origin';
import { docFile } from '../modules/defs';
import type { Order } from '../domain/types';

const thin = { style: 'thin' as const, color: { argb: 'FF9AA3AE' } };
const box = { top: thin, left: thin, bottom: thin, right: thin };

/** 产地证申请资料 Excel：按证书栏目排，方便逐格复制到单一窗口 */
export async function renderCoExcel(o: Order): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  const ws = wb.addWorksheet('产地证资料', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } },
    views: [{ showGridLines: false }],
  });
  const k = calcOrder(o), pk = pkgSummary(o, k);
  const c = certOf(o), d = destOf(o), crit = criterionOf(o);
  const cols = c.hs6 ? ['No.', '包装与货物描述', '商品编码', '原产地标准', '数量 / 毛重', '发票金额'] : ['No.', '包装与货物描述', '商品编码', '原产地标准', '数量 / 毛重'];
  ws.columns = (c.hs6 ? [6, 44, 12, 12, 22, 16] : [6, 52, 14, 12, 24]).map((width) => ({ width }));
  const last = cols.length;
  const acc = 'FF' + (THEMES[o.docset.theme] ?? '#1d3f72').slice(1).toUpperCase();
  let r = 1;
  const title = (t: string, size: number, color = acc) => {
    ws.mergeCells(r, 1, r, last);
    const cell = ws.getCell(r, 1);
    cell.value = t; cell.font = { name: 'Arial', bold: true, size, color: { argb: color } }; cell.alignment = { horizontal: 'center' };
    r++;
  };
  const pair = (label: string, value: string) => {
    ws.mergeCells(r, 1, r, 2);
    const l = ws.getCell(r, 1);
    l.value = label; l.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF4B5563' } }; l.alignment = { vertical: 'top', wrapText: true }; l.border = box;
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F5F8' } };
    ws.mergeCells(r, 3, r, last);
    const v = ws.getCell(r, 3);
    v.value = value; v.font = { name: 'Arial', size: 10 }; v.alignment = { vertical: 'top', wrapText: true }; v.border = box;
    ws.getRow(r).height = Math.max(18, String(value).split('\n').length * 13 + 4);
    r++;
  };

  title('原产地证申请资料', 15);
  title(c.name, 11, 'FF333333');
  r++;
  pair('1. 出口商 Exporter', [o.seller.name, o.seller.address, 'CHINA'].filter(Boolean).join('\n'));
  pair('2. 收货人 Consignee', [o.buyer.name, o.buyer.address, d.en].filter(Boolean).join('\n'));
  pair('3. 运输方式和路线', routeText(o));
  pair('4. 目的国', d.en);
  pair('5. 备注', o.co?.remarks ?? '');
  pair('6. 唛头', o.shipping.marks || 'N/M');
  r++;
  cols.forEach((h, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = h; cell.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: acc } }; cell.border = box;
  });
  r++;
  k.rows.forEach((row, i) => {
    const hs = String(row.hs ?? '').replace(/\D/g, '');
    const desc = `${row.pack ? '' : row.n ? `${row.n} CARTONS OF ` : ''}${String(row.nameEn || '').toUpperCase()}`;
    const vals = [i + 1, desc, certHs(hs, c), /^W$/i.test(crit) && hs.length >= 4 ? `W ${hs.slice(0, 4)}` : crit, `${row.q} ${row.unit}\nG.W. ${fixed(row.gwT, 2)} KGS`];
    if (c.hs6) vals.push(`${o.terms.currency} ${row.a.toFixed(2)}`);
    vals.forEach((v, j) => {
      const cell = ws.getCell(r, j + 1);
      cell.value = v; cell.border = box; cell.font = { name: 'Arial', size: 10 }; cell.alignment = { vertical: 'top', wrapText: true };
    });
    ws.getRow(r).height = 30;
    r++;
  });
  if (k.rows.length) {
    ws.mergeCells(r, 1, r, last);
    const t = ws.getCell(r, 1);
    t.value = `TOTAL: ${pk.mode === 'ctns' ? `${intWords(k.ctns)} (${k.ctns}) CARTONS` : `${intWords(pk.count)} (${pk.count}) ${pk.unitEn}`} ONLY · G.W. ${fixed(pk.gw, 2)} KGS\n*****`;
    t.font = { name: 'Arial', bold: true, size: 10 }; t.alignment = { wrapText: true };
    ws.getRow(r).height = 30;
    r++;
  }
  r++;
  pair('10. 发票号和日期', `${o.numbers.ci}  ${o.numbers.date}`);
  pair('11. 申报地点和日期', `${declPlace(o)}  ${o.numbers.date}`);
  ws.headerFooter.oddFooter = `&L${docFile(o, 'co')}&R&P / &N`;
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
