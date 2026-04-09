# GitMemo TODO

## Product Hunt 发布准备

- [ ] 注册 Product Hunt maker 账号，关联 GitHub
- [ ] 准备 Tagline（60字符以内）：`Auto-sync your AI conversations and notes to Git`
- [ ] 撰写 Product Hunt Description：突出 zero daemon + data ownership + open source
- [ ] 准备 Gallery：3-5 张截图或 demo GIF（桌面端 + 官网 + 终端）
- [ ] 撰写 Maker Comment：第一条评论讲为什么做这个产品
- [ ] 选择发布时间：建议太平洋时间 00:01（北京时间下午 3 点）
- [ ] 版本号策略：考虑是否 bump 到 1.0.0

## 官网优化

- [ ] 添加 FAQ 区块（安装、兼容性、数据隐私等常见问题）
- [ ] 添加安全/隐私声明（SSH key 处理、数据不离开本地等）
- [ ] 删除旧截图 `website/src/assets/screenshot-20260409-075619.png`

## 产品改进

- [ ] macOS 代码签名（消除 `xattr -cr` 的首次安装摩擦）
- [ ] Dashboard 区块可配置显示/隐藏（Settings 中加开关）
