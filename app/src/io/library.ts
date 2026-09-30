import ExcelJS from 'exceljs';
import { detectHeader, parseDims, toNumber, type FieldSpec } from './table';
import { CURRENCIES } from '../domain/constants';
import { uid } from '../domain/calc';
import type { Currency, Customer, Product } from '../domain/types';

/* ---------- 产品 ---------- */
type PK = 'model' | 'nameCn' | 'nameEn' | 'spec' | 'hs' | 'unit' | 'price' | 'pcsPerCtn' | 'dims' | 'l' | 'w' | 'h' | 'nw' | 'gw' | 'elements' | 'cat';
export const PRODUCT_FIELDS: FieldSpec<PK>[] = [
  { key: 'model', label: '型号', aliases: ['型号', '货号', '产品型号', '款号', 'model', 'model no', 'item', 'item no', 'sku', 'art no'], required: true },
  { key: 'nameCn', label: '中文品名', aliases: ['中文品名', '品名中文', '中文名称', '品名', '名称', '产品名称', '商品名称'] },
  { key: 'nameEn', label: '英文品名', aliases: ['英文品名', '品名英文', '英文名称', 'description', 'english name', 'name', 'product name', 'commodity'] },
  { key: 'spec', label: '规格', aliases: ['规格', '规格型号', '规格参数', '尺寸', 'spec', 'specification', 'size'] },
  { key: 'hs', label: 'HS 编码', aliases: ['hs', 'hs编码', 'hscode', '商品编码', '商品编号', '海关编码', '税号'] },
  { key: 'unit', label: '单位', aliases: ['单位', 'unit', 'uom'] },
  { key: 'price', label: '单价', aliases: ['单价', '价格', '售价', '报价', 'price', 'unit price', 'fob price'] },
  { key: 'pcsPerCtn', label: '每箱装', aliases: ['每箱装', '每箱数量', '装箱数', '箱装数', '装箱量', 'pcs/ctn', 'qty/ctn', 'qty per carton', 'packing qty', 'inner qty'] },
  { key: 'dims', label: '外箱尺寸', aliases: ['外箱尺寸', '箱规', '纸箱尺寸', '箱子尺寸', 'carton size', 'ctn size', 'meas', 'measurement'] },
  { key: 'l', label: '长', aliases: ['长', '长cm', '箱长', 'length', 'l'] },
  { key: 'w', label: '宽', aliases: ['宽', '宽cm', '箱宽', 'width', 'w'] },
  { key: 'h', label: '高', aliases: ['高', '高cm', '箱高', 'height', 'h'] },
  { key: 'nw', label: '净重/箱', aliases: ['净重', '单箱净重', '净重kg', 'nw', 'n.w.', 'net weight'] },
  { key: 'gw', label: '毛重/箱', aliases: ['毛重', '单箱毛重', '毛重kg', 'gw', 'g.w.', 'gross weight'] },
  { key: 'elements', label: '申报要素', aliases: ['申报要素', '报关要素', 'declaration elements'] },
  { key: 'cat', label: '分类', aliases: ['分类', '类别', '品类', 'category'] },
];

/** fields：文件里实际出现的字段；覆盖更新时只改这些字段，其余保持原样 */
export interface MapResult<T> { rows: T[]; columns: string[]; errors: string[]; headerRow: number; fields: string[] }

export function mapProducts(table: string[][]): MapResult<Product> {
  const { row, map } = detectHeader(table, PRODUCT_FIELDS);
  const columns = [...map.values()].map((k) => PRODUCT_FIELDS.find((f) => f.key === k)!.label);
  if (row < 0 || ![...map.values()].includes('model')) {
    return { rows: [], columns, errors: ['没有找到「型号」列。请确认第一行是表头，且有一列叫「型号」或「货号」'], headerRow: row, fields: [] };
  }
  const rows: Product[] = [];
  const errors: string[] = [];
  table.slice(row + 1).forEach((cells, i) => {
    const v: Partial<Record<PK, string>> = {};
    map.forEach((k, ci) => (v[k] = (cells[ci] ?? '').trim()));
    if (!v.model) {
      if (Object.values(v).some(Boolean)) errors.push(`第 ${row + i + 2} 行没有型号，已跳过`);
      return;
    }
    const dims = parseDims(v.dims ?? '');
    rows.push({
      id: uid(), model: v.model, nameCn: v.nameCn ?? '', nameEn: v.nameEn ?? '', spec: v.spec ?? '', hs: (v.hs ?? '').replace(/\D/g, ''),
      unit: (v.unit || 'PCS').toUpperCase(), price: toNumber(v.price ?? ''), pcsPerCtn: toNumber(v.pcsPerCtn ?? ''),
      l: dims ? dims[0] : toNumber(v.l ?? ''), w: dims ? dims[1] : toNumber(v.w ?? ''), h: dims ? dims[2] : toNumber(v.h ?? ''),
      nw: toNumber(v.nw ?? ''), gw: toNumber(v.gw ?? ''), elements: v.elements ?? '', cat: v.cat ?? '',
    });
  });
  const keys = [...map.values()] as string[];
  const fields = keys.flatMap((k) => (k === 'dims' ? ['l', 'w', 'h'] : [k]));
  return { rows, columns, errors, headerRow: row, fields };
}

