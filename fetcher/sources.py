"""各平台热榜抓取，统一输出格式。

每个平台优先走 60s 聚合 API，失败时自动降级到官方接口。
（60s 公共实例托管在 Cloudflare，会拦截 GitHub Actions 等机房 IP，
  官方接口作为保底，知乎暂无稳定官方接口，仅 60s 一路）

输出 item 结构:
{
    "platform": "weibo",        # 平台标识
    "title": "...",             # 热点标题
    "desc": "...",              # 详情描述（可能为空）
    "cover": "https://...",     # 缩略图（微博/B站无图，为空字符串）
    "link": "https://...",      # 原文链接
    "rank": 1,                  # 榜内排名（1 起）
}
"""
import re
import time
from urllib.parse import quote

import requests

API_BASES = ["https://60s.viki.moe/v2", "https://60s-api.viki.moe/v2"]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 15
TOP_N = 30  # 每个平台取前 N 条


def _get(url, referer=None, retries=1):
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=headers, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt == retries:
                print(f"  [warn] 请求失败 {url}: {e}")
                return None
            time.sleep(2)
    return None


# ---------- 60s 聚合 API ----------

def _fetch_60s(endpoint, platform, title_key, desc_key, link_key, cover_key=None):
    data = None
    for base in API_BASES:
        data = _get(f"{base}/{endpoint}")
        if data and data.get("code") == 200 and data.get("data"):
            break
        data = None
    if not data:
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
            "cover": (raw.get(cover_key) or "").strip() if cover_key else "",
            "link": raw.get(link_key) or "",
            "rank": i + 1,
        })
    return items


# ---------- 官方接口（备用源） ----------

def _weibo_official():
    data = _get("https://weibo.com/ajax/side/hotSearch", referer="https://weibo.com")
    if not data or not data.get("data"):
        return []
    items = []
    for raw in data["data"].get("realtime", []):
        if raw.get("is_ad"):
            continue
        title = (raw.get("note") or raw.get("word") or "").strip()
        if not title:
            continue
        items.append({
            "platform": "weibo",
            "title": title,
            "desc": "",
            "cover": "",
            "link": f"https://s.weibo.com/weibo?q={quote('#' + title + '#')}",
            "rank": len(items) + 1,
        })
        if len(items) >= TOP_N:
            break
    return items


def _douyin_official():
    data = _get("https://www.douyin.com/aweme/v1/web/hot/search/list/",
                referer="https://www.douyin.com")
    if not data or not data.get("data"):
        return []
    items = []
    for raw in data["data"].get("word_list", [])[:TOP_N]:
        title = (raw.get("word") or "").strip()
        if not title:
            continue
        cover_list = (raw.get("word_cover") or {}).get("url_list") or []
        items.append({
            "platform": "douyin",
            "title": title,
            "desc": "",
            "cover": cover_list[0] if cover_list else "",
            "link": f"https://www.douyin.com/search/{quote(title)}",
            "rank": len(items) + 1,
        })
    return items


def _baidu_official():
    data = _get("https://top.baidu.com/api/board?platform=wise&tab=realtime")
    if not data or not data.get("data"):
        return []

    def find_hot_list(node):
        """递归找到元素含 word 字段的列表（百度返回结构嵌套较深且可能变动）"""
        if isinstance(node, list):
            if node and isinstance(node[0], dict) and "word" in node[0]:
                return node
            for child in node:
                found = find_hot_list(child)
                if found:
                    return found
        elif isinstance(node, dict):
            for child in node.values():
                found = find_hot_list(child)
                if found:
                    return found
        return None

    hot_list = find_hot_list(data["data"]) or []
    items = []
    for raw in hot_list[:TOP_N]:
        title = (raw.get("word") or "").strip()
        if not title:
            continue
        items.append({
            "platform": "baidu",
            "title": title,
            "desc": (raw.get("desc") or "").strip(),
            "cover": (raw.get("img") or "").strip(),
            "link": raw.get("url") or f"https://www.baidu.com/s?wd={quote(title)}",
            "rank": len(items) + 1,
        })
    return items


def _toutiao_official():
    data = _get("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
                referer="https://www.toutiao.com")
    if not data or not data.get("data"):
        return []
    items = []
    for raw in data["data"][:TOP_N]:
        title = (raw.get("Title") or "").strip()
        if not title:
            continue
        items.append({
            "platform": "toutiao",
            "title": title,
            "desc": "",
            "cover": ((raw.get("Image") or {}).get("url") or "").strip(),
            "link": raw.get("Url") or "",
            "rank": len(items) + 1,
        })
    return items


