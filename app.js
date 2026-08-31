/* 热点速拍前端：读取 data/data.json 渲染热点卡片 */

const FALLBACK_CATEGORIES = ["全部"];

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function topicCategory(t) {
  // 国际新闻源（RFI）话题强制归入"国际"频道，保证频道内容完整
  if ((t.platforms || []).includes("rfi")) return "国际";
  return (t.ai && t.ai.category) || "其他";
}

function topicText(t) {
  // 话题的全部可搜索文本
  const ai = t.ai || {};
  return [t.title, t.raw_title, t.desc, ai.title, ai.summary,
    (ai.angles || []).join(" "), ai.hook, ai.structure].join(" ").toLowerCase();
}

function renderTabs(categories, active, onSelect) {
  const nav = document.getElementById("tabs");
  nav.innerHTML = "";
  for (const cat of categories) {
    const btn = document.createElement("button");
    btn.className = "tab" + (cat === active ? " active" : "");
    btn.textContent = cat;
    btn.onclick = () => onSelect(cat);
    nav.appendChild(btn);
  }
}

function badgeHtml(t, platformNames) {
  return t.platforms.map(p => {
    const name = platformNames[p] || p;
    const link = t.links && t.links[p];
    return link
      ? `<a class="badge" href="${escapeHtml(link)}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`
      : `<span class="badge">${escapeHtml(name)}</span>`;
  }).join("");
}

function planHtml(ai) {
  const angles = (ai.angles || []).map(a => `<li>${escapeHtml(a)}</li>`).join("");
  return `
    <div class="plan-row"><span class="plan-label">🎯 选题角度</span><ul>${angles}</ul></div>
    <div class="plan-row"><span class="plan-label">⏱ 前3秒钩子</span><p>${escapeHtml(ai.hook)}</p></div>
    <div class="plan-row"><span class="plan-label">📐 内容结构</span><p>${escapeHtml(ai.structure)}</p></div>
    <div class="plan-row"><span class="plan-label">🎬 推荐形式</span><p>${escapeHtml(ai.format)}</p></div>
    <div class="plan-row risk"><span class="plan-label">⚠️ 风险提示</span><p>${escapeHtml(ai.risk)}</p></div>`;
}

const HOT3D_TAB = "🔥3日最热";
const ANALYSIS_TAB = "📡传播分析";
const POWER_TAB = "⚡电力宣传";

/* ---------- 传播分析版面 ---------- */

function fmtDelay(min) {
  if (min < 60) return `${min} 分钟`;
  return `${(min / 60).toFixed(1)} 小时`;
}

function fmtTime(iso) {
  // "2026-08-30T03:41:52+08:00" → "08-30 03:41"
  return (iso || "").slice(5, 16).replace("T", " ");
}

function analysisHtml(ana, pn) {
  if (!ana) return `<p class="empty">传播分析数据生成中，下次更新后可见</p>`;
  const name = p => (pn && pn[p]) || p;

  const roleRows = (ana.origin_rank || []).map(r => `
    <div class="role-row">
      <span class="role-name">${escapeHtml(name(r.platform))}</span>
      <span class="role-stat">源头 <b>${r.origin_count}</b> 次</span>
      <span class="role-stat">${r.avg_delay_min === 0 && r.origin_count > 0
        ? "常任源头" : `平均跟进延迟 ${fmtDelay(r.avg_delay_min)}`}</span>
    </div>`).join("");

  const pathRows = (ana.paths || []).map(p => {
    const chain = p.path.map((s, i) =>
      `<span class="path-node${i === 0 ? " src" : ""}">${escapeHtml(name(s.platform))}<i>${fmtTime(s.time)}</i></span>`
    ).join('<span class="path-arrow">→</span>');
    return `<div class="path-row">
      <p class="path-title">${escapeHtml(p.title)}<span class="path-span">跨度 ${fmtDelay(p.span_min)}</span></p>
      <p class="path-chain">${chain}</p>
    </div>`;
  }).join("");

  return `
    <p class="search-hint">基于每 30 分钟的采集记录，分析热点在哪个平台先爆、多久扩散到其他平台。数据积累越久越准。</p>
    <h3 class="ana-h">🌱 上升期话题 · 抢拍窗口</h3>
    <p class="ana-desc">刚在 1-2 个平台冒头、还没全网扩散的话题——现在拍，就是首发。</p>
    <div id="emerging-list"></div>
    <h3 class="ana-h">🧭 平台角色榜</h3>
    <p class="ana-desc">谁常当源头（去哪盯首发），谁总慢半拍（在那发还有第二波流量）。</p>
    <div class="ana-card">${roleRows || '<p class="empty">数据积累中</p>'}</div>
    <h3 class="ana-h">🔀 热点传播路径</h3>
    <p class="ana-desc">多平台话题的扩散顺序，标注为源头的是该话题最早出现的平台。</p>
    <div class="ana-card">${pathRows || '<p class="empty">数据积累中</p>'}</div>`;
}

