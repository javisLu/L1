# 外贸超级工作台 · 桌面版

Tauri 2 + React 18 + TypeScript + Vite。数据保存在本机（IndexedDB，位于应用数据目录），不上传服务器。

## 开发

```bash
cd app
npm install
npm run dev          # 浏览器里调试界面：http://localhost:1420
npm run tauri dev    # 以桌面窗口运行（需要 Rust 工具链）
npm test             # 单元测试（金额、箱数、英文大写、付款条款等）
npm run typecheck
```

## 导出

- 桌面版导出文件保存在「文档/外贸超级工作台/订单号 订单名/」（系统没有文档目录时退到「下载」）。
- PDF：所有单据；Excel：报价单、PI、商业发票、箱单、报关资料；Word：销售合同；唛头只出 PDF。

## 货物导入、单据检查、箱贴

- 货物明细 →「粘贴 Excel / 导入 PO」：粘贴从 Excel 复制的多行，或选择 .xlsx / .csv（客户 PO）。自动识别表头（中英文别名、前缀匹配如「Unit Price (USD)」），可逐列改；跳过合计行；只有金额时反算单价；按型号从产品库补全 HS、箱规、重量；识别表头上方的 PO 号。在货物表格里直接 Ctrl+V 多行也会打开导入。
- 单据检查（订单菜单、单据导出页）：缺项、尾箱、净重大于毛重、HS 位数、重复型号、唛头箱号 / PO 号、贸易术语与运费保费、柜型装载、日期等；点一条跳到对应输入框，唛头问题可一键修正。规则在 `src/modules/check.ts`。
- 混装（几样货物同一箱）：箱单 → 包装装箱，勾选几行 →「设为混装」。箱数、每箱毛重、箱规合并填写，每行填自己的每箱净重；整箱毛重按净重比例分摊到每一行（2 位小数，尾差给份额最大的一行，合计与整箱一致），箱单、报关资料每行都有净重和毛重。导入工厂箱单时 Excel 合并单元格自动识别为混装，备注里的「10@63*43*22cm」箱规按顺序填入。数据：`Order.packs`（混装箱）+ `Item.mix`，计算在 `calc()`，操作在 `src/domain/packs.ts`。
- 总件数 / 外包装（箱单 → 包装装箱下方）：散箱按箱数自动；托盘、木箱或其他单位填件数、每件尺寸（可几种）和每件自重。箱单写 SAY TOTAL … PALLETS ONLY 与「1 PALLET CONTAINS 12 CARTONS」，报关资料件数、包装种类、毛重（含自重）、PI 的 Packing 行和邮件正文同步；导入时备注里的「Pallet 1@120*80*136cm」自动识别。汇总在 `src/domain/package.ts`。
- 唛头箱贴 → 箱贴批量打印：每箱一张，箱号自动编为 n/总箱数，尾箱数量按余数；A4 每页 2/4/6/8 张或标签机 100×100、100×150 mm；可只打印部分箱号。

## 数据与备份

- 设置 → 数据与备份：立即备份（保存到「文档/外贸超级工作台/备份」）、从备份恢复、清空示例数据。
- 桌面版每天第一次打开时自动备份到应用数据目录 `backups/`，保留最近 14 份；恢复和清空前也会自动备份。

## 打包

- 推送到 `main` 或开发分支后，GitHub Actions「桌面安装包」自动构建：
  - Windows：`.exe` 安装包（NSIS，当前用户安装，无需管理员权限）
  - macOS：`.dmg`（Intel 与 Apple 芯片通用）
- 在 Actions 运行记录页面底部的 Artifacts 下载。
- 目前未做代码签名：Windows 首次运行会出现 SmartScreen 提示（点「更多信息 → 仍要运行」）；macOS 需在「系统设置 → 隐私与安全性」里点「仍要打开」。

## 目录

```
src/domain     数据类型、常量、计算（金额 / 箱数 / 英文大写 / 付款条款）、示例数据
src/modules    模块、步骤、字段、表格定义，必填检查，单据一致性检查（check.ts）
src/store      数据存储（zustand + IndexedDB）与界面状态
src/docs       单据模板（排版积木 Box / Row / Txt / Fld，预览与 PDF 共用一套模板）
src/io         导入导出与备份：CSV（自动识别 UTF-8 / GBK）与 Excel 表头识别、货物 / PO 导入（items.ts）、产品库 / 客户库导入导出、图片压缩与去白底、备份与每日自动备份
src/export     导出：PDF（react-pdf + 内嵌 Noto Sans SC）、Excel（exceljs，金额与合计为公式）、Word 合同（docx）、zip 打包、保存与「打开文件夹」
public/fonts   PDF 内嵌字体 Noto Sans SC（SIL OFL 1.1，许可证见 OFL.txt）
src/vendor     png-js 用的同步解压（react-pdf 解码透明 PNG 时，避免创建桌面版不允许的 blob: Web Worker）
src/components 表单、表格、合同条款、A4 预览
src/pages      首页、订单菜单、单据工作台、导出中心、资料库、报价计算器
src-tauri      桌面外壳
```
