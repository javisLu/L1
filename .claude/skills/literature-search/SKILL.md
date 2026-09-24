---
name: literature-search
description: 检索、核验、筛选并按需读取学术文献。Use when the user asks to 找文献、文献检索、论文检索、找论文、查论文、literature search、recent or seminal papers、DOI/元数据核验、开放获取全文。优先调用 paper-search CLI 的 OpenAlex、Semantic Scholar、Crossref、arXiv、PubMed 等来源；禁止编造论文标题、作者、DOI 或链接。
---

# Literature Search

把“给我几篇论文”执行成一套可复查的文献检索流程。目标是给出真实、可追溯、与研究问题相关的论文，而不是生成看起来像论文的条目。

## 0. 前置检查

先检查：

```bash
paper-search sources
```

如果 `paper-search` 不存在：

1. 如果系统有 `uv`，运行：
   ```bash
   uv tool install paper-search-mcp
   ```
2. 如果没有 `uv`，告诉用户需要先安装 `paper-search-mcp`，并给出：
   ```bash
   uv tool install paper-search-mcp
   ```
   不要假装检索已经完成。

需要了解不同来源的适用场景或限制时，再读取 `references/source-strategy.md`。

## 1. 理解检索任务

从用户输入中提取：研究主题/科学问题、核心对象/方法/区域、时间范围、论文类型、需要数量、是否要求高被引/最新/经典/开放获取全文、是否需要后续下载或阅读全文。

只有当缺失信息会明显改变检索结果时才追问。否则直接开始，并在结果中写明默认假设。

默认行为：

- 未指定数量：先返回 10 篇高相关论文。
- 未指定年份：不做硬性年份过滤，兼顾近年文献与重要基础文献。
- 用户说“最新”：优先当前年份及近 2 年，并明确检索日期。
- 中文主题：先生成对应英文术语、常用缩写和同义词，再检索国际学术源。

## 2. 生成检索式

不要只搜用户原句。构造 3–6 组检索式，覆盖：核心概念、同义词/缩写、“对象+方法”、“对象+关键过程/机制”。需要领域概览时增加 `review` / `systematic review`；需要前沿时加入近年方法或技术词。

向用户展示结果时，不输出内部推理，只列最终采用的检索式。

## 3. 选择数据源

一般主题首轮优先：

```text
openalex,semantic,crossref
```

按领域增加：

- 计算机 / AI / 数学 / 物理：`arxiv,dblp`
- 生物医学：`pubmed,pmc,europepmc,biorxiv,medrxiv`
- 开放获取补充：`core,openaire,doaj,zenodo,hal`
- Google Scholar：只作补充；出现机器人验证、0 结果或失败时不要反复重试

不要默认使用 `all`。先用适合领域的来源，结果不足时再扩大覆盖。

## 4. 执行多轮检索

每组检索式先小规模开始：

```bash
paper-search search "<query>" -n 5 -s openalex,semantic,crossref
```

如果用户给了年份，可给 Semantic Scholar 增加：

```bash
-y "2021-2026"
```

注意：上游 CLI 的 `-y` 当前只直接传给 Semantic Scholar。OpenAlex、Crossref 等来源需要在检索后根据 `published_date` 再筛选年份。

首轮不足时依次：换同义词或缩写 → 去掉过窄限定 → 增加领域来源 → 最后扩大来源组合。不要为了凑数量保留明显无关论文。

## 5. 合并、去重与初筛

- DOI 相同：视为同一篇。
- DOI 为空：对标准化标题去重。
- 标题近似但版本不同：优先信息更完整、有 DOI 或正式出版版本。
- 用标题和摘要判断相关性；明显偏题删除。
- 摘要缺失时禁止编造摘要。

排序可综合：直接相关性、年份、引用数（若来源提供）、综述/奠基/关键方法属性、DOI/稳定页面/开放全文可用性。

## 6. 核验重点论文

对最终候选前 5–10 篇，尽量用第二个来源再次搜索标题：

```bash
paper-search search "<exact paper title>" -n 3 -s crossref,openalex,semantic
```

核验 `title`、`authors`、`published_date`、`doi`、`url`、`source`。

核验状态：

- `双源核验`：至少两个来源的标题与核心元数据一致
- `单源核验`：一个学术来源返回且元数据完整
- `待核验`：字段缺失或来源冲突

禁止把 `待核验` 写成确定事实。

## 7. 输出格式

默认先给结论，再给表格。必须包括：采用的检索式、使用的数据源、去重后候选数量、最终推荐数量。

推荐表格：

| # | 论文 | 年份 | 为什么相关 | DOI / 链接 | 来源 | 核验 |
|---|---|---:|---|---|---|---|

论文标题保留原文。“为什么相关”用 1–2 句中文概括，只依据标题、摘要和可核验元数据。

末尾给出：

- **优先读的 3 篇**：分别说明适合入门、方法或最新进展等哪个目的
- **检索局限**：失败的数据源、缺失全文、未覆盖数据库等

## 8. 全文读取与下载

用户要求读全文、提取方法、总结某篇论文时：

```bash
paper-search read <source> <paper_id> -o ./downloads
```

用户明确要求下载 PDF 时：

```bash
paper-search download <source> <paper_id> -o ./downloads
```

规则：

- 读取失败就说明失败，不根据标题猜正文。
- 只有实际拿到全文后，才能声称“根据全文”。
- 优先开放获取和出版方允许访问的全文。
- 不自动启用 Sci-Hub 或其他受限来源。
- 同一论文有多个版本时优先正式出版版；否则可用可信预印本并标注。

## 9. 重要限制

- 主要覆盖国际学术数据库和开放学术源，不等于知网、万方、维普检索。
- Google Scholar 可能触发机器人检测；失败时以 OpenAlex、Semantic Scholar、Crossref 等为主。
- “没有搜到”应表述为“本轮已使用的数据源未检索到”。
- 禁止编造标题、作者、年份、期刊、DOI、引用数、链接或全文内容。
