/* 热点速拍前端：读取 data/data.json 渲染热点卡片 */

const FALLBACK_CATEGORIES = ["全部"];

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function topicCategory(t) {
  return (t.ai && t.ai.category) || "其他";
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

function cardHtml(t, i, platformNames) {
  const ai = t.ai;
  const aiBody = ai
    ? `<p class="summary">${escapeHtml(ai.summary)}</p>
       <div class="plan-toggle">▶ 查看视频制作方案</div>
       <div class="plan">${planHtml(ai)}</div>`
    : `<p class="no-ai">AI 分析生成中，下次更新后可见</p>
       ${t.desc ? `<p class="summary">${escapeHtml(t.desc.slice(0, 120))}${t.desc.length > 120 ? "…" : ""}</p>` : ""}`;
  const catTag = ai ? `<span class="cat-tag">${escapeHtml(ai.category)}</span>` : "";
  return `
    <div class="card">
      <div class="card-top">
        <span class="rank">${i + 1}</span>
        <span class="card-title">${escapeHtml(t.title)}</span>
      </div>
      <div class="badges">${badgeHtml(t, platformNames)}${catTag}<span class="heat">热度 ${t.heat}</span></div>
      ${aiBody}
    </div>`;
}

function render(data, activeCat) {
  const topics = data.topics || [];
  const cats = [...FALLBACK_CATEGORIES,
    ...new Set(topics.map(topicCategory).filter(c => c && c !== "其他")), "其他"]
    .filter((c, i, arr) => arr.indexOf(c) === i);

  const filtered = activeCat === "全部"
    ? topics
    : topics.filter(t => topicCategory(t) === activeCat);

  const main = document.getElementById("topics");
  main.innerHTML = filtered.length
    ? filtered.map((t, i) => cardHtml(t, i, data.platform_names || {})).join("")
    : `<p class="empty">该分类暂无热点</p>`;

  // 方案展开/收起
  main.querySelectorAll(".plan-toggle").forEach(el => {
    el.onclick = () => {
      const plan = el.nextElementSibling;
      plan.classList.toggle("open");
      el.textContent = plan.classList.contains("open") ? "▼ 收起方案" : "▶ 查看视频制作方案";
    };
  });

  renderTabs(cats, activeCat, cat => render(data, cat));
}

async function init() {
  try {
    const resp = await fetch(`data/data.json?t=${Date.now()}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    document.getElementById("updated-at").textContent =
      (data.updated_at || "").replace("T", " ").slice(0, 19);
    render(data, "全部");
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

  if (!owner || !repo || !token || !dsKey) {
    setStatus("请填写全部四项内容", "err");
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
