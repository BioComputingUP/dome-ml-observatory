#!/usr/bin/env python3
"""Manually-run pull of News & Events content from dome-ml-ui (the dome-ml.org site repo, the
source of truth for this data) into observatory-ui's bundled static asset.

src/app/news/news.ts fetches src/assets/data/content-items.json at runtime as a same-origin
static file -- that mechanism is fine and untouched by this script. The problem this fixes is
that the file itself is hand-maintained here and goes stale. dome-ml-ui
(github.com/BioComputingUP/dome-ml-ui) maintains the live, up-to-date version at the identical
ContentItem shape ({type, date, title, description, link, linkText, linkIcon, tags}) -- no
remapping needed, straight copy.

dome-ml-ui is a PRIVATE repo (confirmed via `gh api repos/BioComputingUP/dome-ml-ui`), not public
-- this needs an authenticated GitHub request, not a plain raw.githubusercontent.com fetch. Token
resolution order: $GITHUB_TOKEN, then $GH_TOKEN, then `gh auth token` (the GitHub CLI, if it's
installed and logged in -- it already is in the dev environment this was built in). Anyone running
this needs push/pull access to BioComputingUP/dome-ml-ui one way or another regardless.

Deliberately manual, unlike scripts/sync-schema.js's automatic pre* build hooks -- run it
yourself whenever you want fresh content, then review and commit the diff.

Usage:
    python3 scripts/sync_news.py
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

SOURCE_API_URL = (
    "https://api.github.com/repos/BioComputingUP/dome-ml-ui/contents/"
    "src/assets/data/content-items.json"
)
DEST_PATH = Path(__file__).resolve().parent.parent / "src" / "assets" / "data" / "content-items.json"
REQUIRED_KEYS = {"type", "date", "title", "description", "tags"}
# link/linkText/linkIcon are optional -- not every item has an external link (e.g. an internal
# meeting note) -- but if one of the three is present, all three must be (a partial link is a
# real bug, an absent one is legitimate content).
LINK_KEYS = {"link", "linkText", "linkIcon"}
VALID_TYPES = {"news", "event"}
TIMEOUT_SECONDS = 15


def _resolve_token() -> str:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        return token
    try:
        result = subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, timeout=10, check=True
        )
        return result.stdout.strip()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise SystemExit(
            "sync-news: no GitHub token found. dome-ml-ui is a private repo -- set "
            "$GITHUB_TOKEN (or $GH_TOKEN), or install and log in with the GitHub CLI "
            "(`gh auth login`), then re-run."
        )


def fetch(url: str, token: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "dome-observatory-sync-news/1.0",
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.raw",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
            if resp.status != 200:
                raise SystemExit(f"sync-news: unexpected HTTP status {resp.status} from {url}")
            return resp.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"sync-news: HTTP {e.code} fetching {url}: {e.reason}")
    except urllib.error.URLError as e:
        raise SystemExit(f"sync-news: network error fetching {url}: {e.reason}")


def validate(data) -> list[dict]:
    if not isinstance(data, list):
        raise SystemExit(f"sync-news: expected a JSON array, got {type(data).__name__}")
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise SystemExit(f"sync-news: item {i} is not an object")
        missing = REQUIRED_KEYS - item.keys()
        if missing:
            raise SystemExit(f"sync-news: item {i} missing key(s): {sorted(missing)}")
        present_link_keys = LINK_KEYS & item.keys()
        if present_link_keys and present_link_keys != LINK_KEYS:
            raise SystemExit(
                f"sync-news: item {i} has partial link data ({sorted(present_link_keys)} "
                f"present, {sorted(LINK_KEYS - present_link_keys)} missing) -- either all of "
                f"{sorted(LINK_KEYS)} should be present, or none of them"
            )
        if item["type"] not in VALID_TYPES:
            # news.ts's newsItems/eventItems getters filter on this exact field -- a bad value
            # doesn't error, it just silently drops the item from both tabs.
            raise SystemExit(
                f"sync-news: item {i} has type={item['type']!r}, expected one of {sorted(VALID_TYPES)}"
            )
        if not isinstance(item["tags"], list):
            raise SystemExit(f"sync-news: item {i}'s tags is not an array")
    return data


def previous_count() -> int:
    try:
        with DEST_PATH.open(encoding="utf-8") as f:
            existing = json.load(f)
        return len(existing) if isinstance(existing, list) else 0
    except (OSError, json.JSONDecodeError):
        return 0


def main() -> None:
    token = _resolve_token()
    raw = fetch(SOURCE_API_URL, token)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"sync-news: fetched content is not valid JSON: {e}")

    items = validate(data)
    before = previous_count()

    DEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DEST_PATH.open("w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"sync-news: wrote {len(items)} item(s) to {DEST_PATH} (was {before})")


if __name__ == "__main__":
    main()
