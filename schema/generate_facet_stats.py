#!/usr/bin/env python3
"""Generates schema/stats/facet-stats.json -- the precomputed facet counts the search UI reads.

Why precomputed: the corpus is updated 6-12 times a year in monthly/bimonthly triage batches, so
it is almost static. Aggregating facet counts over 827k documents on every query would be the most
expensive thing on the search page, for data that changes six times a year. This script runs once
per data update instead; the UI just reads the resulting file.

Two modes:
- Default (no flags, or --records): derives per-facet counts from a local records.json file (the
  200-record dev fixture by default) and marks them `"source": "fixture"`. The `corpus` block is
  still the REAL full-corpus figures either way -- see the CORPUS dict below.
- --from-api <base-url> (Phase 5 onward): fetches the already-computed aggregation straight from
  observatory-ws's GET /api/stats (stdlib urllib only -- no dependency added to this folder) and
  writes it verbatim, marked `"source": "full-corpus"`. The aggregation logic lives exactly once,
  in observatory-ws/src/stats/stats.service.ts -- this mode is a thin fetch-and-write, not a
  reimplementation, so the two can never drift apart. Requires the ws running and reachable (e.g.
  `npm run start:dev` in observatory-ws/, or the VPN to the database server for a real corpus run).

Usage:
    python3 schema/generate_facet_stats.py
    python3 schema/generate_facet_stats.py --records path/to/records.json --source full-corpus
    python3 schema/generate_facet_stats.py --from-api http://localhost:3000
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_DIR = Path(__file__).parent
REPO_ROOT = SCHEMA_DIR.parent
DEFAULT_RECORDS = REPO_ROOT / "observatory-ui" / "src" / "assets" / "data" / "sample-records.json"
OUT_PATH = SCHEMA_DIR / "stats" / "facet-stats.json"

# Real full-corpus figures. Used only by the fixture-file mode below -- --from-api mode gets its
# own live corpus block straight from the database server and ignores this dict entirely.
#
# Corrected 2026-09-01 (Phase 5) from a live read-only aggregation against the database server
# (dome_observatory.Content, measured via GET /api/stats): these are marginally lower than the
# dome-triage/mongo_landscape_export tallies this dict previously carried (e.g. positive was
# recorded as 355,569; the live collection has 355,558) -- a handful of records evidently didn't
# make it from that export into the loaded collection. Immaterial to anything displayed, but
# worth keeping the real, current source noted rather than a stale export tally.
CORPUS = {
    "total": 827_061,
    "positive": 355_558,
    "negative": 464_581,
    "undeterminable": 6_922,
    "openAccess": 548_412,
    "fulltextAvailable": 615_151,
    # No enrichment run has landed yet. Once Gavin's batch is in Mongo this becomes a real number
    # and every coverage banner in the UI goes live on its own.
    "enriched": 0,
}
CORPUS_PROVENANCE = (
    "corpus figures measured directly against dome_observatory.Content on the database server via a read-only "
    "aggregation (GET /api/stats), 2026-09-01 -- see observatory-ws/src/stats/stats.service.ts"
)


def count_values(records: list[dict], path: list[str]) -> Counter:
    """Counts scalar values at a dotted path, treating null/'' as the same 'not recorded' bucket."""
    counter: Counter = Counter()
    for rec in records:
        node = rec
        for key in path:
            node = (node or {}).get(key)
        counter[node if node not in (None, "") else ""] += 1
    return counter


def count_list_values(records: list[dict], path: list[str]) -> Counter:
    """Counts each element across an array-valued field."""
    counter: Counter = Counter()
    for rec in records:
        node = rec
        for key in path:
            node = (node or {}).get(key)
        for value in node or []:
            counter[value] += 1
    return counter


def as_facet(counter: Counter, limit: int | None = None) -> list[dict]:
    items = counter.most_common(limit)
    return [{"value": value, "count": count} for value, count in items]


def fetch_from_api(base_url: str) -> dict:
    """Fetches the already-computed FacetStats straight from observatory-ws's GET /api/stats and
    returns it as-is -- the aggregation lives once, in stats.service.ts, so this is a thin
    fetch-and-write rather than a second implementation that could drift from it."""
    url = base_url.rstrip("/") + "/api/stats"
    with urllib.request.urlopen(url, timeout=30) as response:  # noqa: S310 -- fixed, operator-supplied URL
        stats = json.loads(response.read())
    if stats.get("source") != "full-corpus":
        raise SystemExit(f"unexpected source {stats.get('source')!r} from {url} -- expected 'full-corpus'")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", type=Path, default=DEFAULT_RECORDS)
    parser.add_argument("--source", choices=["fixture", "full-corpus"], default="fixture")
    parser.add_argument(
        "--from-api",
        metavar="BASE_URL",
        help="Fetch GET /api/stats from a running observatory-ws (e.g. http://localhost:3000) "
        "instead of counting a local records.json. Overrides --records/--source.",
    )
    args = parser.parse_args()

    if args.from_api:
        stats = fetch_from_api(args.from_api)
        OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
        OUT_PATH.write_text(json.dumps(stats, indent=2) + "\n")
        print(f"wrote {OUT_PATH} (full-corpus, fetched live from {args.from_api}, "
              f"{stats.get('records_counted')} records counted)")
        return 0

    records = json.loads(args.records.read_text())
    years = [
        r["publication_metadata"]["year"]
        for r in records
        if r.get("publication_metadata", {}).get("year")
    ]

    schema_version = (SCHEMA_DIR / "CURRENT").read_text().strip().lstrip("v")

    stats = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "schema_version": schema_version,
        "source": args.source,
        "records_counted": len(records),
        "corpus": CORPUS,
        "corpus_provenance": CORPUS_PROVENANCE,
        "facets": {
            "classification": as_facet(count_values(records, ["llm_classification", "classification"])),
            "license": as_facet(count_values(records, ["source", "access", "license"])),
            "pubTypes": as_facet(count_list_values(records, ["content_filters", "pub_types"])),
            "domainTier1": as_facet(count_values(records, ["content_filters", "domain_tier1"])),
            "learningParadigm": as_facet(count_list_values(records, ["content_filters", "learning_paradigm"])),
            "modelFamily": as_facet(count_list_values(records, ["content_filters", "model_family"])),
            "yearRange": {"min": min(years), "max": max(years)} if years else None,
        },
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(stats, indent=2) + "\n")
    print(f"wrote {OUT_PATH} ({args.source}, {len(records)} records counted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
