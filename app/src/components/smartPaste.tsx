import { useState } from 'react';
import { parseContact, type ContactParse } from '../domain/contact';
import { toast, useUI } from '../store/ui';

type Key = keyof ContactParse;
const LABEL: Record<Key, string> = {
  name: '公司名称', address: '地址', contact: '联系人', title: '职位', phone: '电话 / WhatsApp', email: '邮箱', tax: '税号 / VAT', country: '国家',
};

/**
 * 智能粘贴：把客户的邮件签名、名片或地址块粘进来，自动拆成各个字段；
 * 识别结果可以先改再填入。只填识别到的字段，没识别到的保持原样。
 */
export function openSmartPaste(opts: { title?: string; initial?: string; fields: Key[]; apply: (p: Partial<ContactParse>) => void }) {
  useUI.getState().openModal({ title: opts.title ?? '智能粘贴', wide: true, body: <SmartPaste {...opts} /> });
}

function SmartPaste({ initial = '', fields, apply }: { initial?: string; fields: Key[]; apply: (p: Partial<ContactParse>) => void }) {
  const close = useUI((s) => s.closeModal);
  const [text, setText] = useState(initial);
  const [edits, setEdits] = useState<Partial<ContactParse>>({});
  const parsed = parseContact(text);
  const val = (k: Key) => edits[k] ?? parsed[k];
  const found = fields.filter((k) => val(k).trim());

  return (
    <div className="sp">
      <div className="sp-in">
        <label htmlFor="sp-text">把客户的邮件签名、名片文字或地址块整段粘贴到这里</label>
        <textarea
          id="sp-text"
          autoFocus
          rows={12}
          value={text}
          placeholder={'例如：\nJohn Miller\nPurchasing Manager\nABC Trading LLC\n123 Main St, Los Angeles, CA 90001, USA\nTel: +1 213 555 0100\nEmail: john@abctrading.com'}
          onChange={(e) => { setText(e.target.value); setEdits({}); }}
        />
        <p className="muted">在本机识别，不联网。识别不准的地方在右边直接改。</p>
      </div>
      <div className="sp-out">
        <div className="eyebrow">识别结果{text.trim() ? ` · ${found.length} 项` : ''}</div>
        {fields.map((k) => (
          <div key={k} className={'sp-f' + (val(k).trim() ? ' on' : '')}>
            <label htmlFor={'sp-' + k}>{LABEL[k]}</label>
            {k === 'address'
              ? <textarea id={'sp-' + k} rows={2} value={val(k)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
              : <input id={'sp-' + k} value={val(k)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />}
          </div>
        ))}
        <div className="sp-foot">
          <button className="btn" onClick={close}>取消</button>
          <button
            className="btn pri"
            disabled={!found.length}
            onClick={() => {
              apply(Object.fromEntries(found.map((k) => [k, val(k).trim()])));
              close();
              toast(`已填入 ${found.length} 项：${found.map((k) => LABEL[k]).join('、')}`);
            }}
          >
            填入 {found.length || ''} 项
          </button>
        </div>
      </div>
    </div>
  );
}
