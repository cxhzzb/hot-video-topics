# 热点速拍 · 短视频热点索引

聚合微博 / 抖音 / 知乎 / 百度 / 头条 / B站 六大平台热榜，另有腾讯娱乐榜（花边新闻）和 RFI 国际新闻（国际形势与地缘政治）两个特色频道。AI 自动生成热点摘要和短视频制作方案，每 30 分钟自动更新。顶部搜索框可快速定位指定新闻。

PWA 支持：手机浏览器打开后「添加到主屏幕」，即可像 App 一样全屏使用，断网时也能查看最近一次缓存的热点数据。
- 安卓 Chrome：菜单 → 添加到主屏幕 / 安装应用
- iPhone Safari：分享按钮 → 添加到主屏幕
- 微信内打开：右上角「…」→ 在浏览器打开，再按上面操作

## 缓存与更新机制

前端由 Service Worker（`sw.js`）缓存，保证秒开和离线可用：

- **自动更新**：新版本部署后，页面检测到 Service Worker 变更会自动刷新一次（表现为页面闪一下），用户无需任何操作
- **手动强制刷新**（一般不需要，自动机制失效时使用）：
  - 电脑：`Ctrl + F5`（Mac：`Cmd + Shift + R`）
  - 手机浏览器：关闭标签页后重新打开网址
  - 桌面图标（PWA）：卸载后重新添加
- **开发者注意**：每次修改前端文件（`index.html` / `app.js` / `style.css` / 图标）部署前，必须递增 `sw.js` 中的 `CACHE_NAME` 版本号（如 `hot-spot-v3` → `hot-spot-v4`），否则老用户的浏览器会一直使用旧缓存，看不到新功能

特色版面：
- **🔥3日最热**：跨 3 天累计热度榜，持续在榜、跨平台传播的话题排前面（部署满 3 天后数据最准）
- **🎬 AI 视频化**：选中任意新闻，浏览器直连 DeepSeek 生成约 30 秒的 AI 视频创意剧本（分镜 + 文案 + 旁白），并输出可直接粘贴到 Seedance 2.5 的整合提示词，不满意可一键"刷新重生"
- **📡 传播分析**：基于每 30 分钟的采集记录分析热点跨平台传播——上升期话题（刚冒头未扩散，抢拍窗口）、平台角色榜（谁常当源头、谁跟进慢）、热点传播路径（扩散顺序与跨度）
- **⚡ 电力宣传**：AI 给每个热点打"电力宣传植入适配度"（0-10 分）并给出植入角度，按分数排序——保供电、电力抢修、新能源充电桩、用电量看经济等天然关联话题排前面；涉及伤亡/重大负面的话题自动降分，避免灾难营销

## ⚡ 电力宣传版面（国家电网宣传向）

面向电力宣传岗位的借势选题工具，解决"每天这么多热点，哪些能自然植入电网宣传"的问题。

**工作方式**：DeepSeek 加工热点时同步评估两个字段——

- `score`（0-10 分）：该热点与电力元素的关联潜力。高分典型场景：
  - 高温 / 寒潮 / 极端天气 → 迎峰度夏（度冬）、用电负荷创新高、一线保电
  - 台风 / 暴雨 / 洪涝 → 电力抢修、应急保电、复电速度
  - 新能源车 / 算力 / 芯片制造 → 充电桩布局、特高压、智能电网保障产业
  - 大型活动 / 演唱会 / 赛事 → 保电护航
  - 经济数据 / 制造业景气 → 用电量作为经济"晴雨表"
  - 开学季 / 安全话题 → 安全用电科普
- `angle`：分数 ≥4 时给出具体植入角度（一句话），<4 分标记"不建议植入"

**风控规则**：涉及人员伤亡、灾难、重大负面舆情的话题强制保守打分（≤3 分），避免"灾难营销"引发反感。版面内 ≥3 分按分数降序展示；其他版面中 ≥7 分的话题带 `⚡分数` 标记，刷榜时一眼可见。

**使用建议**：每天先看「⚡电力宣传」版面顶部的高分话题，结合「📡传播分析」的上升期话题判断抢拍窗口，再用「🎬 AI 视频化」直接生成 30 秒剧本。

**调整评分口径**：改 `fetcher/enrich.py` 中 `PROMPT_TEMPLATE` 的 power 字段说明（如增加"农网改造""充电桩下乡"等本季度宣传重点），改完后旧缓存会自动失效重评一次。

## 项目结构

```
├── index.html / style.css / app.js   # 前端（纯静态，直接读 data/data.json）
├── fetcher/
│   ├── sources.py    # 各平台热榜抓取（60s API 优先，官方接口自动兜底）
│   ├── dedupe.py     # 跨平台热点去重合并
│   ├── enrich.py     # DeepSeek API 生成摘要 + 视频制作方案（带缓存、失败降级）
│   ├── history.py    # 3 天热度历史累积，生成"3日最热"榜单
│   ├── propagation.py # 跨平台传播路径分析
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