const TREND_LABEL = {
  up: ["📈 上升中", "trend-up"],
  down: ["📉 回落中", "trend-down"],
  flat: ["➖ 平稳", "trend-flat"],
  new: ["🆕 新上榜", "trend-new"],
};

function statsBodyHtml(stats, platformNames) {
  const name = p => (platformNames && platformNames[p]) || p;
  const chain = (stats.path || []).map((s, idx) =>
    `<span class="path-node${idx === 0 ? " src" : ""}">${escapeHtml(name(s.platform))}<i>${fmtTime(s.time)}</i></span>`
  ).join('<span class="path-arrow">→</span>');
  const log = stats.heat_log || [];
  const max = Math.max(1, ...log.map(x => x.heat));
  const bars = log.map(x =>
    `<span class="trend-bar" style="height:${Math.max(8, Math.round(x.heat / max * 28))}px" title="${fmtTime(x.time)} 热度${x.heat}"></span>`
  ).join("");
  const [trendText, trendCls] = TREND_LABEL[stats.trend] || TREND_LABEL.new;
  return `
    <div class="plan-row"><span class="plan-label">🎯 首发</span>
      <p><b>${escapeHtml(name(stats.origin_platform))}</b> · ${fmtTime(stats.first_seen)}
         <span class="${trendCls} trend-tag">${trendText}</span></p></div>
    ${chain ? `<div class="plan-row"><span class="plan-label">🔀 传播路径</span><p class="path-chain">${chain}</p></div>` : ""}
    <div class="plan-row"><span class="plan-label">📊 热度趋势（近6小时）</span>
      <p><span class="trend-chart">${bars || "数据积累中"}</span></p></div>
    <div class="plan-row"><span class="plan-label">📅 在榜记录</span>
      <p>${stats.days} 天 · 出现 ${stats.appearances} 轮</p></div>`;
}

function cardHtml(t, i, platformNames, showPower) {
  const ai = t.ai;
  const pw = ai && ai.power;
  const pwScore = pw ? Number(pw.score) || 0 : 0;
  // 电力宣传：≥7分常驻小闪电标记；电力版面显示完整植入角度
  const powerTag = pwScore >= 7 ? `<span class="power-tag">⚡${pwScore}</span>` : "";
  const powerRow = (showPower && pw)
    ? `<div class="plan-row power-row"><span class="plan-label">⚡ 植入适配 ${pwScore}/10</span><p>${escapeHtml(pw.angle)}</p></div>`
    : "";
  // 重点内容：有 AI 用 AI 摘要，没有就用平台原始描述兜底
  const descText = t.desc ? t.desc.slice(0, 120) + (t.desc.length > 120 ? "…" : "") : "";
  const keyText = (ai && ai.summary) || descText;
  const keyHtml = keyText
    ? `<p class="summary"><span class="kc-label">📌 重点内容</span>${escapeHtml(keyText)}</p>`
    : (ai ? "" : `<p class="no-ai">AI 分析生成中，下次更新后可见</p>`);
  const aiBody = ai
    ? `${keyHtml}
       <div class="plan-toggle" data-label="▶ 查看视频制作方案">▶ 查看视频制作方案</div>
       <div class="plan">${planHtml(ai)}</div>`
    : keyHtml;
  // 缩略图：加载失败（防盗链/失效）时自动移除，不留破图
  const thumb = t.cover
    ? `<img class="thumb" src="${escapeHtml(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`
    : "";
  const catTag = ai ? `<span class="cat-tag">${escapeHtml(ai.category)}</span>` : "";
  const heatText = t.days ? `热度 ${t.heat} · 在榜${t.days}天` : `热度 ${t.heat}`;
  // 传播数据摘要行：常驻显示，不用点开
  const name = p => (platformNames && platformNames[p]) || p;
  let statsBar = "";
  if (t.stats) {
    const [trendText, trendCls] = TREND_LABEL[t.stats.trend] || TREND_LABEL.new;
    const pathNames = (t.stats.path || []).map(s => escapeHtml(name(s.platform))).join(" → ");
    statsBar = `<p class="stats-summary">
      <span class="${trendCls} trend-tag">${trendText}</span>
      <span class="ss-item">🎯 ${escapeHtml(name(t.stats.origin_platform))}首发 ${fmtTime(t.stats.first_seen)}</span>
      ${pathNames ? `<span class="ss-item">🔀 ${pathNames}</span>` : ""}
    </p>`;
  }
  return `
    <div class="card">
      <div class="card-top">
        <span class="rank">${i + 1}</span>
        <span class="card-title">${escapeHtml(t.title)}</span>
        ${thumb}
      </div>
      <div class="badges">${badgeHtml(t, platformNames)}${catTag}${powerTag}<span class="heat">${heatText}</span></div>
      ${statsBar}
      ${aiBody}
      ${powerRow}
      ${t.stats ? `<button class="plan-toggle stats-toggle-btn" data-label="📊 详细传播数据（趋势图/在榜记录）">📊 详细传播数据</button>
      <div class="plan stats-body">${statsBodyHtml(t.stats, platformNames)}</div>` : ""}
      <button class="video-btn" data-idx="${i}">🎬 AI 视频化（30秒剧本 · Seedance）</button>
    </div>`;
}