/* ---------- 客户 ---------- */
type CK = 'name' | 'country' | 'address' | 'tax' | 'contact' | 'title' | 'email' | 'phone' | 'incoterm' | 'place' | 'currency' | 'pod' | 'level' | 'source' | 'notes';
export const CUSTOMER_FIELDS: FieldSpec<CK>[] = [
  { key: 'name', label: '公司名称', aliases: ['公司名称', '客户名称', '客户', '公司', 'company', 'company name', 'customer', 'buyer'], required: true },
  { key: 'country', label: '国家', aliases: ['国家', '国家地区', '地区', 'country'] },
  { key: 'address', label: '地址', aliases: ['地址', '公司地址', 'address'] },
  { key: 'tax', label: '税号', aliases: ['税号', 'vat', 'tax id', 'eori', '税号vat'] },
  { key: 'contact', label: '联系人', aliases: ['联系人', '姓名', 'contact', 'contact person', 'attn'] },
  { key: 'title', label: '职位', aliases: ['职位', 'title', 'position'] },
  { key: 'email', label: '邮箱', aliases: ['邮箱', '电子邮箱', 'email', 'e-mail', 'mail'] },
  { key: 'phone', label: '电话', aliases: ['电话', '手机', 'whatsapp', 'phone', 'tel', 'mobile'] },
  { key: 'incoterm', label: '贸易术语', aliases: ['贸易术语', '成交方式', 'incoterm', 'incoterms', 'terms'] },
  { key: 'place', label: '指定地点', aliases: ['指定地点', 'named place'] },
  { key: 'currency', label: '币种', aliases: ['币种', '币制', 'currency'] },
  { key: 'pod', label: '目的港', aliases: ['目的港', 'pod', 'port of destination', 'destination'] },
  { key: 'level', label: '客户等级', aliases: ['客户等级', '等级', 'level', 'grade'] },
  { key: 'source', label: '来源', aliases: ['来源', '客户来源', 'source'] },
  { key: 'notes', label: '备注', aliases: ['备注', 'notes', 'remark', 'remarks'] },
];

export function mapCustomers(table: string[][]): MapResult<Customer> {
  const { row, map } = detectHeader(table, CUSTOMER_FIELDS);
  const columns = [...map.values()].map((k) => CUSTOMER_FIELDS.find((f) => f.key === k)!.label);
  if (row < 0 || ![...map.values()].includes('name')) {
    return { rows: [], columns, errors: ['没有找到「公司名称」列。请确认第一行是表头，且有一列叫「公司名称」或「客户名称」'], headerRow: row, fields: [] };
  }
  const rows: Customer[] = [];
  const errors: string[] = [];
  table.slice(row + 1).forEach((cells, i) => {
    const v: Partial<Record<CK, string>> = {};
    map.forEach((k, ci) => (v[k] = (cells[ci] ?? '').trim()));
    if (!v.name) {
      if (Object.values(v).some(Boolean)) errors.push(`第 ${row + i + 2} 行没有公司名称，已跳过`);
      return;
    }
    const cur = (v.currency ?? '').toUpperCase();
    rows.push({
      id: uid(), name: v.name, short: '', country: v.country ?? '', address: v.address ?? '', tax: v.tax ?? '', notify: '',
      level: (v.level || 'B').toUpperCase().slice(0, 1), source: v.source ?? '',
      contacts: [{ name: v.contact ?? '', title: v.title ?? '', email: v.email ?? '', phone: v.phone ?? '' }],
      habits: {
        incoterm: (v.incoterm || 'FOB').toUpperCase(), place: v.place ?? '', deliveryAddress: '', pod: v.pod ?? '', marks: '',
        currency: (CURRENCIES.includes(cur as Currency) ? cur : 'USD') as Currency,
        payment: 'T/T 电汇', payDeposit: 30, payBalanceAt: 'before shipment', payDays: '', payCustom: '',
      },
      notes: v.notes ?? '', follow: [],
    });
  });
  return { rows, columns, errors, headerRow: row, fields: [...map.values()] };
}

