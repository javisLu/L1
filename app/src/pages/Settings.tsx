import { useEffect, useState } from 'react';
import { Crumb, TopBar } from '../components/common';
import { confirmAction } from '../components/confirm';
import { useData, getPath, setPath } from '../store/data';
import { isDesktop } from '../store/storage';
import { toast, useUI, type Page } from '../store/ui';
import { MODS, type ModKey } from '../modules/defs';
import { THEMES, TRANSPORTS } from '../domain/constants';
import { docNumbers, formatOrderNo } from '../domain/settings';
import { loadImage, pickFile } from '../io/image';
import { backupSummary, parseBackup } from '../io/backup';
import { backupBeforeRestore, backupFolder, exportBackup } from '../io/backupService';
import type { Assets, Order } from '../domain/types';

const SECTIONS = [
  ['company', '公司信息'], ['images', 'Logo 与公章'], ['numbering', '编号规则'], ['defaults', '新订单默认值'], ['data', '数据与备份'],
] as const;

type Target = 'seller' | 'settings';

function Field({ target, path, label, wide, type, options }: { target: Target; path: string; label: string; wide?: boolean; type?: 'textarea' | 'select' | 'checkbox'; options?: string[] }) {
  const { seller, settings, updateSeller, updateSettings } = useData();
  const obj = target === 'seller' ? seller : settings;
  const v = getPath<unknown>(obj, path);
  const set = (val: unknown) => (target === 'seller' ? updateSeller((s) => setPath(s, path, val)) : updateSettings((s) => setPath(s, path, val)));
  const id = `set-${target}-${path.replace(/\./g, '-')}`;
  if (type === 'checkbox') {
    return (
      <div className={'fi chk' + (wide ? ' w2' : '')}>
        <input id={id} type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />
        <label htmlFor={id}>{label}</label>
      </div>
    );
  }
  return (
    <div className={'fi' + (wide ? ' w2' : '')}>
      <label htmlFor={id}>{label}</label>
      {type === 'textarea' ? (
        <textarea id={id} rows={3} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
      ) : type === 'select' ? (
        <select id={id} value={String(v ?? '')} onChange={(e) => set(e.target.value)}>{options!.map((o) => <option key={o}>{o}</option>)}</select>
      ) : (
        <input id={id} value={String(v ?? '')} onChange={(e) => set(e.target.value)} />
      )}
    </div>
  );
}

