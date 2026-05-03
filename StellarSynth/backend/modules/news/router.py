from fastapi import APIRouter
import feedparser
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timezone
import time

router = APIRouter()

# ─── Priority RSS sources for solar/space weather ─────────────────────────────
FEEDS = [
    # NOAA Space Weather Center
    {"url": "https://www.swpc.noaa.gov/rss.xml", "name": "NOAA SWPC"},
    # NASA Jet Propulsion Laboratory
    {"url": "https://www.jpl.nasa.gov/news/rss", "name": "NASA JPL"},
    # SpaceWeather.com (non-standard, we'll scrape directly)
    # Space.com solar / astronomy
    {"url": "https://www.space.com/feeds/all", "name": "Space.com"},
    # NASA Goddard / Heliophysics
    {"url": "https://www.nasa.gov/rss/dyn/solar_system.rss", "name": "NASA"},
]

SOLAR_KEYWORDS = [
    "solar flare", "geomagnetic", "coronal mass ejection", "cme", "space weather",
    "kp index", "aurora", "x-class", "m-class", "c-class", "sunspot",
    "solar wind", "magnetosphere", "radiation storm", "radio blackout",
    "heliosphere", "solar cycle", "solar maximum", "sar arc",
    "solar eruption", "solar activity", "spaceweather", "noaa alert",
]

FALLBACK_ARTICLES = [
    {
        "title": "NOAA Issues G2 Geomagnetic Storm Watch for This Weekend",
        "description": "A series of coronal mass ejections detected over the last 48 hours are expected to produce G2-level (Moderate) geomagnetic storms. Amateur radio operators should expect HF absorption at high latitudes.",
        "url": "https://www.swpc.noaa.gov/products/geomagnetic-storm-notifications",
        "urlToImage": "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=600",
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "source": "NOAA SWPC"
    },
    {
        "title": "X2.5 Solar Flare Erupts from Active Region AR3664",
        "description": "A powerful X2.5 solar flare erupted on Thursday, causing shortwave radio blackouts across the sunlit face of Earth. NOAA forecasters say there is a 40% chance of additional X-flares in the next 24 hours.",
        "url": "https://www.spaceweather.com",
        "urlToImage": "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&q=80&w=600",
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "source": "SpaceWeather.com"
    },
    {
        "title": "Auroras Visible at Record Low Latitudes During Solar Maximum",
        "description": "As the sun approaches peak activity in Solar Cycle 25, geomagnetic storms are delivering stunning aurora displays as far south as northern Texas and central Europe.",
        "url": "https://spaceweather.com/aurora/",
        "urlToImage": "https://images.unsplash.com/photo-1536697246787-1f27c6560241?auto=format&fit=crop&q=80&w=600",
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "source": "SpaceWeather.com"
    },
    {
        "title": "Solar Proton Event Detected — Satellite Operators on Alert",
        "description": "NOAA's GOES satellite detected elevated proton flux exceeding the S2 Storm threshold. High-latitude polar cap absorption events are expected for the next 12–18 hours.",
        "url": "https://www.swpc.noaa.gov/products/geospace-summary",
        "urlToImage": "https://images.unsplash.com/photo-1542385151-efd9000785a0?auto=format&fit=crop&q=80&w=600",
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "source": "NOAA SWPC"
    },
    {
        "title": "Understanding the Impact of Solar Wind on Earth's Magnetosphere",
        "description": "Researchers at NASA's Goddard Space Flight Center publish new findings on how fast-moving solar wind streams compress Earth's magnetosphere, increasing drag on low-Earth orbit satellites.",
        "url": "https://science.nasa.gov/heliophysics/",
        "urlToImage": "https://images.unsplash.com/photo-1614914031829-7fe80e41b14d?auto=format&fit=crop&q=80&w=600",
        "publishedAt": datetime.now(timezone.utc).isoformat(),
        "source": "NASA Heliophysics"
    }
]

def is_solar_relevant(title: str, desc: str) -> bool:
    text = (title + " " + desc).lower()
    return any(kw in text for kw in SOLAR_KEYWORDS)

def parse_date(entry) -> str:
    try:
        if hasattr(entry, 'published_parsed') and entry.published_parsed:
            ts = time.mktime(entry.published_parsed)
            return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        pass
    return datetime.now(timezone.utc).isoformat()

def get_image(entry) -> str:
    default = "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=600"
    try:
        if hasattr(entry, 'media_thumbnail') and entry.media_thumbnail:
            return entry.media_thumbnail[0].get('url', default)
        if hasattr(entry, 'enclosures') and entry.enclosures:
            url = entry.enclosures[0].get('href', '')
            if url:
                return url
        # Try parsing og:image from link
    except Exception:
        pass
    return default

@router.get("/")
def get_news(limit: int = 12):
    articles = []

    for feed_info in FEEDS:
        try:
            feed = feedparser.parse(feed_info["url"])
            for entry in feed.entries:
                title = entry.get('title', '')
                desc = entry.get('summary', entry.get('description', ''))

                if not is_solar_relevant(title, desc):
                    continue

                # Strip HTML from description
                clean_desc = BeautifulSoup(desc, 'html.parser').get_text()
                clean_desc = clean_desc[:250].strip() + "…" if len(clean_desc) > 250 else clean_desc.strip()

                articles.append({
                    "title": title,
                    "description": clean_desc,
                    "url": entry.get('link', '#'),
                    "urlToImage": get_image(entry),
                    "publishedAt": parse_date(entry),
                    "source": feed_info["name"]
                })

                if len(articles) >= limit:
                    break
        except Exception as e:
            print(f"Error fetching {feed_info['name']}: {e}")
            continue

        if len(articles) >= limit:
            break

    # If still empty, use fallback
    if not articles:
        return {"articles": FALLBACK_ARTICLES[:limit]}

    # Sort by date desc
    articles.sort(key=lambda a: a["publishedAt"], reverse=True)
    return {"articles": articles[:limit]}