/** 把导入行里文件实际提供的字段合并进已有客户（联系人写入第一位联系人，交易习惯写入 habits） */
export function mergeCustomer(target: Customer, row: Customer, fields: string[]) {
  const top = ['name', 'country', 'address', 'tax', 'level', 'source', 'notes'] as const;
  for (const k of top) if (fields.includes(k)) target[k] = row[k];
  const contact: Record<string, 'name' | 'title' | 'email' | 'phone'> = { contact: 'name', title: 'title', email: 'email', phone: 'phone' };
  for (const [f, k] of Object.entries(contact)) {
    if (!fields.includes(f)) continue;
    if (!target.contacts[0]) target.contacts.push({ name: '', title: '', email: '', phone: '' });
    target.contacts[0][k] = row.contacts[0][k];
  }
  for (const k of ['incoterm', 'place', 'currency', 'pod'] as const) if (fields.includes(k)) (target.habits as unknown as Record<string, unknown>)[k] = row.habits[k];
}

/** 把导入行里文件实际提供的字段合并进已有产品 */
export function mergeProduct(target: Product, row: Product, fields: string[]) {
  for (const k of fields) if (k in row && k !== 'id') (target as unknown as Record<string, unknown>)[k] = (row as unknown as Record<string, unknown>)[k];
}

/* ---------- 导出资料库为 Excel ---------- */
async function sheet(title: string, headers: string[], rows: (string | number)[][], widths: number[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = '外贸超级工作台';
  const ws = wb.addWorksheet(title, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = headers.map((h, i) => ({ header: h, width: widths[i] ?? 14 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D3F72' } };
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

const P_HEAD = ['型号', '中文品名', '英文品名', '规格', 'HS编码', '单位', '单价', '每箱装', '长', '宽', '高', '净重', '毛重', '申报要素', '分类'];
const P_W = [14, 22, 32, 20, 13, 8, 10, 9, 7, 7, 7, 8, 8, 30, 10];

export const productsToXlsx = (list: Product[]) =>
  sheet('产品库', P_HEAD, list.map((p) => [p.model, p.nameCn, p.nameEn, p.spec, p.hs, p.unit, p.price, p.pcsPerCtn, p.l, p.w, p.h, p.nw, p.gw, p.elements, p.cat]), P_W);

export const productTemplate = () =>
  sheet('产品库', P_HEAD, [['AL-S200', '铝合金展示架', 'Aluminium Display Rack', '1200×450×1800 mm', '9403200000', 'PCS', 12.5, 2, 122, 47, 20, 14.5, 16, '0|0|展示用|铝合金|无品牌|AL-S200', '展示架']], P_W);

const C_HEAD = ['公司名称', '国家', '地址', '税号', '联系人', '职位', '邮箱', '电话', '贸易术语', '指定地点', '币种', '目的港', '客户等级', '来源', '备注'];
const C_W = [30, 10, 40, 18, 14, 14, 26, 18, 10, 12, 8, 14, 9, 12, 30];

export const customersToXlsx = (list: Customer[]) =>
  sheet('客户库', C_HEAD, list.map((c) => {
    const k = c.contacts[0] ?? { name: '', title: '', email: '', phone: '' };
    return [c.name, c.country, c.address, c.tax, k.name, k.title, k.email, k.phone, c.habits.incoterm, c.habits.place, c.habits.currency, c.habits.pod, c.level, c.source, c.notes];
  }), C_W);

export const customerTemplate = () =>
  sheet('客户库', C_HEAD, [['Global Ventures Pte. Ltd.', '新加坡', '88 Cross Street, Singapore', 'UEN 201912345K', 'David Kim', 'Purchasing Manager', 'purchase@example.sg', '+65 6123 4567', 'FOB', 'Qingdao', 'USD', 'Singapore', 'A', '广交会', '']], C_W);
