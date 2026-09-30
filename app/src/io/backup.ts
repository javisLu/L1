import { defaultSettings } from '../domain/settings';
import type { DataState } from '../domain/types';

export const BACKUP_APP = 'trade-workbench';
export const BACKUP_VERSION = 2;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: DataState;
}

export function makeBackup(d: DataState): string {
  const file: BackupFile = { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: d };
  return JSON.stringify(file, null, 1);
}

/** 校验并读取备份文件；不是本软件的备份或内容残缺时给出明确原因 */
export function parseBackup(text: string): { data: DataState; exportedAt: string } {
  let f: Partial<BackupFile>;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的备份（无法解析）');
  }
  if (f.app !== BACKUP_APP || !f.data) throw new Error('这不是外贸超级工作台的备份文件');
  const d = f.data as Partial<DataState>;
  for (const k of ['orders', 'customers', 'products', 'partners'] as const) {
    if (!Array.isArray(d[k])) throw new Error(`备份内容不完整：缺少${{ orders: '订单', customers: '客户', products: '产品', partners: '合作方' }[k]}`);
  }
  if (!d.seller || typeof d.seq !== 'number') throw new Error('备份内容不完整：缺少公司信息或编号');
  return {
    data: { ...(d as DataState), settings: { ...defaultSettings(), ...(d.settings ?? {}) } },
    exportedAt: f.exportedAt ?? '',
  };
}

export const backupSummary = (d: DataState) => `${d.orders.length} 个订单、${d.customers.length} 个客户、${d.products.length} 个产品`;
