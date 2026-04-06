# Fixture Overrides

FPLPlanner uses the official FPL API as its primary source of fixture data.
However, the FPL API sometimes lags behind official Premier League announcements
when fixtures are rescheduled (e.g. due to FA Cup semi-finals, European competition,
or TV broadcast changes). This document explains how to apply manual overrides so
that the app reflects confirmed schedule changes **before** the FPL API catches up.

---

## What are fixture overrides?

Fixture overrides are manual corrections stored in a local JSON file. When an
official Premier League announcement confirms that a fixture will move to a
different gameweek, you can add an entry to `fixture-overrides.json` to:

- Re-slot the fixture into the correct gameweek in **all** app views (Fixtures
  panel, player cards, player info modals, table FDR chips)
- Flag the affected fixture with a subtle **"⚡ Official"** badge so visitors
  can see the data came from a manual override rather than the live API
- Link to the official source URL as the badge tooltip

---

## File location

```
fixture-overrides.json          ← root of the repository
```

---

## Schema

```jsonc
{
  "version": "1.0",
  "overrides": [
    {
      // Unique identifier (used for debugging – not matched against API data)
      "id": "bou-lee-gw34-to-gw33-2025",

      // How to locate the fixture in the FPL API response.
      // Use fixture_id when you know it (most reliable).
      // Otherwise use team_h + team_a + original_event.
      "match": {
        "fixture_id": null,          // FPL fixture ID, or null to use team+event
        "team_h": 3,                 // FPL home team ID
        "team_a": 13,                // FPL away team ID
        "original_event": 34         // Gameweek the API currently shows
      },

      // The new values to apply.
      "override": {
        "event": 33,                 // Corrected gameweek
        "kickoff_time": "2025-04-23T19:30:00Z"  // ISO 8601 — set to null to keep original
      },

      // Only "confirmed" overrides are applied.
      // Use "provisional" to record a pending change without activating it.
      "status": "confirmed",

      // Link to the official announcement (shown in badge tooltip / clickable).
      "source_url": "https://www.premierleague.com/news/XXXXXXX",

      // Human-readable reason (shown in tooltip).
      "notes": "Moved from GW34 to GW33 due to FA Cup semi-finals on 26–27 April",

      // Optional: ISO date from which the override is relevant.
      "effective_from": "2025-04-10"
    }
  ]
}
```

### Field reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique string identifier for the override entry |
| `match.fixture_id` | ❌ | FPL fixture ID — use when known for the most reliable match |
| `match.team_h` | ✅* | FPL home team ID (`state.teams[n].id`) |
| `match.team_a` | ✅* | FPL away team ID |
| `match.original_event` | ✅* | Gameweek number currently shown in FPL API |
| `override.event` | ✅ | Corrected gameweek number |
| `override.kickoff_time` | ❌ | New kickoff time (ISO 8601); omit or set `null` to keep the API value |
| `status` | ✅ | `"confirmed"` to apply the override, `"provisional"` to stage it |
| `source_url` | ❌ | URL to the official PL or FPL announcement |
| `notes` | ❌ | Plain-English reason shown in UI tooltips |
| `effective_from` | ❌ | ISO date the override became effective |

\* Required when `fixture_id` is `null`.

---

## How to find FPL team IDs

Open the browser developer console on the app and run:

```js
// Print all teams with IDs
state.teams.map(t => `${t.id}: ${t.name}`).join('\n')
```

Or visit:
```
https://fantasy.premierleague.com/api/bootstrap-static/
```
and look at the `teams` array in the response.

---

## Precedence rules

1. **`status: "confirmed"`** overrides are applied to all fixture data at startup.
   Only confirmed overrides take effect.
2. **`status: "provisional"`** entries are stored but silently ignored. Use this
   to record an expected change before it is officially confirmed.
3. Matching order: `fixture_id` is checked first; if `null`, the combination of
   `team_h + team_a + original_event` is used.
4. If no override matches a fixture, it is displayed exactly as returned by
   the FPL API — **fallback behaviour is unchanged**.
5. If an override references a team ID or gameweek that doesn't exist, it is
   silently skipped (no crash, no display change).

---

## How to add an override

1. Find the affected fixture using the FPL API or the app's Fixtures panel.
2. Look up the `team_h` and `team_a` IDs (see above).
3. Note the current `event` (gameweek) shown in the API and the new target
   gameweek confirmed in the official announcement.
4. Open `fixture-overrides.json` and add an entry to the `overrides` array:

```jsonc
{
  "id": "unique-slug-here",
  "match": {
    "fixture_id": null,
    "team_h": <HOME_TEAM_ID>,
    "team_a": <AWAY_TEAM_ID>,
    "original_event": <CURRENT_GW_IN_API>
  },
  "override": {
    "event": <CORRECT_GW>,
    "kickoff_time": "<ISO_DATETIME_OR_NULL>"
  },
  "status": "confirmed",
  "source_url": "<OFFICIAL_URL>",
  "notes": "<REASON>",
  "effective_from": "<YYYY-MM-DD>"
}
```

5. Commit and deploy. The override takes effect on the next page load.

---

## How to remove an override

Once the FPL API has updated and reflects the correct fixture data, you can
either:

- **Delete** the entry from the `overrides` array, **or**
- Change `"status": "confirmed"` → `"status": "provisional"` to deactivate it
  without losing the historical record.

---

## Deployment / verification steps

After editing `fixture-overrides.json`:

1. **Build** (optional for Vite dev server):
   ```bash
   npm run build
   ```
2. **Deploy** the updated build to Cloudflare Pages (or trigger CI/CD).
3. **Open** the app and navigate to the Fixtures panel.
4. Check that the affected fixture now appears in the **correct gameweek**.
5. Verify that the **"⚡ Official"** badge is visible on the fixture row and
   that hovering shows the correct tooltip (source URL and notes).
6. Check that the player's fixture chip in the squad/player info modals shows
   an orange override dot for the affected gameweek.
7. If the fix isn't showing, open the browser console and check for any JSON
   parse errors in `fixture-overrides.json`.

---

## Example: DGW33 / BGW34 due to FA Cup semi-finals

When the Premier League confirms that fixtures displaced by FA Cup semi-finals
(GW34) will be rescheduled to the midweek window in GW33:

```jsonc
{
  "id": "bou-lee-gw34-to-gw33-2025",
  "match": {
    "fixture_id": null,
    "team_h": 3,
    "team_a": 13,
    "original_event": 34
  },
  "override": {
    "event": 33,
    "kickoff_time": "2025-04-23T19:30:00Z"
  },
  "status": "confirmed",
  "source_url": "https://www.premierleague.com/news/XXXXXXX",
  "notes": "Rescheduled from GW34 to GW33 midweek due to FA Cup semi-final",
  "effective_from": "2025-04-10"
}
```

After this entry is deployed:

- Bournemouth's GW33 becomes a **DGW** (shows two fixtures for that gameweek)
- Bournemouth's GW34 shows **Blank** (no fixture that week)
- The rescheduled row carries the **"⚡ Official"** badge
