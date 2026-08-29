"""各平台热榜抓取，统一输出格式。

输出 item 结构:
{
    "platform": "weibo",        # 平台标识
    "title": "...",             # 热点标题
    "desc": "...",              # 详情描述（可能为空）
    "link": "https://...",      # 原文链接
    "rank": 1,                  # 榜内排名（1 起）
}
"""
import time
from urllib.parse import quote

import requests

API_BASE = "https://60s.viki.moe/v2"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
TIMEOUT = 15
TOP_N = 30  # 每个平台取前 N 条


def _get(url, retries=2):
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt == retries:
                print(f"  [warn] 请求失败 {url}: {e}")
                return None
            time.sleep(2)
    return None


def _fetch_60s(endpoint, platform, title_key, desc_key, link_key):
    data = _get(f"{API_BASE}/{endpoint}")
    if not data or data.get("code") != 200 or not data.get("data"):
        print(f"  [warn] {platform} 获取失败或为空")
        return []
    items = []
    for i, raw in enumerate(data["data"][:TOP_N]):
        title = (raw.get(title_key) or "").strip()
        if not title:
            continue
        items.append({
            "platform": platform,
            "title": title,
            "desc": (raw.get(desc_key) or "").strip() if desc_key else "",
            "link": raw.get(link_key) or "",
            "rank": i + 1,
        })
    print(f"  {platform}: {len(items)} 条")
    return items


def fetch_weibo():
    return _fetch_60s("weibo", "weibo", "title", None, "link")


def fetch_douyin():
    return _fetch_60s("douyin", "douyin", "title", None, "link")


def fetch_zhihu():
    return _fetch_60s("zhihu", "zhihu", "title", "detail", "link")


def fetch_baidu():
    return _fetch_60s("baidu/hot", "baidu", "title", "desc", "url")


def fetch_toutiao():
    return _fetch_60s("toutiao", "toutiao", "title", None, "link")


def fetch_bili():
    """B站热搜（官方接口，60s 的 bili 端点不稳定）"""
    data = _get("https://app.bilibili.com/x/v2/search/trending/ranking")
    if not data or data.get("code") != 0:
        print("  [warn] bili 获取失败")
        return []
    items = []
    for i, raw in enumerate(data["data"]["list"][:TOP_N]):
        title = (raw.get("show_name") or raw.get("keyword") or "").strip()
        if not title:
            continue
        items.append({
            "platform": "bili",
            "title": title,
            "desc": "",
            "link": f"https://search.bilibili.com/all?keyword={quote(title)}",
            "rank": i + 1,
        })
    print(f"  bili: {len(items)} 条")
    return items


SOURCES = [fetch_weibo, fetch_douyin, fetch_zhihu, fetch_baidu, fetch_toutiao, fetch_bili]

PLATFORM_NAMES = {
    "weibo": "微博",
    "douyin": "抖音",
    "zhihu": "知乎",
    "baidu": "百度",
    "toutiao": "头条",
    "bili": "B站",
}


def fetch_all():
    """抓取全部平台，返回 item 列表（失败的平台自动跳过）"""
    all_items = []
    for fn in SOURCES:
        try:
            all_items.extend(fn())
        except Exception as e:
            print(f"  [warn] {fn.__name__} 异常: {e}")
    return all_items