function render(data, activeCat, query) {
  const topics = data.topics || [];
  const cats = [...FALLBACK_CATEGORIES, HOT3D_TAB, ANALYSIS_TAB, POWER_TAB,
    ...new Set(topics.map(topicCategory).filter(c => c && c !== "其他")), "其他"]
    .filter((c, i, arr) => arr.indexOf(c) === i);

  query = (query || "").trim().toLowerCase();
  let filtered, hintHtml = "", showPower = false;
  if (query) {
    // 搜索模式：跨全部分类匹配
    filtered = topics.filter(t => topicText(t).includes(query));
    const q = encodeURIComponent(query);
    hintHtml = `<p class="search-hint">搜索「${escapeHtml(query)}」：命中 ${filtered.length} 条</p>`;
    if (!filtered.length) {
      hintHtml += `<p class="ext-search">站内未收录，去平台搜：
        <a href="https://s.weibo.com/weibo?q=${q}" target="_blank" rel="noopener">微博搜索</a>
        <a href="https://www.baidu.com/s?wd=${q}" target="_blank" rel="noopener">百度搜索</a>
        <a href="https://www.douyin.com/search/${q}" target="_blank" rel="noopener">抖音搜索</a></p>`;
    }
  } else if (activeCat === HOT3D_TAB) {
    // 3 日最热版面：跨 3 天累计热度榜
    filtered = data.top3d || [];
    hintHtml = `<p class="search-hint">近 3 天持续在榜、跨平台传播的话题（部署满 3 天后数据最准）</p>`;
  } else if (activeCat === ANALYSIS_TAB) {
    // 传播分析版面：独立布局，单独渲染
    const main2 = document.getElementById("topics");
    main2.innerHTML = analysisHtml(data.analysis, data.platform_names);
    const emerging = (data.analysis && data.analysis.emerging) || [];
    const listEl = document.getElementById("emerging-list");
    if (listEl) {
      listEl.innerHTML = emerging.length
        ? emerging.map((t, i) => cardHtml(t, i, data.platform_names || {})).join("")
        : `<p class="empty">当前没有符合条件的上升期话题</p>`;
      listEl.querySelectorAll(".video-btn").forEach(el => {
        el.onclick = () => openVideoStudio(emerging[Number(el.dataset.idx)]);
      });
      listEl.querySelectorAll(".plan-toggle").forEach(el => {
        el.onclick = () => {
          const plan = el.nextElementSibling;
          const open = plan.classList.toggle("open");
          el.textContent = open ? "▼ 收起" : (el.dataset.label || "▶ 展开");
        };
      });
    }
    renderTabs(cats, activeCat, cat => {
      document.getElementById("search-input").value = "";
      render(data, cat, "");
    });
    return;
  } else if (activeCat === POWER_TAB) {
    // 电力宣传版面：按植入适配度降序（≥3 分）
    filtered = topics
      .filter(t => t.ai && t.ai.power && (Number(t.ai.power.score) || 0) >= 3)
      .sort((a, b) => (Number(b.ai.power.score) || 0) - (Number(a.ai.power.score) || 0));
    hintHtml = `<p class="search-hint">按电力宣传植入适配度排序（≥3分），分数越高越适合借势植入电网宣传；涉及伤亡/重大负面的话题已自动降分</p>`;
    showPower = true;
  } else {
    filtered = activeCat === "全部"
      ? topics
      : topics.filter(t => topicCategory(t) === activeCat);
  }

  const main = document.getElementById("topics");
  main.innerHTML = hintHtml + (filtered.length
    ? filtered.map((t, i) => cardHtml(t, i, data.platform_names || {}, showPower)).join("")
    : (query ? "" : `<p class="empty">该分类暂无热点</p>`));

  // 方案/数据区展开收起
  main.querySelectorAll(".plan-toggle").forEach(el => {
    el.onclick = () => {
      const plan = el.nextElementSibling;
      const open = plan.classList.toggle("open");
      el.textContent = open ? "▼ 收起" : (el.dataset.label || "▶ 展开");
    };
  });

  // AI 视频化按钮
  main.querySelectorAll(".video-btn").forEach(el => {
    el.onclick = () => openVideoStudio(filtered[Number(el.dataset.idx)]);
  });

  renderTabs(cats, query ? "" : activeCat, cat => {
    document.getElementById("search-input").value = "";  // 切分类时退出搜索
    render(data, cat, "");
  });
}

