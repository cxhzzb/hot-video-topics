"""跨平台热点去重合并。

同一事件经常同时登上多个平台热榜，但标题措辞不同。
用中文字符二元组（bigram）的 Jaccard 相似度做聚类，纯标准库实现。
"""
import re

MERGE_THRESHOLD = 0.30  # 相似度超过该值视为同一事件


def _bigrams(text):
    text = re.sub(r"[^\w一-鿿]", "", text.lower())
    if len(text) < 2:
        return {text} if text else set()
    return {text[i:i + 2] for i in range(len(text) - 1)}


def similarity(a, b):
    sa, sb = _bigrams(a), _bigrams(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _heat_score(item):
    """单条热点的热度分：排名越靠前分越高"""
    return max(0, 31 - item["rank"])


def merge_topics(items):
    """把多平台 item 列表聚类成话题列表，按热度降序。

    输出 topic 结构:
    {
        "title": 代表性标题（取热度最高的那条）,
        "desc": 最长的描述,
        "platforms": ["weibo", "zhihu"],
        "links": {"weibo": "...", ...},
        "heat": 热度分,
        "titles": [所有原始标题],   # 供 LLM 参考
    }
    """
    topics = []
    for item in items:
        best, best_sim = None, 0.0
        for topic in topics:
            sim = max(similarity(item["title"], t) for t in topic["titles"])
            if sim > best_sim:
                best, best_sim = topic, sim
        if best is not None and best_sim >= MERGE_THRESHOLD:
            best["titles"].append(item["title"])
            best["heat"] += _heat_score(item)
            if item["platform"] not in best["platforms"]:
                best["platforms"].append(item["platform"])
                best["heat"] += 50  # 跨平台出现额外加权
            if item["link"] and item["platform"] not in best["links"]:
                best["links"][item["platform"]] = item["link"]
            if len(item["desc"]) > len(best["desc"]):
                best["desc"] = item["desc"]
            if _heat_score(item) > best["_best_item_heat"]:
                best["_best_item_heat"] = _heat_score(item)
                best["title"] = item["title"]
        else:
            topics.append({
                "title": item["title"],
                "desc": item["desc"],
                "platforms": [item["platform"]],
                "links": {item["platform"]: item["link"]} if item["link"] else {},
                "heat": _heat_score(item),
                "titles": [item["title"]],
                "_best_item_heat": _heat_score(item),
            })
    for topic in topics:
        topic.pop("_best_item_heat", None)
    topics.sort(key=lambda t: t["heat"], reverse=True)
    return topics