def _qq_ent_official():
    """腾讯新闻娱乐热点榜：花边新闻密度高（恋情/绯闻/争议/名场面）"""
    data = _get("https://r.inews.qq.com/gw/event/pc_hot_ranking_list"
                "?rank_id=ent&page_size=50&appver=15.5_qqnews_7.6.0")
    if not data or not data.get("idlist"):
        return []
    items = []
    for raw in data["idlist"][0].get("newslist", []):
        if str(raw.get("articletype")) == "560":  # 榜单说明条目，跳过
            continue
        title = (raw.get("title") or "").strip()
        if not title:
            continue
        covers = raw.get("thumbnails_qqnews") or raw.get("thumbnails") or []
        items.append({
            "platform": "qq_ent",
            "title": title,
            "desc": "",
            "cover": covers[0] if covers else "",
            "link": raw.get("url") or f"https://view.inews.qq.com/a/{raw.get('id', '')}",
            "rank": len(items) + 1,
        })
        if len(items) >= TOP_N:
            break
    return items


def _rfi_rss():
    """RFI 中文 RSS：国际形势与地缘政治（国内可直接访问，Actions 上也可达）"""
    import xml.etree.ElementTree as ET

    text = None
    try:
        resp = requests.get("https://www.rfi.fr/cn/rss",
                            headers={"User-Agent": UA}, timeout=TIMEOUT)
        resp.raise_for_status()
        text = resp.content
    except Exception as e:
        print(f"  [warn] 请求失败 RFI RSS: {e}")
        return []
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        print(f"  [warn] RFI RSS 解析失败: {e}")
        return []
    items = []
    for entry in root.iter("item"):
        title = (entry.findtext("title") or "").strip()
        if not title:
            continue
        desc = re.sub(r"<[^>]+>", "", entry.findtext("description") or "").strip()
        enclosure = entry.find("enclosure")
        cover = enclosure.get("url", "") if enclosure is not None else ""
        items.append({
            "platform": "rfi",
            "title": title,
            "desc": desc,
            "cover": cover.strip(),
            "link": (entry.findtext("link") or "").strip(),
            "rank": len(items) + 1,
        })
        if len(items) >= TOP_N:
            break
    return items


def _bili_official():
    data = _get("https://app.bilibili.com/x/v2/search/trending/ranking")
    if not data or data.get("code") != 0:
        return []
    items = []
    for raw in data["data"]["list"][:TOP_N]:
        title = (raw.get("show_name") or raw.get("keyword") or "").strip()
        if not title:
            continue
        items.append({
            "platform": "bili",
            "title": title,
            "desc": "",
            "cover": "",
            "link": f"https://search.bilibili.com/all?keyword={quote(title)}",
            "rank": len(items) + 1,
        })
    return items


# ---------- 平台入口：主源 + 备用源链 ----------

def _with_fallback(platform, fetchers):
    """fetchers 为 (来源标签, 抓取函数) 列表，按顺序尝试直到拿到数据"""
    for tag, fn in fetchers:
        try:
            items = fn()
        except Exception as e:
            print(f"  [warn] {platform} {tag}源异常: {e}")
            items = []
        if items:
            print(f"  {platform}: {len(items)} 条（{tag}源）")
            return items
    print(f"  [warn] {platform} 所有源均失败")
    return []


def fetch_weibo():
    return _with_fallback("weibo", [
        ("60s", lambda: _fetch_60s("weibo", "weibo", "title", None, "link")),
        ("官方", _weibo_official),
    ])


def fetch_douyin():
    return _with_fallback("douyin", [
        ("60s", lambda: _fetch_60s("douyin", "douyin", "title", None, "link", "cover")),
        ("官方", _douyin_official),
    ])


def fetch_zhihu():
    # 知乎官方接口需要登录态，暂无可用备用源
    return _with_fallback("zhihu", [
        ("60s", lambda: _fetch_60s("zhihu", "zhihu", "title", "detail", "link", "cover")),
    ])


def fetch_baidu():
    return _with_fallback("baidu", [
        ("60s", lambda: _fetch_60s("baidu/hot", "baidu", "title", "desc", "url", "cover")),
        ("官方", _baidu_official),
    ])


def fetch_toutiao():
    return _with_fallback("toutiao", [
        ("60s", lambda: _fetch_60s("toutiao", "toutiao", "title", None, "link", "cover")),
        ("官方", _toutiao_official),
    ])


def fetch_bili():
    # 60s 的 bili 端点本身不稳定，官方接口放第一位
    return _with_fallback("bili", [
        ("官方", _bili_official),
        ("60s", lambda: _fetch_60s("bili", "bili", "title", None, "link")),
    ])


def fetch_qq_ent():
    return _with_fallback("qq_ent", [
        ("官方", _qq_ent_official),
    ])


def fetch_rfi():
    return _with_fallback("rfi", [
        ("官方", _rfi_rss),
    ])


SOURCES = [fetch_weibo, fetch_douyin, fetch_zhihu, fetch_baidu, fetch_toutiao,
           fetch_bili, fetch_qq_ent, fetch_rfi]

PLATFORM_NAMES = {
    "weibo": "微博",
    "douyin": "抖音",
    "zhihu": "知乎",
    "baidu": "百度",
    "toutiao": "头条",
    "bili": "B站",
    "qq_ent": "腾讯娱乐",
    "rfi": "RFI国际",
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