async function init() {
  try {
    const resp = await fetch(`data/data.json?t=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    document.getElementById("updated-at").textContent =
      (data.updated_at || "").replace("T", " ").slice(0, 19);
    render(data, "全部", "");
    // 搜索框：输入即搜（防抖 200ms）
    let timer = null;
    document.getElementById("search-input").addEventListener("input", e => {
      clearTimeout(timer);
      timer = setTimeout(() => render(data, "全部", e.target.value), 200);
    });
  } catch (e) {
    document.getElementById("topics").innerHTML =
      `<p class="empty">数据加载失败：${escapeHtml(e.message)}</p>`;
    document.getElementById("updated-at").textContent = "加载失败";
  }
}

init();

/* ================= API 设置弹窗 =================
 * 原理：网页通过 GitHub API 把新的 DeepSeek Key 加密写入仓库 Secret
 * （DEEPSEEK_API_KEY），再触发 workflow_dispatch 重新生成数据。
 * Token 与 Key 只存在本机浏览器 localStorage。
 */

const LS_KEYS = { owner: "hsp_gh_owner", repo: "hsp_gh_repo", token: "hsp_gh_token" };

function detectRepo() {
  // GitHub Pages: https://<owner>.github.io/<repo>/...
  if (location.hostname.endsWith(".github.io")) {
    return {
      owner: location.hostname.split(".")[0],
      repo: location.pathname.split("/").filter(Boolean)[0] || "",
    };
  }
  return { owner: "", repo: "" };
}

function openSettings() {
  const detected = detectRepo();
  document.getElementById("gh-owner").value =
    localStorage.getItem(LS_KEYS.owner) || detected.owner;
  document.getElementById("gh-repo").value =
    localStorage.getItem(LS_KEYS.repo) || detected.repo;
  document.getElementById("gh-token").value =
    localStorage.getItem(LS_KEYS.token) || "";
  document.getElementById("ds-key").value = "";
  setStatus("");
  document.getElementById("settings-modal").classList.remove("hidden");
}

function setStatus(msg, cls) {
  const el = document.getElementById("settings-status");
  el.textContent = msg;
  el.className = cls || "";
}

async function ghApi(path, token, options = {}) {
  const resp = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GitHub API ${resp.status}: ${body.slice(0, 120)}`);
  }
  return resp.status === 204 ? null : resp.json();
}

