# GitMemo Roadmap

## 竞品借鉴 — MemPalace 启示 (2026-04-08)

> 来源：MemPalace 2 天 7200+ stars 的成功复盘。MemPalace 不是直接竞品（它服务 AI，GitMemo 服务人），但其增长策略值得借鉴。

### 产品方向

- [ ] **轻量语义检索**：在现有全文搜索基础上，加一层向量语义搜索，让"人找知识"更智能（不用对标 MemPalace 的 ChromaDB 全套，可考虑轻量方案如 sqlite-vss）
- [ ] **定义自己的 Benchmark**：设计可量化的指标体系（对话捕获覆盖率、知识查找命中率、检索速度），用数据建立可信度
- [ ] **互补集成**：考虑与 MemPalace 类 AI 记忆工具打通 — GitMemo 归档的内容可作为 AI 记忆系统的数据源

### 增长与传播

- [ ] **社区内容**：撰写"为什么你的 AI 对话值得保存"长文，投 Hacker News / V2EX / Twitter
- [ ] **强化隐私叙事**：纯本地 + Git + Markdown 的数据哲学是差异化优势，需要更显眼地传达
- [ ] **产品命名/Slogan 打磨**："Your AI conversations are assets, not disposable context" — 类似方向的一句话定位

### UX 改进

- [x] **列表手动刷新按钮**：对话和计划页面增加 RefreshCw 按钮，作为 file watcher 的手动兜底 (2026-04-08)
- [ ] **文件链路全链路 Review**：从外部写入（Claude Code / Cursor hook）→ file watcher 检测 → 前端列表刷新 → 文件展示，排查每个环节的可靠性，确保外部写入的文件能稳定、及时地出现在 App 中
