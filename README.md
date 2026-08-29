# 热点速拍 · 短视频热点索引

聚合微博 / 抖音 / 知乎 / 百度 / 头条 / B站 六大平台热榜，另有腾讯娱乐榜（花边新闻）和 RFI 国际新闻（国际形势与地缘政治）两个特色频道。AI 自动生成热点摘要和短视频制作方案，每 30 分钟自动更新。顶部搜索框可快速定位指定新闻。

特色版面：
- **🔥3日最热**：跨 3 天累计热度榜，持续在榜、跨平台传播的话题排前面（部署满 3 天后数据最准）
- **🎬 AI 视频化**：选中任意新闻，浏览器直连 DeepSeek 生成约 30 秒的 AI 视频创意剧本（分镜 + 文案 + 旁白），并输出可直接粘贴到 Seedance 2.5 的整合提示词，不满意可一键"刷新重生"

## 项目结构

```
├── index.html / style.css / app.js   # 前端（纯静态，直接读 data/data.json）
├── fetcher/
│   ├── sources.py    # 各平台热榜抓取（60s API 优先，官方接口自动兜底）
│   ├── dedupe.py     # 跨平台热点去重合并
│   ├── enrich.py     # DeepSeek API 生成摘要 + 视频制作方案（带缓存、失败降级）
│   ├── history.py    # 3 天热度历史累积，生成"3日最热"榜单
│   └── main.py       # 主流程
├── data/
│   ├── data.json     # 前端数据（Actions 自动提交）
│   ├── state.json    # AI 结果缓存（避免重复加工同一热点）
│   └── history.json  # 3 天热度历史
└── .github/workflows/update.yml      # 每 30 分钟定时更新
```

## 本地运行

```bash
pip install -r requirements.txt
python fetcher/main.py        # 生成 data/data.json
python -m http.server 8000    # 打开 http://localhost:8000
```

API Key 配置（二选一）：
- 环境变量 `DEEPSEEK_API_KEY`
- 本地文件 `fetcher/secrets.json`：`{"deepseek_api_key": "sk-..."}`（已在 .gitignore，不会提交）

未配置或 API 不可用时自动降级：热榜正常更新，AI 分析标记为"生成中"。

## 网页端更新 API Key

页面右上角 ⚙ 按钮打开「API 设置」窗口，无需改代码即可更换 DeepSeek Key：

1. 填入仓库所有者、仓库名、GitHub Token（PAT，需 repo 权限）、新的 DeepSeek Key
2. 点「保存并更新」后，网页会将 Key 加密写入仓库 Secret（`DEEPSEEK_API_KEY`），并自动触发一次热点数据重新生成
3. 约 1-2 分钟后刷新页面即可看到新 Key 生成的 AI 分析

Token 和 Key 仅保存在本机浏览器 localStorage，不经过任何第三方服务器。

## 部署步骤（GitHub 账号：cxhzzb）

1. **推送代码到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "init: 热点速拍"
   git remote add origin https://github.com/cxhzzb/hot-video-topics.git
   git push -u origin main
   ```
   （仓库名可自定，先在 github.com 网页上创建空仓库）

2. **配置 API Key**
   仓库页面 → Settings → Secrets and variables → Actions → New repository secret：
   - Name: `DEEPSEEK_API_KEY`
   - Value: 你的 DeepSeek API Key

3. **开启 GitHub Pages**
   仓库页面 → Settings → Pages → Source 选 "Deploy from a branch" → Branch 选 `main` / `(root)` → Save。
   几分钟后网页上线：`https://cxhzzb.github.io/hot-video-topics/`

4. **验证定时任务**
   仓库页面 → Actions → "更新热点数据" → Run workflow 手动跑一次确认无报错。
   之后每 30 分钟自动更新（GitHub 调度可能延迟数分钟，属正常现象）。

## 常见问题

- **Actions 报 429 / quota 错误**：DeepSeek 账户余额不足，充值后到 platform.deepseek.com 重新生成 Key 并更新 Secret。
- **某平台数据为空**：该源临时故障，下次运行自动恢复。60s 公共实例会拦截 GitHub Actions 的机房 IP，线上运行时各平台会自动切换到官方接口；知乎反爬严格暂无线上备用源（本地运行时可正常获取）。
- **想调整更新频率**：改 `.github/workflows/update.yml` 里的 cron 表达式。

## 后续可扩展

- 每日 8 点企业微信 / Telegram 推送 Top10
- 历史热点归档与热度趋势图
- "想拍 / 已拍" 标记（需加简单后端）