async function updateApiKey() {
  const owner = document.getElementById("gh-owner").value.trim();
  const repo = document.getElementById("gh-repo").value.trim();
  const token = document.getElementById("gh-token").value.trim();
  const dsKey = document.getElementById("ds-key").value.trim();

  if (!dsKey) {
    setStatus("DeepSeek API Key 必填（AI 视频创意生成要用）", "err");
    return;
  }
  // Key 始终保存到本机，供 AI 视频创意工作室直接调用
  localStorage.setItem(DS_KEY_STORE, dsKey);

  if (!owner || !repo || !token) {
    setStatus("✅ Key 已保存到本机，AI 视频创意功能可用了。如需同步更新线上定时任务的 Key，请把仓库信息和 Token 也填上再保存一次。", "ok");
    return;
  }
  const saveBtn = document.getElementById("settings-save");
  saveBtn.disabled = true;
  try {
    // 1. 记住仓库信息，下次免填
    localStorage.setItem(LS_KEYS.owner, owner);
    localStorage.setItem(LS_KEYS.repo, repo);
    localStorage.setItem(LS_KEYS.token, token);

    // 2. 获取仓库公钥并用 libsodium 加密新 Key（GitHub 要求的格式）
    if (!window.sodium) {
      throw new Error("加密组件尚未加载完成，请稍候几秒再点保存");
    }
    setStatus("正在获取仓库公钥…");
    const pub = await ghApi(`/repos/${owner}/${repo}/actions/secrets/public-key`, token);
    const encrypted = sodium.to_base64(
      sodium.crypto_box_seal(
        sodium.from_string(dsKey),
        sodium.from_base64(pub.key, sodium.base64_variants.ORIGINAL)
      ),
      sodium.base64_variants.ORIGINAL
    );

    // 3. 写入仓库 Secret
    setStatus("正在写入新的 API Key…");
    await ghApi(`/repos/${owner}/${repo}/actions/secrets/DEEPSEEK_API_KEY`, token, {
      method: "PUT",
      body: JSON.stringify({ encrypted_value: encrypted, key_id: pub.key_id }),
    });

    // 4. 触发一次数据更新
    setStatus("正在触发热点重新生成…");
    await ghApi(`/repos/${owner}/${repo}/actions/workflows/update.yml/dispatches`, token, {
      method: "POST",
      body: JSON.stringify({ ref: "main" }),
    });

    setStatus("✅ 更新成功！热点数据正在后台重新生成，约 1-2 分钟后刷新本页即可看到 AI 分析。", "ok");
  } catch (e) {
    setStatus(`失败：${e.message}（请检查仓库名、Token 权限是否含 repo）`, "err");
  } finally {
    saveBtn.disabled = false;
  }
}

document.getElementById("settings-btn").onclick = openSettings;
document.getElementById("settings-cancel").onclick = () =>
  document.getElementById("settings-modal").classList.add("hidden");
document.getElementById("settings-save").onclick = updateApiKey;
document.getElementById("settings-modal").onclick = e => {
  if (e.target.id === "settings-modal") e.target.classList.add("hidden");
};

/* ================= AI 视频创意工作室 =================
 * 选中一条新闻 → 浏览器直连 DeepSeek 生成约 30 秒的 AI 视频创意剧本，
 * 输出可直接粘贴到 Seedance 2.5 的整合提示词；不满意可"刷新重生"。
 * DeepSeek Key 从本机 localStorage 读取（在 ⚙ 设置中保存）。
 */

const DS_KEY_STORE = "hsp_ds_key";
const videoState = { topic: null, lastConcept: "", loading: false };

function buildVideoPrompt(topic, avoidConcept) {
  const summary = (topic.ai && topic.ai.summary) || topic.desc || "（无更多背景，请根据标题自行补充常识性背景）";
  const avoid = avoidConcept
    ? `\n注意：上一版创意方向是「${avoidConcept}」，用户不满意。这次必须换一个完全不同的创意方向、视觉风格和叙事结构。`
    : "";
  return `你是一位顶级短视频导演，精通 AI 视频生成工具（Seedance 2.5）的提示词写法。
请把下面的新闻改编成一个约 30 秒的 AI 生成视频方案。

新闻标题：${topic.title}
新闻背景：${summary}
${avoid}
输出严格的 JSON（不要输出任何其他内容）：
{
  "concept": "创意概念：一句话说明切入点，要有反差/悬念/情绪冲击力",
  "style": "整体视觉风格（如写实电影感、赛博朋克、3D动画、水墨国风、复古胶片、像素风等，选一个最适合这条新闻的）",
  "shots": [
    {
      "time": "如 0-3s",
      "visual": "画面内容的具体描述（主体、动作、场景）",
      "camera": "镜头语言（推近/拉远/环绕/特写/航拍/手持跟拍等）",
      "caption": "屏幕文案（不超过15字，大字报风格）",
      "voice": "旁白（1-2句，口语化）"
    }
  ],
  "seedance_prompt": "一段可直接粘贴到 Seedance 2.5 的完整中文视频生成提示词：融合场景、主体、动作、镜头运动、风格、光线氛围，200字以内，不要出现真实名人姓名（用'一位青年男子'这类描述代替）"
}
要求：shots 共 4-6 个镜头，总时长约 30 秒；第一个镜头必须在 0-3 秒内抓住注意力；seedance_prompt 只描述一个最具代表性的核心镜头画面。`;
}

