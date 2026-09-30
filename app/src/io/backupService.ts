import { useData } from '../store/data';
import { isDesktop } from '../store/storage';
import { makeBackup } from './backup';
import { saveFiles } from '../export/save';
import { today } from '../domain/calc';
import type { DataState } from '../domain/types';

const KEEP = 14;
const snapshot = (): DataState => {
  const { settings, seller, products, customers, partners, orders, seq } = useData.getState();
  return JSON.parse(JSON.stringify({ settings, seller, products, customers, partners, orders, seq }));
};
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');

/** 手动备份：保存到「文档/外贸超级工作台/备份/」 */
export async function exportBackup() {
  const data = new TextEncoder().encode(makeBackup(snapshot()));
  return saveFiles('备份', [{ name: `外贸超级工作台备份-${stamp()}.json`, data }]);
}

/** 写入应用数据目录下的 backups/（自动备份与恢复前备份），只保留最近 14 份自动备份 */
async function writeInternal(name: string) {
  if (!isDesktop) return;
  const { writeTextFile, mkdir, exists, readDir, remove, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  const baseDir = BaseDirectory.AppData;
  if (!(await exists('backups', { baseDir }))) await mkdir('backups', { baseDir, recursive: true });
  await writeTextFile(`backups/${name}`, makeBackup(snapshot()), { baseDir });
  const autos = (await readDir('backups', { baseDir })).map((e) => e.name).filter((n) => n.startsWith('auto-')).sort();
  for (const old of autos.slice(0, Math.max(0, autos.length - KEEP))) await remove(`backups/${old}`, { baseDir });
}

/** 每天第一次打开时自动备份一次 */
export async function autoBackupIfDue() {
  const st = useData.getState();
  const d = today();
  if (!isDesktop || st.settings.lastAutoBackup === d || !st.orders.length) return;
  try {
    await writeInternal(`auto-${d}.json`);
    st.updateSettings((s) => void (s.lastAutoBackup = d));
  } catch (e) {
    console.error('自动备份失败', e);
  }
}

/** 恢复前先把当前数据存一份，误操作时还能找回 */
export const backupBeforeRestore = () => writeInternal(`before-restore-${stamp()}.json`);

export async function backupFolder(): Promise<string | null> {
  if (!isDesktop) return null;
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  return join(await appDataDir(), 'backups');
}
