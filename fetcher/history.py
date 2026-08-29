"""3 天热度历史累积：跨多次运行追踪话题，生成"3 日最热"榜单。

数据存在 data/history.json，结构：
{
  "topics": {
    "<代表标题>": {
        "title": 代表标题,
        "desc": 描述,
        "platforms": [...],
        "links": {...},
        "heat_total": 累计热度,
        "appearances": 出现次数（运行轮次）,
        "days": ["2026-08-28", ...],
        "last_seen": ISO 时间,
        "ai": {...} 或 None
    }
  }
}
"""
import json
import os
from datetime import datetime, timedelta

from dedupe import similarity

MATCH_THRESHOLD = 0.45   # 与历史条目相似度超过该值视为同一话题
RETENTION_DAYS = 3       # 只保留最近 3 天的话题
TOP_N = 30               # 3 日最热榜单条数


def load_history(path):
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"topics": {}}


def save_history(path, history):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=1)


def _find_entry(topic, entries):
    best_key, best_sim = None, 0.0
    for key in entries:
        sim = max(similarity(key, t) for t in topic["titles"])
        if sim > best_sim:
            best_key, best_sim = key, sim
    return best_key if best_sim >= MATCH_THRESHOLD else None


def update_history(history, topics, now):
    """把本轮话题合并进历史，并清理过期条目"""
    entries = history["topics"]
    today = now.strftime("%Y-%m-%d")
    for topic in topics:
        key = _find_entry(topic, entries)
        if key is None:
            key = topic["title"]
            entries[key] = {
                "title": topic["title"],
                "desc": topic["desc"],
                "platforms": [],
                "links": {},
                "heat_total": 0,
                "appearances": 0,
                "days": [],
                "first_seen": "",
                "platform_first_seen": {},
                "last_seen": "",
                "ai": None,
            }
        e = entries[key]
        now_iso = now.isoformat(timespec="seconds")
        # 首次出现时间（旧数据无此字段时用 last_seen 兜底近似）
        if not e.get("first_seen"):
            e["first_seen"] = e["last_seen"] or now_iso
        pfs = e.setdefault("platform_first_seen", {})
        e["heat_total"] += topic["heat"]
        e["appearances"] += 1
        e["last_seen"] = now_iso
        if today not in e["days"]:
            e["days"].append(today)
        for p in topic["platforms"]:
            if p not in e["platforms"]:
                e["platforms"].append(p)
            # 平台首次出现时间（旧条目缺失的平台按当前时间近似记录）
            pfs.setdefault(p, e["last_seen"])
        e["links"].update({k: v for k, v in topic["links"].items() if v})
        if len(topic["desc"]) > len(e["desc"]):
            e["desc"] = topic["desc"]
        if topic.get("ai"):
            e["ai"] = topic["ai"]

    # 清理超过保留期的条目
    cutoff = (now - timedelta(days=RETENTION_DAYS)).isoformat(timespec="seconds")
    history["topics"] = {k: v for k, v in entries.items() if v["last_seen"] >= cutoff}
    return history


def top_3d(history):
    """3 日最热榜单：持续在榜多天、跨平台的话题排前面"""
    def score(e):
        return e["heat_total"] + 40 * len(e["days"]) + 15 * len(e["platforms"])

    ranked = sorted(history["topics"].values(), key=score, reverse=True)[:TOP_N]
    return [
        {
            "title": e["ai"]["title"] if e.get("ai") else e["title"],
            "raw_title": e["title"],
            "desc": e["desc"],
            "platforms": e["platforms"],
            "links": e["links"],
            "heat": e["heat_total"],
            "days": len(e["days"]),
            "ai": e.get("ai"),
        }
        for e in ranked
    ]
