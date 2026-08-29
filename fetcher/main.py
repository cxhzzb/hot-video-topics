"""主流程：抓热榜 → 去重合并 → AI 加工 → 写 data.json。

用法: python fetcher/main.py
输出: data/data.json (前端直接读取), data/state.json (AI 结果缓存)
"""
import json
import os
from datetime import datetime, timezone, timedelta

from sources import fetch_all, PLATFORM_NAMES
from dedupe import merge_topics
from enrich import enrich_topics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DATA_FILE = os.path.join(DATA_DIR, "data.json")
STATE_FILE = os.path.join(DATA_DIR, "state.json")
MAX_TOPICS = 50          # 输出给前端的话题数
CACHE_TTL_HOURS = 36     # 缓存超过该时长丢弃（热点已过时）

CST = timezone(timedelta(hours=8))


def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"cached_at": "", "cache": {}}


def save_state(state):
    state["cached_at"] = datetime.now(CST).isoformat(timespec="seconds")
    # 缓存条目数兜底，防止无限膨胀
    if len(state["cache"]) > 500:
        keys = list(state["cache"])[-300:]
        state["cache"] = {k: state["cache"][k] for k in keys}
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=1)


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    print("== 1. 抓取各平台热榜 ==")
    items = fetch_all()
    print(f"共抓取 {len(items)} 条原始热点")

    print("== 2. 去重合并 ==")
    topics = merge_topics(items)
    print(f"合并后 {len(topics)} 个话题")

    print("== 3. AI 加工 ==")
    state = load_state()
    enrich_topics(topics, state["cache"])
    save_state(state)

    print("== 4. 写出 data.json ==")
    output = {
        "updated_at": datetime.now(CST).isoformat(timespec="seconds"),
        "platform_names": PLATFORM_NAMES,
        "topics": [
            {
                "title": t["ai"]["title"] if t.get("ai") else t["title"],
                "raw_title": t["title"],
                "desc": t["desc"],
                "platforms": t["platforms"],
                "links": t["links"],
                "heat": t["heat"],
                "ai": t.get("ai"),
            }
            for t in topics[:MAX_TOPICS]
        ],
    }
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=1)
    ai_count = sum(1 for t in output["topics"] if t["ai"])
    print(f"完成：{len(output['topics'])} 个话题（含 AI 分析 {ai_count} 条）→ {DATA_FILE}")


if __name__ == "__main__":
    main()
