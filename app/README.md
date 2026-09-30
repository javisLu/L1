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

## 打包

- 推送到 `main` 或开发分支后，GitHub Actions「桌面安装包」自动构建：
  - Windows：`.exe` 安装包（NSIS，当前用户安装，无需管理员权限）
  - macOS：`.dmg`（Intel 与 Apple 芯片通用）
- 在 Actions 运行记录页面底部的 Artifacts 下载。
- 目前未做代码签名：Windows 首次运行会出现 SmartScreen 提示（点「更多信息 → 仍要运行」）；macOS 需在「系统设置 → 隐私与安全性」里点「仍要打开」。

## 目录

```
src/domain     数据类型、常量、计算（金额 / 箱数 / 英文大写 / 付款条款）、示例数据
src/modules    模块、步骤、字段、表格定义，必填检查
src/store      数据存储（zustand + IndexedDB）与界面状态
src/docs       单据模板（排版积木 Box / Row / Txt / Fld，预览与 PDF 共用一套模板）
src/export     导出：PDF（react-pdf + 内嵌 Noto Sans SC）、Excel（exceljs，金额与合计为公式）、Word 合同（docx）、zip 打包、保存与「打开文件夹」
public/fonts   PDF 内嵌字体 Noto Sans SC（SIL OFL 1.1，许可证见 OFL.txt）
src/components 表单、表格、合同条款、A4 预览
src/pages      首页、订单菜单、单据工作台、导出中心、资料库、报价计算器
src-tauri      桌面外壳
```