function ImageBox({ k, title, hint, maxSide, whiteOption }: { k: keyof Assets; title: string; hint: string; maxSide: number; whiteOption?: boolean }) {
  const src = useData((s) => s.settings.assets[k]);
  const updateSettings = useData((s) => s.updateSettings);
  const [removeWhite, setRemoveWhite] = useState(true);
  const upload = async () => {
    const f = await pickFile('image/png,image/jpeg,image/webp');
    if (!f) return;
    try {
      const url = await loadImage(f, { maxSide, removeWhite: whiteOption && removeWhite });
      updateSettings((s) => void (s.assets[k] = url));
      toast(`${title}已更新，所有单据立即生效`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="imgbox">
      <b>{title}</b>
      <small>{hint}</small>
      <div className="imgprev">{src ? <img src={src} alt={title} /> : <span>未上传</span>}</div>
      {whiteOption && (
        <label className="row" style={{ fontSize: 12.5 }}>
          <input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} /> 上传时去除白色背景
        </label>
      )}
      <div className="row">
        <button className="btn sm" onClick={upload}>{src ? '更换' : '上传图片'}</button>
        {src && <button className="btn ghost sm danger-t" onClick={() => updateSettings((s) => void (s.assets[k] = ''))}>删除</button>}
      </div>
    </div>
  );
}

const LIB_NAMES: Partial<Record<Page, string>> = { customers: '客户库', partners: '合作方库', products: '产品库', hs: 'HS 记忆库', clauses: '条款库', calc: '报价计算器' };

/** 从哪里打开的设置：返回按钮上显示的名字（从首页进入时不显示） */
function backLabel(prev: Page, order: Order | undefined, mod: ModKey | null): string | null {
  if (prev === 'order') return order ? `订单 ${order.no}` : null;
  if (prev === 'module') return order && mod ? `${order.no} · ${MODS[mod].name}` : null;
  return LIB_NAMES[prev] ?? null;
}

export function Settings() {
  const ui = useUI();
  const st = useData();
  const n = st.settings.numbering;
  const nextNo = formatOrderNo(n, st.seq);
  const nums = docNumbers(n, nextNo);
  const back = backLabel(ui.prev, st.orders.find((o) => o.id === ui.orderId), ui.mod);
  const [dataPath, setDataPath] = useState<string | null>(null);
  const [autoDir, setAutoDir] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop) return;
    void (async () => {
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      setDataPath(await join(await appDataDir(), 'trade-workbench-data.json'));
      setAutoDir(await backupFolder());
    })();
  }, []);

  const reveal = async (p: string) => {
    const { reveal: r } = await import('../export/save');
    await r(p).catch((e) => toast('无法打开文件夹：' + String(e)));
  };

  const doBackup = async () => {
    try {
      const r = await exportBackup();
      const p = r.paths[0];
      if (p) toast('已备份：' + p.split(/[\\/]/).pop(), { label: '打开文件夹', run: () => void reveal(p) });
      else toast('备份文件已下载');
    } catch (e) {
      toast('备份失败：' + String(e));
    }
  };

  const doRestore = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    try {
      const { data, exportedAt } = parseBackup(await f.text());
      const ok = await confirmAction({
        title: '从备份恢复',
        danger: true,
        ok: '恢复并覆盖当前数据',
        body: (
          <>
            <p>备份时间：{exportedAt ? new Date(exportedAt).toLocaleString('zh-CN') : '未知'}</p>
            <p>备份内容：{backupSummary(data)}</p>
            <p>当前数据（{backupSummary(useData.getState())}）将被替换。恢复前会自动把当前数据另存一份到自动备份文件夹。</p>
          </>
        ),
      });
      if (!ok) return;
      await backupBeforeRestore();
      useData.getState().replaceAll(data);
      ui.set({ page: 'home', orderId: null, mod: null });
      toast('已从备份恢复：' + backupSummary(data));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), undefined, 8000);
    }
  };

  const doClear = async () => {
    const ok = await confirmAction({
      title: '清空数据，开始正式使用',
      danger: true,
      ok: '清空订单与资料库',
      body: (
        <>
          <p>将删除全部订单、客户、合作方和产品（{backupSummary(useData.getState())}），订单编号从 1 重新开始。</p>
          <p>「设置」里的公司信息、Logo、公章和编号规则会保留。清空前会自动备份一份。</p>
        </>
      ),
    });
    if (!ok) return;
    await backupBeforeRestore().catch(() => undefined);
    st.clearAll();
    toast('已清空，可以开始录入正式数据了');
  };

  const doDemo = async () => {
    const ok = await confirmAction({ title: '恢复示例数据', ok: '恢复示例数据', danger: true, body: <p>当前订单与资料库会被示例数据替换（设置保留）。恢复前会自动备份一份。</p> });
    if (!ok) return;
    await backupBeforeRestore().catch(() => undefined);
    st.resetDemo();
    toast('已恢复示例数据');
  };

  return (
    <>
      <TopBar>
        <Crumb onClick={() => ui.go('home')}>首页</Crumb>
        {back && <Crumb onClick={() => ui.go(ui.prev)}>{back}</Crumb>}
        <span className="cur">设置</span>
      </TopBar>
      <main className="wrap">
        <div className="sec-title">
          <div><div className="eyebrow">设置</div><h1 style={{ fontSize: 22 }}>公司与软件设置</h1></div>
          {back && <button className="btn" onClick={() => ui.go(ui.prev)}>← 返回 {back}</button>}
        </div>
        <div className="set">
          <nav className="set-nav">{SECTIONS.map(([id, t]) => <a key={id} href={'#' + id}>{t}</a>)}</nav>
          <div>
            <section id="company" className="panel set-sec">
              <h2>公司信息</h2>
              <p>新建订单时自动带入，作为所有单据的卖方信息。</p>
              <div className="grid">
                <Field target="seller" path="name" label="公司名称（英文）" wide />
                <Field target="seller" path="nameCn" label="公司名称（中文）" />
                <Field target="seller" path="tax" label="统一社会信用代码" />
                <Field target="seller" path="address" label="地址" wide />
                <Field target="seller" path="phone" label="电话" />
                <Field target="seller" path="email" label="邮箱" />
                <Field target="seller" path="bank" label="收款银行信息（受益人 / 银行 / SWIFT / 账号）" wide type="textarea" />
              </div>
              <div className="tbl-tools">
                <button
                  className="btn sm"
                  onClick={async () => {
                    const open = st.orders.filter((o) => o.status !== '完结').length;
                    if (!open) return toast('没有未完结的订单');
                    const ok = await confirmAction({ title: '同步到未完结订单', ok: `同步 ${open} 个订单`, body: <p>把上面的公司信息写入 {open} 个未完结订单的卖方信息。已完结的订单保持不变。</p> });
                    if (ok) toast(`已同步 ${st.syncSellerToOpenOrders()} 个订单`);
                  }}
                >
                  同步到未完结订单
                </button>
              </div>
            </section>

            <section id="images" className="panel set-sec">
              <h2>Logo 与公章</h2>
              <p>上传后所有单据的预览和导出 PDF 立即生效。公章和签名只盖在卖方签字处，可在每个订单的「编号与样式」里关闭。</p>
              <div className="imgs">
                <ImageBox k="logo" title="公司 Logo" hint="显示在单据左上角，建议横版 PNG" maxSide={600} />
                <ImageBox k="stamp" title="公章" hint="建议红色印章 PNG；扫描件可勾选去除白底" maxSide={500} whiteOption />
                <ImageBox k="signature" title="负责人签名" hint="白纸黑字签名拍照即可" maxSide={500} whiteOption />
              </div>
            </section>

            <section id="numbering" className="panel set-sec">
              <h2>编号规则</h2>
              <p>订单号按模板生成；各单据编号 = 前缀 + 订单号。已建的订单编号不会改变。</p>
              <div className="grid">
                <Field target="settings" path="numbering.orderPattern" label="订单号模板（可用 {YYYY} {YY} {MM} {SEQ}）" />
                <Field target="settings" path="numbering.seqDigits" label="流水号位数" type="select" options={['3', '4', '5']} />
                <div className="fi">
                  <label htmlFor="set-seq">下一个流水号</label>
                  <input id="set-seq" className="num" inputMode="numeric" value={st.seq} onChange={(e) => useData.setState({ seq: Math.max(1, parseInt(e.target.value) || 1) })} />
                </div>
                <div className="fi"><label>预览</label><div className="note" style={{ margin: 0 }}>下一个订单号 <b className="num">{nextNo}</b></div></div>
                <Field target="settings" path="numbering.quote" label="报价单前缀" />
                <Field target="settings" path="numbering.pi" label="PI 前缀" />
                <Field target="settings" path="numbering.contract" label="合同前缀" />
                <Field target="settings" path="numbering.ci" label="发票前缀" />
                <div className="fi w2"><div className="note" style={{ margin: 0 }}>下一单的编号：报价单 {nums.quote} · PI {nums.pi} · 合同 {nums.contract} · 发票 {nums.ci}</div></div>
              </div>
            </section>

            <section id="defaults" className="panel set-sec">
              <h2>新订单默认值</h2>
              <p>新建订单时预先填好；选择客户后，客户的交易习惯优先。</p>
              <div className="grid">
                <Field target="settings" path="defaults.pol" label="装运港" />
                <Field target="settings" path="defaults.place" label="FOB 等术语的指定地点" />
                <Field target="settings" path="defaults.transport" label="运输方式" type="select" options={TRANSPORTS} />
                <Field target="settings" path="defaults.leadTime" label="交期" />
                <Field target="settings" path="defaults.shipment" label="装运期限" wide />
                <Field target="settings" path="defaults.packing" label="包装要求" wide />
                <Field target="settings" path="defaults.signedAt" label="签约地点" />
                <Field target="settings" path="defaults.exportPort" label="出境关别" />
                <Field target="settings" path="defaults.sourceArea" label="境内货源地" />
                <Field target="settings" path="defaults.theme" label="单据配色" type="select" options={Object.keys(THEMES)} />
                <Field target="settings" path="defaults.stamp" label="新单据默认盖公章" type="checkbox" />
              </div>
            </section>

            <section id="data" className="panel set-sec">
              <h2>数据与备份</h2>
              <p>数据只保存在这台电脑上，不上传任何服务器。建议定期备份，换电脑时用备份文件恢复。</p>
              {dataPath && (
                <div className="kvline">
                  <span className="grow">数据文件 <code>{dataPath}</code></span>
                  <button className="btn sm" onClick={() => void reveal(dataPath)}>打开文件夹</button>
                </div>
              )}
              <div className="kvline">
                <span className="grow">手动备份：保存到「文档 / 外贸超级工作台 / 备份」，可拷到 U 盘或网盘</span>
                <button className="btn sm pri" onClick={doBackup}>立即备份</button>
                <button className="btn sm" onClick={doRestore}>从备份恢复</button>
              </div>
              {autoDir && (
                <div className="kvline">
                  <span className="grow">自动备份：每天第一次打开软件时自动备份一次，保留最近 14 天{st.settings.lastAutoBackup ? `（最近一次 ${st.settings.lastAutoBackup}）` : ''}</span>
                  <button className="btn sm" onClick={() => void reveal(autoDir)}>打开自动备份文件夹</button>
                </div>
              )}
              <div className="kvline">
                <span className="grow">开始正式使用：清空示例订单和资料库，保留公司信息与设置</span>
                <button className="btn sm danger" onClick={doClear}>清空数据</button>
                <button className="btn ghost sm" onClick={doDemo}>恢复示例数据</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
