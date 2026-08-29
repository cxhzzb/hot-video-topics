"""调用 DeepSeek API 为热点生成摘要和短视频制作方案。

设计要点：
- 批量处理：多个话题合并成一次请求，降低成本和耗时
- 缓存复用：标题与缓存高度相似时直接复用旧结果，不为重复热点重复付费
- 失败降级：API 不可用（欠费/限流/超时）时返回 None，热榜本身不受影响
"""
import json
import os
import re
import time

import requests

from dedupe import similarity

API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"
BATCH_SIZE = 10       # 每次请求处理的话题数
ENRICH_TOP_N = 40     # 每次运行最多加工的话题数
REUSE_THRESHOLD = 0.55  # 与缓存标题相似度超过该值则复用

CATEGORIES = "社会、娱乐、国际、科技、体育、财经、游戏、生活、其他"

PROMPT_TEMPLATE = """你是一位资深短视频编导，服务于短视频创作团队。下面是当前网络上的热门话题列表：

{topics_text}

要求：
- 娱乐类话题优先从花边角度切入（恋情、绯闻、争议、塌房、人设、综艺名场面、穿搭造型等），这是团队的主打方向
- 涉及国际关系、地缘政治、军事冲突、外交动态的话题分类选"国际"

请为每个话题输出以下信息（严格按 JSON 数组返回，不要输出任何其他内容）：
[
  {{
    "id": 话题编号,
    "title": "一句话概括事件（不超过25字，比原标题更清晰）",
    "summary": "2-3句背景介绍：发生了什么、为什么火、争议点或看点在哪",
    "category": "分类，必须从以下选一个：{categories}",
    "angles": ["3个短视频选题角度，如蹭热度/深度解读/反向观点/情绪共鸣/科普等，每个一句话"],
    "hook": "视频前3秒钩子文案，一句话，要有冲击力",
    "structure": "15-60秒视频的内容结构建议，2-3句话",
    "format": "推荐形式：口播/混剪/图文/街采 中选1-2个",
    "risk": "风险提示：敏感内容、版权素材、平台限流等需要注意的点，没有就写'无明显风险'"
  }}
]"""


def load_api_key():
    """优先读环境变量（GitHub Actions），其次读本地 secrets.json（不提交仓库）"""
    key = os.environ.get("DEEPSEEK_API_KEY")
    if key:
        return key
    secrets_path = os.path.join(os.path.dirname(__file__), "secrets.json")
    if os.path.exists(secrets_path):
        with open(secrets_path, encoding="utf-8") as f:
            return json.load(f).get("deepseek_api_key")
    return None


def _call_llm(api_key, topics_batch):
    topics_text = "\n".join(
        f"{i}. {t['title']}" + (f"（{t['desc'][:150]}）" if t["desc"] else "")
        for i, t in enumerate(topics_batch)
    )
    prompt = PROMPT_TEMPLATE.format(topics_text=topics_text, categories=CATEGORIES)
    resp = requests.post(
        API_URL,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
        },
        timeout=120,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    # 从回复中提取 JSON 数组（模型可能包裹在 ```json 代码块里）
    match = re.search(r"\[.*\]", content, re.S)
    if not match:
        raise ValueError(f"回复中未找到 JSON 数组: {content[:200]}")
    return json.loads(match.group(0))


def _find_cached(topic, cache):
    """在缓存中找高度相似的话题，命中则复用"""
    best_key, best_sim = None, 0.0
    for key in cache:
        sim = max(similarity(key, t) for t in topic["titles"])
        if sim > best_sim:
            best_key, best_sim = key, sim
    if best_key and best_sim >= REUSE_THRESHOLD:
        return cache[best_key]
    return None


def enrich_topics(topics, cache):
    """为 topics 列表补充 AI 字段，原地修改。返回 (成功数, 是否API可用)"""
    api_key = load_api_key()
    if not api_key:
        print("  [warn] 未配置 DEEPSEEK_API_KEY，跳过 AI 加工")
        return 0, False

    # 先复用缓存
    todo = []
    reused = 0
    for topic in topics[:ENRICH_TOP_N]:
        cached = _find_cached(topic, cache)
        if cached:
            topic["ai"] = cached
            reused += 1
        else:
            todo.append(topic)
    print(f"  缓存复用 {reused} 条，需新加工 {len(todo)} 条")

    ok = True
    enriched = 0
    for i in range(0, len(todo), BATCH_SIZE):
        batch = todo[i:i + BATCH_SIZE]
        try:
            results = _call_llm(api_key, batch)
        except Exception as e:
            print(f"  [warn] DeepSeek API 调用失败（第 {i // BATCH_SIZE + 1} 批）: {e}")
            ok = False
            break
        by_id = {r.get("id"): r for r in results if isinstance(r, dict)}
        for j, topic in enumerate(batch):
            ai = by_id.get(j)
            if ai:
                topic["ai"] = ai
                cache[topic["title"]] = ai
                enriched += 1
        time.sleep(1)  # 温和限速
    print(f"  新加工 {enriched} 条")
    return enriched, ok
