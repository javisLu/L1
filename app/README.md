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
- 订舱 / 提单（M2-1）：订舱委托书（PDF / Excel）、SI 提单补料（PDF / Excel）、装船通知（PDF）。数据来自订单：订舱 / 提单的「运输信息」里有收货人（同买方 / TO ORDER / 自定义）、通知人（自动 / 同买方 / 自定义）、运费（按贸易术语自动 PREPAID / COLLECT）、提单类型与正本份数、柜型柜量、货好时间、ETA、投保（CIF / CIP 自动）、订舱特殊要求、多柜明细。规则在 `src/domain/shipping.ts`。
- 导出记录：每次导出 / 打包记下时间、收件人和单据指纹（`src/domain/exports.ts`，只取该单据用到的数据）。订单菜单卡片、单据页、导出页显示「未导出 / 已导出 / 导出后又改过」。
- 发出记录与改版对比：`src/domain/history.ts`。导出时 `takeSnap` 留底，`recordSend` 记到 `Order.sent` / `Order.snaps`（按内容去重，最多 60 条）；`docVersions` 算每份单据的版本；`diffDoc` + `totalChanges` 逐项对比；`changeNote` 生成中英文改版说明。界面在 `src/components/history.tsx`。
- 单据模板库：`src/pages/DocLibrary.tsx`。空白单据由 `blankForm()`（`src/domain/factory.ts`，id 为 `__blank__`）生成：只有我方信息、没有货物；渲染时 `CleanProvider` 隐藏预览专用占位，`isBlank()` 让运费条款、提单类型、通知人等自动默认值留空；没有货物时 PDF / Excel / Word 的合计、大写留空，货物表留 8 行空行。
- 今天要做（首页）与关键日期（订单页）：规则在 `src/domain/reminders.ts`（报价到期、货好未订舱、截关、开船未改状态 / 未发装船通知、尾款、到港、信用证），尾款到期日没填时按付款方式和 ETD / ETA 推算；「知道了」存在 `Order.dismissed`，键里带日期。
- 客户要求清单：客户库 →「单据要求清单」，规则在 `src/domain/requirements.ts`（每条有 describe / check / apply）。新建订单或更换客户时 `applyCustomer` 自动套用 apply；`checkOrder(o, reqs)` 第 8 节逐条核对（确认之后不符合算错误，带一键修正）；自定义提醒的确认记在 `Order.reqDone`。订单页面板在 `src/components/requirements.tsx`。
- 智能粘贴：买方信息、客户库里的「智能粘贴」，或在买方公司名 / 地址里直接粘贴整块签名。离线规则识别，见 `src/domain/contact.ts`。
- 提单核对（M4-2）：`src/domain/bl.ts`（`checkBl` 按订单内容在草稿文字里逐项查找，`numbersBefore` / `numberAppears` 比对件毛体，`blNoIn` 取提单号，`blAskText` 给货代的修改意见）；PDF 读文字在 `src/io/pdftext.ts`（pdfjs-dist 4.10.38，worker 按 `?url` 打包）；订单上的 `Order.bl`。页面 `src/pages/BlCheck.tsx`，模块 `bl`（`special: 'bl'`）。
- 信用证审证（M4-3）：`src/domain/lc.ts`（`parseMT700` 按栏目代号拆电文，`reviewLc` 和订单比对，`docsRequired` 拆 46A 单据，`softClauses` 软条款特征，`amendmentText` 改证函，`sampleMT700` 示例电文）；订单上的 `Order.lc.text`。页面 `src/pages/LcReview.tsx`，模块 `lc`（`special: 'lc'`）。
- 收款记录（M4-1）：`src/domain/receipts.ts`（`planOf` 应收拆定金 / 尾款，`receivedOf` 已收 / 扣费 / 结汇 / 未收，`nextReceipt` 登记时的默认值，`actualProfit` 实际利润与汇率差）；订单上的 `Order.receipts`。页面 `src/pages/Payments.tsx`，模块 `payment`（`special: 'payment'`，订单菜单「收款与业务」组）。
- 小工具（M2-5）：`src/pages/Tools.tsx`（汇率换算、金额大写、HS 查询）。参考汇率在 `Settings.rates`（`RateTable`，1 外币 = ? 元），`domain/rates.ts` 的 `convert` / `fetchRates`（欧洲央行 → ExchangeRate-API 备用）；`purchase.ts` 的 `setRefRates` 由 store 同步，成本利润没填汇率时用。联网地址写在 `src-tauri/tauri.conf.json` 的 CSP `connect-src`。
- 产地证（M2-4）：`src/domain/origin.ts`。`CERTS`（证书）+ 国家 → 可用证书表；`destOf` 取目的国（运抵国优先，其次按买方地址 / 目的港推断），`certsFor` / `certOf` 给出推荐，`routeText`、`certHs`（协定证书 6 位）、`declPlace`。订单上的 `Order.co` 存证书类型、原产地标准、路线、备注、申报地点。模板 `OriginData`（`docs/templates.tsx`），Excel 在 `export/coexcel.ts`。
- HS 记忆库（M2-3）：`src/domain/hs.ts`。`DataState.hsLib`（`HsEntry`：中文品名、编号、申报要素、退税率、来源、最近使用）在 `markExported` 和填好编号 / 申报要素时由 `learn` 自动更新，升级 / 恢复备份时 `buildLib` 从产品库和订单生成。`matchFor` 先找本单同品名的行再找记忆库；`fillItems` 只补空着的格子，`renameRow` 改品名时整行替换。`hsLookupUrl` + `components/hsLookup.ts` 用系统浏览器打开 HS 编码网（桌面版权限只放行 hsbianma.com）。导入映射 `mapHs` 在 `io/library.ts`，页面在 `pages/Libraries.tsx` 的 `HsMemory`。
- 工厂采购（M2-2）：`src/domain/purchase.ts`。货物行上的 `factory`（供应工厂，空 = 订单菜单里的工厂）、`cost`（采购单价，人民币含税）、`rebate`（退税率）；`Order.purchase` 存各工厂采购单（`pos`，按工厂 id）、交货地点、质量 / 包装要求、汇率、增值税率、费用清单。`factoriesOf` / `poRows` / `poNo` 按工厂拆分，`profitOf` 算每单利润，`rmbWords` 人民币大写。采购单模板 `PurchaseOrder`（`docs/templates.tsx`，`DocView` 的 `factory` 指定工厂），Excel 在 `export/poexcel.ts`；`buildFiles` 按工厂各出一份。指纹（`exports.ts`）里给客户、货代、报关行的单据都去掉了采购字段。
- 模块不重复：每个步骤只属于一个模块（`MODS[m].steps`），本模块单据还用到的别处步骤列在 `MODS[m].uses`，侧栏显示为「共用信息」。`STEP_MOD` / `ownerOf(path)`（`src/modules/defs.ts`）找到字段真正填写的模块；`jumpToField` 和单据检查都按它跳转；从预览跳到别的模块时 `ui.back` 记住原位置。`defs.test.ts` 保证同一输入框不会出现在两个步骤里。
- 表格步骤默认收起预览（表格加宽），表单 / 预览分隔线可拖动；这两项个人习惯存在浏览器本地（`tw-ui-*`）。
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
