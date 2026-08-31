"""热点跨平台传播路径分析。

基于 history.json 中每个话题的"平台首次出现时间"，产出三块分析：
1. 平台角色榜：各平台作为热点源头的次数 + 平均跟进延迟
2. 传播路径：多平台话题的扩散顺序和时间跨度
3. 上升期话题：刚在 1-2 个平台冒头、尚未扩散的话题（抢拍窗口）

时间精度说明：数据每 30 分钟采集一轮，同轮出现的平台视为"同期"。
"""
from collections import Counter
from datetime import datetime, timedelta

from history import entry_stats

# 热榜类平台（反映自然热度，参与传播分析）
HOT_PLATFORMS = ["weibo", "douyin", "baidu", "toutiao", "bili", "zhihu"]
EMERGING_MAX_AGE_HOURS = 3   # 首次出现超过该时长即不算"上升期"
EMERGING_TOP_N = 15
PATH_TOP_N = 15


def _parse(ts):
    return datetime.fromisoformat(ts)


def _title_of(e):
    return e["ai"]["title"] if e.get("ai") else e["title"]


def analyze(history, now):
    entries = list(history["topics"].values())

    # ---- 平台角色榜 + 传播路径 ----
    origin_count = Counter()
    delay_sum = Counter()
    delay_n = Counter()
    paths = []
    for e in entries:
        pfs = e.get("platform_first_seen") or {}
        ordered = sorted(
            ((p, _parse(t)) for p, t in pfs.items() if p in HOT_PLATFORMS),
            key=lambda kv: kv[1],
        )
        if len(ordered) < 2:
            continue
        t0 = ordered[0][1]
        for p, t in ordered:
            delay = int((t - t0).total_seconds() // 60)
            if delay == 0:
                origin_count[p] += 1
            delay_sum[p] += delay
            delay_n[p] += 1
        paths.append({
            "title": _title_of(e),
            "path": [{"platform": p, "time": t.isoformat(timespec="seconds")} for p, t in ordered],
            "span_min": int((ordered[-1][1] - t0).total_seconds() // 60),
            "heat": e["heat_total"],
            "ai": e.get("ai"),
        })
    paths.sort(key=lambda x: x["heat"], reverse=True)

    origin_rank = [
        {
            "platform": p,
            "origin_count": origin_count[p],
            "avg_delay_min": round(delay_sum[p] / delay_n[p]) if delay_n[p] else 0,
        }
        for p in HOT_PLATFORMS
        if origin_count[p] or delay_n[p]
    ]
    origin_rank.sort(key=lambda x: (-x["origin_count"], x["avg_delay_min"]))

    # ---- 上升期话题：首次出现不久、只在 1-2 个热榜平台冒头 ----
    cutoff = now - timedelta(hours=EMERGING_MAX_AGE_HOURS)
    emerging = []
    for e in entries:
        fs = e.get("first_seen")
        if not fs or _parse(fs) < cutoff:
            continue
        hot = [p for p in e["platforms"] if p in HOT_PLATFORMS]
        if not (1 <= len(hot) <= 2):
            continue
        # 平均每轮热度作为上升势头评分
        score = e["heat_total"] / max(1, e["appearances"])
        emerging.append({
            "title": _title_of(e),
            "raw_title": e["title"],
            "desc": e["desc"],
            "platforms": e["platforms"],
            "links": e["links"],
            "cover": e.get("cover", ""),
            "heat": round(score),
            "age_min": int((now - _parse(fs)).total_seconds() // 60),
            "ai": e.get("ai"),
            "stats": entry_stats(e),
        })
    emerging.sort(key=lambda x: x["heat"], reverse=True)

    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "origin_rank": origin_rank,
        "paths": paths[:PATH_TOP_N],
        "emerging": emerging[:EMERGING_TOP_N],
    }
