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
  await page.click('.brand'); await page.click('.orow[role=button]'); await page.click('.mcard:has-text("合同 / PI")');
  await page.click('.step:has-text("货物明细")');
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

console.log('\n==== 报错 ====\n' + (errors.join('\n\n') || '无'));
await browser.close().catch(() => {});
process.exit(errors.length ? 1 : 0);
