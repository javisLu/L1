// 冒烟测试：连接正在运行的桌面程序（WebView2 远程调试端口），依次点开订单、模块、资料库，
// 收集页面报错并截图。用法：先以 --remote-debugging-port=9222 启动程序，再运行本脚本。
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

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
const page = browser.contexts()[0].pages()[0];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));
page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));

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

await step('01-home', () => page.waitForSelector('.orow[role=button]', { timeout: 20000 }));
await step('02-order', async () => { await page.click('.orow[role=button]'); await page.waitForSelector('.mcard', { timeout: 5000 }); });
await step('03-pi', async () => { await page.click('.mcard:has-text("合同 / PI")'); await page.waitForSelector('.paper', { timeout: 5000 }); });
await step('04-back', async () => { await page.click('button:has-text("← 订单菜单")'); await page.waitForSelector('.mcard', { timeout: 5000 }); });
await step('05-export', async () => { await page.click('.mcard:has-text("单据导出")'); await page.waitForSelector('.paper', { timeout: 5000 }); });
await step('06-customers', async () => { await page.click('.brand'); await page.click('.lib button:has-text("客户库")'); await page.waitForSelector('.cdet', { timeout: 5000 }); });
await step('07-calc', async () => { await page.click('.brand'); await page.click('.lib button:has-text("报价计算器")'); await page.waitForSelector('.qt', { timeout: 5000 }); });

console.log('\n==== 报错 ====\n' + (errors.join('\n\n') || '无'));
await browser.close().catch(() => {});
process.exit(errors.length ? 1 : 0);
