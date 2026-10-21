import { useData } from '../store/data';
import { toast } from '../store/ui';
import { certOf, certsFor, destOf } from '../domain/origin';
import { jumpToField } from './jump';
import type { Order } from '../domain/types';

/** 产地证：目的国、能用的证书（点一下选用） */
export function OriginAdvice({ order: o }: { order: Order }) {
  const setField = useData((s) => s.setOrderField);
  const d = destOf(o);
  const list = certsFor(d.cn);
  const cur = certOf(o);
  const fta = list.length > 1;
  return (
    <div className="w2 co-adv">
      <div className="co-dest">
        <span>目的国</span>
        <b>{d.cn || '还不知道'}</b>
        {d.en && <em>{d.en}</em>}
        <span className="muted">
          {d.from === 'customs' ? '取自报关资料的运抵国' : d.from === 'guess' ? '按买方地址 / 目的港推断' : '在报关资料里填运抵国'}
        </span>
        <button className="btn ghost sm" onClick={() => jumpToField('customs', 'customs', 'customs.destCountry')}>{d.from === 'customs' ? '改' : '去填运抵国'}</button>
      </div>
      <div className="co-certs">
        {list.map((c) => (
          <button
            key={c.key}
            className={'co-cert' + (cur.key === c.key ? ' on' : '')}
            onClick={() => { setField(o.id, 'co.type', c.key); toast('已选用「' + c.name + '」'); }}
          >
            <b>{c.name}</b>
            <small>{c.key === 'general' ? (fta ? '不享受关税减免' : '这个国家和中国没有自贸协定，办一般原产地证') : '自贸协定：客户进口可减免关税'}</small>
            {cur.key === c.key && <i>当前</i>}
          </button>
        ))}
      </div>
      <div className="note">
        {fta
          ? `${d.cn}和中国有自贸协定：办协定证书，客户进口时可以少交或免交关税，减免多少看具体商品；几种都能用时问客户要哪一种。`
          : '一般原产地证所有国家都能办（海关或贸促会签发），客户要求、信用证要求时才需要。'}
        {cur.note ? ` ${cur.note}` : ''}
        协定清单可能有新增或调整，签发前在「中国国际贸易单一窗口」确认。
      </div>
    </div>
  );
}
