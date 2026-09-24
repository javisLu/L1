# Source Strategy

需要选择数据库、解释限制或处理失败来源时读取。

## 推荐组合

### 通用主题
`openalex,semantic,crossref`

### 计算机 / AI / 数学 / 物理
在通用组合上增加 `arxiv,dblp`。

### 生物医学
优先 `pubmed,pmc,europepmc,semantic,crossref`；预印本增加 `biorxiv,medrxiv`。

### 开放获取补充
`core,openaire,doaj,zenodo,hal`

## 已知限制

- Google Scholar：可能出现 bot detection、空结果或 CAPTCHA，不作为首选主干来源。
- Semantic Scholar：匿名访问可能限流；API key 可提升稳定性。
- CORE：API key 可提升稳定性。
- Unpaywall：需要配置邮箱，主要用于 DOI 的开放获取定位。
- IEEE Xplore / ACM DL：上游连接器需要 API key，且功能可能不完整。
- CNKI / 万方 / 维普：当前 `paper-search-mcp` 不提供这些数据库的原生连接器。

## 年份过滤

`paper-search search -y` 当前由上游 CLI 直接传给 Semantic Scholar。其他来源需要根据返回的 `published_date` 在检索后筛选。

## 元数据字段

上游标准化结果通常包含：`paper_id`、`title`、`authors`、`abstract`、`doi`、`published_date`、`pdf_url`、`url`、`source`、`citations`、`references`。

字段为空时按空值处理，禁止模型补全猜测。
