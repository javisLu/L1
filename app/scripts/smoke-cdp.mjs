// 冒烟测试：连接正在运行的桌面程序（WebView2 远程调试端口），依次点开订单、模块、资料库，
// 收集页面报错并截图。用法：先以 --remote-debugging-port=9222 启动程序，再运行本脚本。
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = process.env.SMOKE_OUT || 'smoke';
mkdirSync(out, { recursive: true });
const errors = [];
let browser;
for (let i = 0; i < 30 && !browser; i++) {
  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (!browser) throw new Error('连接不上桌面程序的调试端口 9222');
// 程序窗口的页面可能比调试端口晚就绪，最多等 30 秒
let page;
for (let i = 0; i < 60 && !page; i++) {
  page = browser.contexts()[0]?.pages()[0];
  if (!page) await new Promise((r) => setTimeout(r, 500));
}
if (!page) throw new Error('桌面程序窗口没有出现');
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text() + (m.location()?.url ? ' @ ' + m.location().url : '')));
page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url().slice(0, 200)}`));

const step = async (name, fn) => {
  try {
    await fn();
    await page.waitForTimeout(800);
  } catch (e) {
    errors.push(`${name} 失败: ${e.message}`);
  }
  await page.screenshot({ path: `${out}/${name}.png` });
  const text = (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\s+/g, ' ');
  console.log(`[${name}] ${text}`);
};

await step('01-home', async () => {
  try {
    await page.waitForSelector('.orow[role=button]', { timeout: 10000 });
  } catch {
    await page.reload(); // 页面先于内容就绪打开时刷新一次
    await page.waitForSelector('.orow[role=button]', { timeout: 20000 });
  }
});
await step('02-order', async () => { await page.click('.orow[role=button]'); await page.waitForSelector('.mcard', { timeout: 5000 }); });
await step('03-pi', async () => { await page.click('.mcard:has-text("合同 / PI")'); await page.waitForSelector('.paper', { timeout: 5000 }); });
await step('04-back', async () => { await page.click('button:has-text("← 订单菜单")'); await page.waitForSelector('.mcard', { timeout: 5000 }); });
await step('05-export', async () => { await page.click('.mcard:has-text("单据导出")'); await page.waitForSelector('.paper', { timeout: 5000 }); });
await step('06-customers', async () => { await page.click('.brand'); await page.click('.lib button:has-text("客户库")'); await page.waitForSelector('.cdet', { timeout: 5000 }); });
await step('07-calc', async () => { await page.click('.brand'); await page.click('.lib button:has-text("报价计算器")'); await page.waitForSelector('.qt', { timeout: 5000 }); });

// 导出：PDF、合同 Word、按收件人打包（文件写入「文档/外贸超级工作台」）
const waitToast = (re) => page.waitForFunction((src) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(src).test(t.textContent)), re, { timeout: 60000 });
await step('08-export-pdf', async () => {
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("合同 / PI")');
  await page.click('button:has-text("导出 PDF")'); await waitToast('已保存 PI-.*\\.pdf');
});
await step('09-export-word', async () => {
  await page.click('.pv-bar .tab:has-text("销售合同")'); await page.click('button:has-text("导出 Word")'); await waitToast('已保存 SC-.*\\.docx');
});
await step('10-export-zip', async () => {
  await page.click('button:has-text("← 订单菜单")'); await page.click('.mcard:has-text("单据导出")');
  await page.click('button:has-text("生成并打包")'); await waitToast('已打包');
});

// M1-3：设置、产品导入、删除订单
await step('11-settings', async () => {
  await page.click('.top-r button:has-text("设置")'); await page.waitForSelector('#company', { timeout: 5000 });
  await page.fill('#set-seller-name', 'Smoke Test Co., Ltd.');
});
await step('11b-stamp-pdf-and-back', async () => {
  // 生成一张白底红圈的“公章”，上传（去白底）后导出 PDF，再从订单里打开设置并返回
  const url = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 300); x.strokeStyle = '#c00'; x.lineWidth = 14; x.beginPath(); x.arc(150, 150, 120, 0, 7); x.stroke(); return c.toDataURL('image/png'); });
  const png = resolve(out, 'stamp.png');
  writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
  for (const i of [0, 0]) {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.set-sec button:has-text("上传图片")').nth(i).click()]);
    await fc.setFiles(png); await waitToast('已更新');
  }
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("合同 / PI")');
  await page.click('.top-r button:has-text("设置")'); await page.waitForSelector('#company');
  await page.click('.sec-title button:has-text("← 返回")'); await page.waitForSelector('.paper', { timeout: 5000 });
  await page.click('button:has-text("导出 PDF")'); await waitToast('已保存 PI-.*\\.pdf');
  await page.click('button:has-text("导出 Excel")'); await waitToast('已保存 PI-.*\\.xlsx');
  await page.click('.pv-bar .tab:has-text("销售合同")'); await page.click('button:has-text("导出 Word")'); await waitToast('已保存 SC-.*\\.docx');
});
await step('12-import-products', async () => {
  const csv = resolve(out, 'products.csv');
  writeFileSync(csv, '型号,中文品名,单价,外箱尺寸\nSMOKE-1,冒烟测试货架,9.9,60x40x30\n');
  await page.click('.brand'); await page.click('.lib button:has-text("产品库")');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("导入 Excel / CSV")')]);
  await fc.setFiles(csv);
  await page.waitForSelector('.modal'); await page.click('.modal .btn.pri'); await waitToast('导入完成：新增 1');
  await page.waitForSelector('.tbl tbody tr:has-text("SMOKE-1")', { timeout: 5000 });
});
await step('13-new-and-delete-order', async () => {
  await page.click('.brand'); await page.click('button:has-text("＋ 新建订单")'); await page.click('.modal .btn.pri');
  await page.waitForSelector('.mcard'); await page.waitForSelector('.paper, .mcard');
  const no = (await page.textContent('.ord-head .eyebrow')).replace('订单 ', '').trim();
  await page.click('.ord-head-r button:has-text("删除")'); await page.click('.modal .btn.danger');
  await waitToast('已删除订单 ' + no);
});

// M1-4：粘贴导入货物、单据检查、箱贴批量打印
await step('14-paste-items', async () => {
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("报价单")');
  await page.click('.step:not(.use):has-text("货物明细")');
  const before = await page.locator('.tbl tbody tr').count();
  await page.click('button:has-text("粘贴 Excel / 导入 PO")');
  await page.fill('#imp-paste', 'PO No.: SMOKE-PO-1\nItem No.\tDescription\tQty\tUnit Price\nAL-S200\tRack\t10\t12.5\nNEW-9\tNew Part\t7\t1.2');
  await page.click('.modal button:has-text("识别")');
  await page.waitForSelector('.imp-map select.on');
  await page.click('.modal button:has-text("导入 2 行")'); await waitToast('已导入 2 行货物');
  const after = await page.locator('.tbl tbody tr').count();
  if (after !== before + 2) throw new Error(`货物行数 ${before} → ${after}，应增加 2`);
});
await step('15-check-panel', async () => {
  await page.click('button:has-text("← 订单菜单")'); await page.click('.mcard:has-text("单据导出")');
  await page.waitForSelector('.chk-panel');
  // 新型号没有箱规 → 应有提醒，点一下跳到对应模块
  await page.click('.chk-item >> nth=0'); await page.waitForSelector('.mod .step.on', { timeout: 5000 });
});
await step('16-labels', async () => {
  await page.click('button:has-text("← 订单菜单")'); await page.click('.mcard:has-text("唛头箱贴")');
  await page.click('.lbl-opt:has-text("每页 8 张")');
  await page.click('button:has-text("导出箱贴 PDF")'); await waitToast('已保存 Labels-.*\\.pdf');
});

await step('17-mixed-carton', async () => {
  // 箱单：勾选两行设为混装，填整箱毛重，导出箱单 PDF 和 Excel
  await page.click('button:has-text("← 订单菜单")'); await page.click('.mcard:has-text("箱单")');
  await page.click('.step:not(.use):has-text("包装装箱")');
  const boxes = page.locator('.pack-tbl tbody input[type=checkbox]');
  await boxes.nth(1).check(); await boxes.nth(2).check();
  await page.click('button:has-text("设为混装")'); await waitToast('设为混装');
  await page.waitForSelector('.mixtag');
  await page.fill('#in-packs-0-gw', '55'); await page.fill('#in-packs-0-ctns', '2');
  // 外包装：改为托盘，填件数和自重
  await page.click('.pkg-modes .lbl-opt:has-text("托盘")');
  await page.fill('#in-pkg-count', '2'); await page.fill('#in-pkg-tare', '6');
  await page.waitForFunction(() => /SAY TOTAL TWO \(2\) PALLETS ONLY/.test(document.querySelector('.pkg-sum')?.textContent ?? ''), null, { timeout: 5000 });
  await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 PL-.*\\.pdf');
  await page.click('.mod-head button:has-text("导出 Excel")'); await waitToast('已保存 PL-.*\\.xlsx');
});

await step('18-booking-si-advice', async () => {
  // M2-1：订舱委托书、SI 补料、装船通知
  await page.click('button:has-text("← 订单菜单")'); await page.click('.mcard:has-text("订舱 / 提单")');
  await page.click('.step:not(.use):has-text("运输信息")');
  await page.selectOption('#in-shipping-consigneeMode', 'order');
  await page.fill('#in-shipping-equipment', '1×40HQ');
  await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 BK-.*\\.pdf');
  await page.click('.mod-head button:has-text("导出 Excel")'); await waitToast('已保存 BK-.*\\.xlsx');
  await page.click('.pv-bar .tab:has-text("SI 提单补料")'); await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 SI-.*\\.pdf');
  await page.click('.pv-bar .tab:has-text("装船通知")'); await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 SA-.*\\.pdf');
});

await step('19-today-wide-export-paste', async () => {
  // 首页「今天要做」、订单「关键日期」、表格加宽、导出后改过、智能粘贴
  await page.click('.brand'); await page.waitForSelector('.today', { timeout: 5000 });
  await page.click('.orow[role=button]'); await page.waitForSelector('.kd', { timeout: 5000 });
  await page.click('.mcard:has-text("箱单")'); await page.click('.step:not(.use):has-text("包装装箱")');
  await page.waitForSelector('.pv-strip', { timeout: 5000 });
  await page.click('.pv-strip'); await page.waitForSelector('.pv-split', { state: 'attached', timeout: 5000 });
  await page.click('button:has-text("收起，表格加宽")'); await page.waitForSelector('.pv-strip', { timeout: 5000 });
  await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 PL-.*\\.pdf');
  await page.fill('#in-items-0-gw', '99');
  await page.waitForSelector('.last-exp.warn', { timeout: 5000 });
  await page.click('button:has-text("← 订单菜单")'); await page.waitForSelector('.mcard .st.chg', { timeout: 5000 });
  await page.click('.mcard:has-text("报价单")'); await page.click('.step:not(.use):has-text("双方信息")');
  await page.click('button:has-text("智能粘贴")');
  await page.fill('#sp-text', 'Maria Lopez\nImport Manager\nCasa Verde Imports S.L.\nCalle Mayor 5, 28013 Madrid, Spain\nTel: +34 91 123 4567\nmaria@casaverde-demo.es');
  await page.click('.sp-foot .btn.pri');
  const v = await page.inputValue('#in-buyer-name');
  if (v !== 'Casa Verde Imports S.L.') throw new Error('智能粘贴结果不对：' + v);
});

await step('20-customer-requirements', async () => {
  // 客户要求清单：订单页逐条核对、一键按要求改；客户库里添加一条要求
  await page.click('.brand'); await page.click('.orow[role=button] >> nth=1'); await page.waitForSelector('.req-panel', { timeout: 5000 });
  await page.click('.req-item.bad >> nth=0 >> button:has-text("按要求改")'); await waitToast('已按客户要求改好');
  await page.click('.req-panel button:has-text("编辑要求")'); await page.waitForSelector('.req-ed', { timeout: 5000 });
  await page.selectOption('.req-add select', 'maxPalletH');
  await page.waitForSelector('.req-row:has-text("托盘 / 木箱高度不超过")', { timeout: 5000 });
});

await step('21-send-history-diff', async () => {
  // 发出记录与改版对比：导出 PI → 改数量 → 看改了什么 → 订单页发出记录
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("合同 / PI")');
  await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 PI-.*\\.pdf');
  // 货物在报价单里填：点侧栏「共用信息」过去改，再回到合同 / PI
  await page.click('.step.use:has-text("货物明细")'); await page.waitForSelector('.mod-head h1:has-text("报价单")', { timeout: 5000 });
  await page.fill('#in-items-0-qty', '123');
  await page.click('.back-mod:has-text("合同 / PI")'); await page.waitForSelector('.mod-head h1:has-text("合同 / PI")', { timeout: 5000 });
  await page.click('button.last-exp.warn'); await page.waitForSelector('.diff-tbl tr.d-mod', { timeout: 5000 });
  await page.click('.diff-note button:has-text("中文")');
  await page.click('.modal-h button:has-text("关闭")');
  await page.click('button:has-text("← 订单菜单")'); await page.waitForSelector('.sent-panel .sent-doc', { timeout: 5000 });
});

await step('22-doc-library', async () => {
  // 单据模板库：下载空白模板、用订单生成
  await page.click('.brand'); await page.click('.lib button:has-text("单据模板库")'); await page.waitForSelector('.dlib-card', { timeout: 5000 });
  await page.click('.dlib-card:has-text("订舱委托书") .dlib-act:has-text("空白") button:has-text("PDF")'); await waitToast('已保存 空白-订舱委托书\\.pdf');
  await page.click('.dlib-card:has-text("装箱单") .dlib-act:has-text("空白") button:has-text("Excel")'); await waitToast('已保存 空白-装箱单\\.xlsx');
  await page.click('.dlib-card:has-text("销售合同") .dlib-act:has-text("空白") button:has-text("Word")'); await waitToast('已保存 空白-销售合同\\.docx');
  await page.click('.dlib-card:has-text("商业发票") .dlib-act:has-text("订单") button:has-text("PDF")'); await waitToast('已保存 CI-.*\\.pdf');
  await page.click('.dlib-card:has-text("SI 提单补料") .dlib-tb'); await page.waitForSelector('.modal .pv', { timeout: 5000 });
  await page.click('.modal-h button:has-text("关闭")');
});

await step('23-no-duplicate-steps', async () => {
  // 每项资料只在一个模块填：商业发票里只有发票信息；点预览上的买方 → 跳到报价单的双方信息，填完回来
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("商业发票")');
  const own = await page.locator('.steps .step:not(.use)').allTextContents();
  if (own.length !== 1 || !own[0].includes('发票信息')) throw new Error('商业发票的填写步骤应只有「发票信息」：' + own.join(' | '));
  await page.click('.paper [data-f="buyer.name"] >> nth=0');
  await page.waitForSelector('.mod-head h1:has-text("报价单")', { timeout: 5000 });
  await page.waitForSelector('.step.on:has-text("双方信息")', { timeout: 5000 });
  await page.click('.back-mod:has-text("商业发票")'); await page.waitForSelector('.mod-head h1:has-text("商业发票")', { timeout: 5000 });
});

await step('24-factory-purchase', async () => {
  // M2-2：工厂采购——采购明细填采购价、按工厂各出一张采购单、成本利润、工厂资料包按工厂打
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("工厂采购")');
  await page.waitForSelector('.step.on:has-text("采购明细")', { timeout: 5000 });
  await page.fill('#in-items-0-cost', '61');
  await page.waitForSelector('.pv-fac button >> nth=1', { state: 'attached', timeout: 5000 }).catch(() => {});
  await page.click('.step:not(.use):has-text("成本利润")'); await page.waitForSelector('.pf-total', { timeout: 5000 });
  await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 CG-.*、CG-.*\\.pdf');
  await page.click('.mod-head button:has-text("导出 Excel")'); await waitToast('已保存 CG-.*\\.xlsx');
  await page.click('button:has-text("← 订单菜单")'); await page.waitForSelector('.pf-mini', { timeout: 5000 });
  await page.click('.mcard:has-text("单据导出")'); await page.click('.seg button:has-text("工厂")');
  await page.click('.seg button:has-text("义乌恒达")');
  await page.click('button:has-text("生成并打包")');
  // 前面的步骤可能留下单据检查错误：确认仍然导出
  await page.click('.modal button:has-text("仍然导出")', { timeout: 10000 }).catch(() => {});
  await waitToast('已打包 .*工厂-义乌恒达');
});

await step('25-hs-memory', async () => {
  // M2-3：HS 记忆库、报关资料里按品名自动带出、改品名整行换、网上查、打包发报关行
  await page.click('.brand'); await page.click('.lib button:has-text("HS 记忆库")'); await page.waitForSelector('.hs-tbl tbody tr', { timeout: 5000 });
  await page.click('button:has-text("下载模板")'); await waitToast('(已保存|已下载) HS记忆导入模板\\.xlsx');
  await page.waitForSelector('.hs-tbl button:has-text("网上查")', { timeout: 5000 });
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("报关资料")');
  await page.click('.step:not(.use):has-text("申报商品")');
  await page.fill('#in-items-0-hs', ''); await page.fill('#in-items-0-elements', '');
  await page.focus('#in-items-0-nameCn'); await page.click('.form-head h2');
  await page.waitForFunction(() => document.querySelector('#in-items-0-hs')?.value.length === 10, null, { timeout: 5000 });
  // 改中文品名成另一样货：整行换成它的申报要素
  await page.fill('#in-items-0-nameCn', '铝合金展示架（加重款）'); await page.click('.form-head h2');
  await page.waitForFunction(() => document.querySelector('#in-items-0-elements')?.value.includes('AL-H500'), null, { timeout: 5000 });
  await page.waitForSelector('.tbl button:has-text("网上查")', { timeout: 5000 });
  await page.click('.mod-head button:has-text("打包发报关行")');
  await page.click('.modal button:has-text("仍然打包")', { timeout: 10000 }).catch(() => {});
  await waitToast('已打包 7 个文件');
});

await step('26-certificate-of-origin', async () => {
  // M2-4：产地证——按目的国列出能用的证书，选用后导出申请资料
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("产地证")');
  await page.waitForSelector('.co-cert', { timeout: 5000 });
  await page.click('.co-cert:has-text("RCEP")'); await page.waitForSelector('.co-cert.on:has-text("RCEP")', { timeout: 5000 });
  await page.click('.mod-head button:has-text("导出 PDF")'); await waitToast('已保存 CO-.*\\.pdf');
  await page.click('.mod-head button:has-text("导出 Excel")'); await waitToast('已保存 CO-.*\\.xlsx');
});

await step('27-tools', async () => {
  // M2-5：汇率换算（手工改汇率）、金额大写、HS 查询
  await page.click('.brand'); await page.click('.lib button:has-text("汇率换算")'); await page.waitForSelector('.rt-list', { timeout: 5000 });
  await page.fill('#rt-amt', '100');
  await page.fill('.rt-row input[aria-label="USD 汇率"]', '7'); await page.click('.sec-title h1');
  await page.waitForFunction(() => [...document.querySelectorAll('.qt tr.hl b')].some((b) => b.textContent === '700.00'), null, { timeout: 5000 });
  await page.click('.brand'); await page.click('.lib button:has-text("金额大写")');
  await page.fill('#wd-amt', '1250.5');
  await page.waitForSelector('.wd-t:has-text("SAY US DOLLARS ONE THOUSAND TWO HUNDRED AND FIFTY AND CENTS FIFTY ONLY")', { timeout: 5000 });
  await page.click('.brand'); await page.click('.lib button:has-text("HS 查询")');
  await page.fill('.search input', '铝合金'); await page.waitForSelector('.tbl td:has-text("9403200000")', { timeout: 5000 });
});

await step('28-receipts', async () => {
  // M4-1：收款记录——登记定金（金额自动带出）、填结汇汇率，订单卡片显示已收 / 未收
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("收款记录")');
  await page.waitForSelector('.pay-sum', { timeout: 5000 });
  await page.click('.mod-head button:has-text("登记一笔收款")');
  await page.waitForFunction(() => Number(document.querySelector('#in-receipts-0-amount')?.value) > 0, null, { timeout: 5000 });
  await page.fill('#in-receipts-0-fee', '25'); await page.fill('#in-receipts-0-rate', '7.1');
  await page.waitForSelector('.pay-tbl td.calc:has-text("¥")', { timeout: 5000 });
  await page.click('button:has-text("← 订单菜单")'); await page.waitForSelector('.mcard:has-text("收款记录") .st:has-text("已收")', { timeout: 5000 });
});

await step('29-lc-review', async () => {
  // M4-3：信用证审证——放示例电文，查出要改证的问题、单据要求、改证函，一键按信用证改订单
  await page.click('.brand'); await page.click('.orow[role=button] >> nth=1'); await page.click('.mcard:has-text("信用证审证")');
  await page.click('button:has-text("放一份示例看看")');
  await page.waitForSelector('.lc-sum.bad', { timeout: 5000 });
  await page.waitForSelector('.lc-docs tbody tr', { timeout: 5000 });
  await page.waitForSelector('.lc-letter', { timeout: 5000 });
  await page.click('.lc-list button:has-text("订单按信用证改") >> nth=0'); await waitToast('订单已按信用证改好');
  await page.click('.mod-head button:has-text("写进关键日期")'); await waitToast('已写进订单的关键日期');
  // 换行丢了、连成一行的电文也要能拆开
  await page.fill('.lc-text', '20: LC1 31D: 261130 CHINA 32B: USD100,00 44C: 261115 46A: + COMMERCIAL INVOICE IN TRIPLICATE + PACKING LIST');
  await page.waitForFunction(() => document.querySelectorAll('.lc-f').length >= 4 && document.querySelectorAll('.lc-docs tbody tr').length === 2, null, { timeout: 5000 });
});

await step('30-bl-check', async () => {
  // M4-2：提单核对——粘贴货代草稿，毛重写错要标出来、生成修改意见，提单号能填回订单
  await page.click('.brand'); await page.click('.orow[role=button] >> nth=1'); await page.click('.mcard:has-text("提单核对")');
  await page.fill('.lc-text', 'B/L NO.: TEST123456789\nSHIPPER: QINGDAO HENGYUAN INDUSTRIAL CO., LTD.\nCONSIGNEE: ABC TRADING LLC\nNOTIFY: SAME AS CONSIGNEE\nG.W.: 1.00 KGS');
  await page.waitForSelector('.lc-sum.bad', { timeout: 5000 });
  await page.waitForSelector('.bl-tbl tr.bad:has-text("毛重")', { timeout: 5000 });
  await page.waitForSelector('.lc-letter', { timeout: 5000 });
  await page.click('.mod-head button:has-text("填进订单")'); await waitToast('TEST123456789 已填进订单');
});

await step('31-english-docs', async () => {
  // M4-4：英文单据——条款里写了中文会提示，常见写法一键翻成英文
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("报价单")');
  await page.click('.step:not(.use):has-text("编号与样式")');
  await page.fill('#in-docset-clauses', '价格有效期30天\n银行手续费由买方承担');
  await page.click('.pv-strip').catch(() => {});
  await page.click('.cn-badge'); await page.waitForSelector('.cn-list', { timeout: 5000 });
  await page.click('.modal button:has-text("一键翻成英文")'); await waitToast('已全部翻成英文');
  await page.waitForFunction(() => document.querySelector('#in-docset-clauses')?.value === 'Prices are valid for 30 days.\nBank charges are borne by the Buyer.', null, { timeout: 5000 });
  await page.click('.modal-h button:has-text("关闭")');
  await page.waitForSelector('.cn-badge', { state: 'detached', timeout: 5000 });
});

console.log('\n==== 报错 ====\n' + (errors.join('\n\n') || '无'));
await browser.close().catch(() => {});
process.exit(errors.length ? 1 : 0);
