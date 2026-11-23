# dsh-kb-sidebar

DSH Web 右栏「知识库」速查面板。本包为**纯前端展示与阅读插件 + 最小宿主壳**，不自带知识库存储或向量引擎，数据全部读取同源 `/kb-api`。

## 前置依赖（必须先安装上游插件）

| 依赖 | 说明 | 仓库 |
|---|---|---|
| **dsh-knowledge-base-local** | **硬依赖（功能前置）**：负责 Markdown 存储、分块检索与 `/kb-api/*` 路由 | [CodfishYao/dsh-knowledge-base-local](https://github.com/CodfishYao/dsh-knowledge-base-local) |
| **DeepSeek Harness (Web)** | 运行时宿主，提供 `sidebar.right.pane.tab` 等右侧边栏插槽 | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |

- 本插件**不修改** `dsh-knowledge-base-local` 的源码，也**不直接读写**你的 vault 文件，所有数据全部走只读/同源 `/kb-api`。
- 若尚未安装或禁用了 `dsh-knowledge-base-local`，本面板会安全降级并提示 `/kb-api 不可达`，不会导致 DSH 崩溃或白屏。

## 有什么

- **搜索**：`/kb-api/search`（BM25 + 向量混合，和 Agent 的 `kb_search` 同一套打分），280ms 防抖，回车立即。
- **点到命中处**：搜索结果里的命中段落（`heading` / `snippet`）会变成打开文档后的定位锚点，那一段高亮并滚到屏幕中间，不用自己翻。
- **目录跳转**：文档按「段」渲染，自动抽出像小标题/条目的段（`1、…`、`第3章 …`、`一、…`、`•`）做成目录，点一条滚过去。
- **标签筛选**：标签从文档列表聚合，按区分度排序，和集合筛选可叠加。
- **字号**：A- / A+ 调整（13–21px），记在 `localStorage.kbs-font-size`；默认 16px，输入框固定 ≥16px（iOS 不会因聚焦而放大页面）。
- **降级**：`/kb-api` 不可达时只显示一句提示，不抛异常；读取失败记到 `window.__KB_SIDEBAR_ERR`。

## 安装

确保已经安装并启用 `dsh-knowledge-base-local` 后，在 profile 目录（如 `~/.dsh/profiles/web`）执行：

```bash
dsh plugin --profile web add github:ymf2317-tech/dsh-kb-sidebar
```

本包的 `package.json` 已声明 `dsh.bundle.patch`（指向 `cordis.patch.yml`）与 `dsh.client`，安装后刷新页面，在右侧边栏「+」里添加「知识库」标签即可。

## 本地测试

```bash
node tools/focus-test.mjs   # 不依赖浏览器的状态与 UI 逻辑测试
node tools/smoke.mjs        # 需本地运行的 DSH 服务，载入 client.js 跑文档/目录/定位检查
```

## 依赖的 `/kb-api` 路由

`status`、`docs?collection&tag&query&limit&offset&sort`、`doc?id&offset&limit`、`search?q&collection&tags&limit&mode`。

## 已知问题与降级处理

如果上游配置的本地向量服务（例如本机 Ollama embedding）出现无响应或 `Stopping...` 卡死，`/v1/embeddings` 会长时间挂起：

- **面板侧**：搜索设 15 秒超时，超时自动退回 `mode=lexical` 纯文字检索，并在界面提示「向量服务没响应，已退回文字检索」。
- **渲染兜底**：异常信息写入 `window.__KB_SIDEBAR_ERR` 并界面提示，不白屏。

## 0.2.2 · 公式与命中（2026-11-12）

- **公式**：`$…$` / `$$…$$` 走 `latexToText()` 转成可读符号而不是显示源码——`$\gamma$-Fe`→`γ-Fe`、`$300^{\circ}\mathrm{C}$`→`300°C`、`M_n=\sum N_i M_i`→`Mₙ=Σ Nᵢ Mᵢ`、`10^{-3}\ \mathrm{s}^{-1}`→`10⁻³ s⁻¹`、`\mathrm{Fe_3C}`→`Fe₃C`、`\textcircled{2}`→`②`。是「看懂优先」的符号还原，不是 KaTeX 排版；分式用 `a/b`，多层嵌套公式只能近似。
- **轻量 Markdown**：`**粗体**`→`<strong>`、`` `代码` ``→`<code>`、标题行的 `#` 去掉。
- **命中标亮**：查词在正文里用 `<mark class="kbs-mark">` 黄底标出；打开后自动滚到命中段（先按服务端 `snippet` 定位，对不上就用查词找第一个命中的段），标题栏「命中 k/n」按钮在命中处之间循环跳。

## 0.2.3 · 命中之间来回跳（2026-11-12）

- **结果之间**：搜索有多条命中时，阅读视图标题右边出现 `‹ 2/24 ›`，点箭头切上/下一条搜索结果（自动重取该条的文档并定位到它自己的命中处），不用退回列表。
- **一篇之内**：「命中 k/n」按钮在本文的命中段之间循环；跳转后滚动对准段内**第一个标亮词**（`.kbs-mark`），不是段首。
- 从「文档列表」直接点开的文档没有结果导航（`nav=null`），行为与之前一致。

## 0.3.1 · 教材标签回归 + 清掉坏文档（2026-11-13）

- 标签 chip 过滤阈值 75% → 95%：教材 128 篇占 kaoyan 81%，被旧规则当「万能标签」误杀，右栏看不到「#教材 128」。
- 清掉 title= 的坏文档 kmwdw0pvy115208（正文是切分器 JSON，28 块 33205 字），文件移入 vault/_orphans/。

## 0.3.0 · 专注阅读 / 断点续读 / 篇间连读（2026-11-12）

- **选中态对比度修好了**：集合 chips、标签 chips、「目录」按钮的选中态以前拿 `--dsw-alias-brand-primary` 当底色，而浅色主题下这个变量会落到白/浅色，于是白底白字（用户：`这个标签页选中以后也太亮了，都看不到字了`）。现在选中态改用中性底 `--dsw-alias-interactive-bg-hover` + `--dsw-alias-label-primary` 文字 + 中性描边，深浅主题都读得清，也不再刺眼。
- **专注模式**（正文右上「专注」按钮）：整块面板头（标题 / 篇块数 / 刷新）和副标题行全部隐藏，顶部只留一条细栏 `← 篇名 A- A+ 目录 退出`；正文拿到整块高度。开关记在 `localStorage.kbs-focus`，下次打开直接进专注。
- **断点续读**：滚动时 400ms 节流记「读到第几段」（`localStorage['kbs-pos:'+id]`）。下次纯阅读打开（没有查词、没有命中）自动滚回那一段；列表页顶部出现「继续读上次的位置 · 篇名」（`localStorage.kbs-last`）。记段索引而不是 scrollTop，换字号 / 换屏宽都还能落回原处。
- **篇间连读**：正文末尾出现 `‹ 上一篇` / `下一篇 ›`，顺序取当前列表（搜索结果优先，其次文档列表）。背诵时从第一章一路往下翻，不用回列表。
- **修掉一处「点了没反应」**：列表侧的 0/280ms 防抖 `run()` 若正排着队，也会 `++seq`，把刚发起的开篇响应判成过期丢掉。现在 `openDoc` 开头先掐掉那个定时器。
- 不依赖浏览器的测试：`node tools/focus-test.mjs`（专注 / 退出 / 连读 / 继续读 / 断点）。