async function callDeepSeek(prompt, temperature) {
  const key = localStorage.getItem(DS_KEY_STORE);
  if (!key) {
    throw new Error("本机还没有 DeepSeek Key：点右上角 ⚙，在设置里填入 Key 保存后即可使用");
  }
  const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`DeepSeek API ${resp.status}：${body.slice(0, 100)}（Key 可能失效或欠费）`);
  }
  const content = (await resp.json()).choices[0].message.content;
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 回复格式异常，请点刷新重试");
  return JSON.parse(match[0]);
}

function shotRowHtml(s) {
  return `<div class="shot-row">
    <span class="shot-time">${escapeHtml(s.time)}</span>
    <div class="shot-body">
      <p><b>画面：</b>${escapeHtml(s.visual)}</p>
      <p><b>镜头：</b>${escapeHtml(s.camera)}</p>
      <p><b>文案：</b>${escapeHtml(s.caption)}</p>
      <p><b>旁白：</b>${escapeHtml(s.voice)}</p>
    </div>
  </div>`;
}

function videoResultHtml(plan) {
  const shots = (plan.shots || []).map(shotRowHtml).join("");
  return `
    <div class="plan-row"><span class="plan-label">💡 创意概念</span><p>${escapeHtml(plan.concept)}</p></div>
    <div class="plan-row"><span class="plan-label">🎨 视觉风格</span><p>${escapeHtml(plan.style)}</p></div>
    <div class="plan-row"><span class="plan-label">🎞 分镜剧本（约30秒）</span></div>
    ${shots}
    <div class="plan-row"><span class="plan-label">🚀 Seedance 2.5 提示词（一键复制去生成）</span></div>
    <div class="seedance-prompt" id="seedance-text">${escapeHtml(plan.seedance_prompt)}</div>
    <button class="btn-primary copy-btn" id="copy-seedance">📋 复制提示词</button>`;
}

function setVideoStatus(msg, cls) {
  const el = document.getElementById("video-status");
  el.textContent = msg;
  el.className = cls || "";
}

async function generateVideo(regenerate) {
  if (videoState.loading || !videoState.topic) return;
  videoState.loading = true;
  const refreshBtn = document.getElementById("video-refresh");
  refreshBtn.disabled = true;
  document.getElementById("video-result").innerHTML = "";
  setVideoStatus(regenerate ? "正在换一个全新创意方向重新生成…" : "AI 导演正在构思创意剧本（约 10-20 秒）…");
  try {
    const plan = await callDeepSeek(
      buildVideoPrompt(videoState.topic, regenerate ? videoState.lastConcept : ""),
      regenerate ? 0.95 : 0.7
    );
    videoState.lastConcept = plan.concept || "";
    document.getElementById("video-result").innerHTML = videoResultHtml(plan);
    setVideoStatus("");
    document.getElementById("copy-seedance").onclick = async e => {
      const text = document.getElementById("seedance-text").textContent;
      try {
        await navigator.clipboard.writeText(text);
        e.target.textContent = "✅ 已复制，去 Seedance 粘贴生成";
      } catch {
        e.target.textContent = "复制失败，请手动长按选择复制";
      }
      setTimeout(() => { e.target.textContent = "📋 复制提示词"; }, 2500);
    };
  } catch (e) {
    setVideoStatus(`生成失败：${e.message}`, "err");
  } finally {
    videoState.loading = false;
    refreshBtn.disabled = false;
  }
}

function openVideoStudio(topic) {
  videoState.topic = topic;
  videoState.lastConcept = "";
  document.getElementById("video-news-title").textContent = `📰 ${topic.title}`;
  document.getElementById("video-result").innerHTML = "";
  setVideoStatus("");
  document.getElementById("video-modal").classList.remove("hidden");
  generateVideo(false);
}

document.getElementById("video-refresh").onclick = () => generateVideo(true);
document.getElementById("video-close").onclick = () =>
  document.getElementById("video-modal").classList.add("hidden");
document.getElementById("video-modal").onclick = e => {
  if (e.target.id === "video-modal") e.target.classList.add("hidden");
};

/* ================= PWA：注册 Service Worker ================= */
if ("serviceWorker" in navigator) {
  // 新版本 SW 接管页面时自动刷新一次，用户永远无需手动清缓存
  let swRefreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing) return;
    swRefreshing = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err =>
      console.warn("Service Worker 注册失败:", err)
    );
  });
}
