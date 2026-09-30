import type { Numbering, Settings } from './types';

export function defaultSettings(): Settings {
  return {
    numbering: { orderPattern: '{YYYY}-{SEQ}', seqDigits: 3, quote: 'QT-', pi: 'PI-', contract: 'SC-', ci: 'CI-' },
    defaults: {
      pol: 'Qingdao, China', place: 'Qingdao', transport: '海运', leadTime: '20-25 working days',
      shipment: 'Within 30 days after receipt of deposit', packing: 'Export standard cartons, suitable for ocean transportation',
      signedAt: 'Qingdao, China', exportPort: '青岛大港海关', sourceArea: '青岛', theme: '藏青', stamp: true,
    },
    assets: { logo: '', stamp: '', signature: '' },
    lastAutoBackup: '',
  };
}

/** 按模板生成订单号，例如 {YYYY}-{SEQ} → 2026-003，HY{YY}{MM}{SEQ} → HY2609003 */
export function formatOrderNo(n: Numbering, seq: number, date = new Date()): string {
  const y = String(date.getFullYear());
  const pattern = n.orderPattern.trim() || '{YYYY}-{SEQ}';
  const out = pattern
    .replace(/\{YYYY\}/g, y)
    .replace(/\{YY\}/g, y.slice(2))
    .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ\}/g, String(seq).padStart(Math.max(1, Math.min(8, n.seqDigits || 3)), '0'));
  // 模板里没写 {SEQ} 时补在末尾，保证每单不重号
  return pattern.includes('{SEQ}') ? out : out + String(seq).padStart(n.seqDigits || 3, '0');
}

export const docNumbers = (n: Numbering, no: string) => ({ quote: n.quote + no, pi: n.pi + no, contract: n.contract + no, ci: n.ci + no });
