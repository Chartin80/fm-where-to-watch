# Where to Watch Scraper

Pulls US TV broadcast schedules for ~23 soccer competitions from
worldsoccertalk.com once every 48 hours and writes a normalised JSON
document to `dist/where-to-watch.json`. The Fútbol Mundial WordPress plugin
reads that JSON via the public raw.githubusercontent.com URL.

## Why a separate scraper

- Hostinger shared hosting can't reliably run long Node processes on a cron
- WP-Cron only fires on page requests, so a 48h "schedule" is effectively
  "every visit after 48h has passed" — fine for cache invalidation, useless
  for actually doing the scrape
- HTML parsing in PHP is painful; cheerio in Node is one-liner DOM queries
- GitHub Actions is free for public repos, runs on its own infrastructure,
  and gives you a versioned audit log of every JSON revision

## Local development

```bash
cd tools/where-to-watch-scraper
npm install
npm run scrape:dry   # prints first 1.2kb of payload, no file write
npm run scrape       # writes dist/where-to-watch.json
```

## Output schema

```json
{
  "generated_at": "2026-05-04T11:02:33.000Z",
  "source":       "worldsoccertalk.com",
  "partial":      false,
  "errors":       [],
  "competitions": [ { "slug": "eng-premier", "label": "...", "region": "...", "priority": 10 } ],
  "matches": [
    {
      "id":           "eng-premier-202605041430-arsenal-vs-chelsea",
      "competition":  "eng-premier",
      "home":         "Arsenal",
      "away":         "Chelsea",
      "home_slug":    "arsenal",
      "away_slug":    "chelsea",
      "kickoff_utc":  "2026-05-04T18:30:00.000Z",
      "kickoff_et":   "2026-05-04T14:30",
      "channels": [
        { "slug": "usa",      "label": "USA Network", "tier": 2 },
        { "slug": "peacock",  "label": "Peacock",     "tier": 3 }
      ],
      "channels_raw": "USA Network, Peacock"
    }
  ]
}
```

## Adding a competition

Edit `src/competitions.js` and append a new entry. The `wstSlug` must match
the path segment after `/tv-schedules/` on worldsoccertalk.com.

## Adding a broadcaster

Edit `src/broadcasters.js`, add a record with a regex `match`, and drop a
matching `<slug>.svg` into `fm/wp-content/themes/futbol-mundial/assets/img/broadcasters/`.

## Team logos

Each unique team in the scrape is resolved to its Wikipedia article and the
crest thumbnail is downloaded once into `dist/teams/<slug>.png`. The file
`dist/team-logos.json` is the manifest (slug → name, source URL, fetched_at).
Subsequent runs see the cached file and skip the network entirely.

The WP theme serves these via jsDelivr's GitHub CDN — no runtime Wikipedia
traffic. URL pattern:

```
https://cdn.jsdelivr.net/gh/Chartin80/fm-where-to-watch@main/dist/teams/{slug}.png
```

If a team can't be matched (homonymous city page wins, no thumbnail, etc.),
edit `src/teams.js` and add an explicit Wikipedia title in `TEAM_WIKI`. The
scraper logs misses with `[logos] missing` lines — those are exactly the
strings to add as keys.

## Competition logos

Same approach as teams but with a hand-curated `COMP_WIKI` map in
`src/comp-logos.js`. PNGs are committed under `dist/competitions/<slug>.png`
and the manifest lives at `dist/comp-logos.json`. The competitions filter
in the WP sidebar pulls these via the same jsDelivr CDN:

```
https://cdn.jsdelivr.net/gh/Chartin80/fm-where-to-watch@main/dist/competitions/{slug}.png
```

To swap a competition's logo, edit the title in `COMP_WIKI`, delete the
slug's entry from `dist/comp-logos.json` and the matching PNG, then
`npm run scrape` re-fetches just that one.

## Selector drift

WST will change their template eventually. When that happens:

1. `npm run scrape` will succeed but parse 0 matches per competition
2. The `partial: true` flag will NOT trip — a 0-row competition isn't an error
3. The plugin will keep serving the previous (stale) JSON because it caches
   the last successful payload

To detect drift, GitHub Actions emits a log line per competition:
`→ N matches`. Set up an alert on `→ 0 matches` if you want hands-off ops.

## Manual run

Visit Actions → "Scrape Where to Watch" → "Run workflow".
