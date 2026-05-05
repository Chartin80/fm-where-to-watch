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
