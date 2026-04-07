// fixture-resolver.js
// Central fixture resolution layer: fetches all fixtures once, applies manual
// overrides (from fixture-overrides.json), and exposes a shared resolved cache
// consumed by fixtures.js, ui-render.js, and table.js.

import overridesData from './fixture-overrides.json';

// null = cache not yet built; Map<gw, fixture[]> = ready
let _allFixturesByGW = null;

// ─────────────────────────────────────────────
//  Cache state helpers
// ─────────────────────────────────────────────

/** Returns true once initFixtureResolver() has completed successfully. */
export function isResolverReady() {
  return _allFixturesByGW !== null;
}

// ─────────────────────────────────────────────
//  Initialisation
// ─────────────────────────────────────────────

/**
 * Fetches ALL FPL fixtures from the API, applies overrides, and populates the
 * module-level cache.  Subsequent calls are no-ops (idempotent).
 *
 * @throws {Error} if the network request fails
 */
export async function initFixtureResolver() {
  if (_allFixturesByGW !== null) return; // already initialised

  const res = await fetch('/api/fpl/fixtures');
  if (!res.ok) throw new Error(`Failed to load fixtures (HTTP ${res.status})`);

  const data = await res.json();
  const resolved = applyOverrides(data);

  _allFixturesByGW = new Map();
  for (const f of resolved) {
    if (!f.event) continue;
    if (!_allFixturesByGW.has(f.event)) {
      _allFixturesByGW.set(f.event, []);
    }
    _allFixturesByGW.get(f.event).push(f);
  }
}

// ─────────────────────────────────────────────
//  Cache accessors
// ─────────────────────────────────────────────

/**
 * Returns the resolved fixture list for a given gameweek.
 * Returns null when the cache has not been initialised yet.
 * Returns an empty array when the gameweek has no fixtures.
 *
 * @param {number} gw
 * @returns {Array|null}
 */
export function getResolvedFixturesForGW(gw) {
  if (_allFixturesByGW === null) return null;
  return _allFixturesByGW.get(gw) || [];
}

/**
 * Returns the full Map<gw, fixture[]> of resolved fixtures, or null if not
 * yet initialised.
 *
 * @returns {Map|null}
 */
export function getResolvedFixturesMap() {
  return _allFixturesByGW;
}

// ─────────────────────────────────────────────
//  Override application (pure, no side effects)
// ─────────────────────────────────────────────

/**
 * Applies confirmed fixture overrides to a raw fixture array.
 * Returns a NEW array; the original is not mutated.
 *
 * Overridden fixtures gain:
 *   - updated `event` (gameweek)
 *   - updated `kickoff_time` (when specified in override)
 *   - `_override` metadata object for UI indicators
 *
 * Fixtures with no matching override are returned unchanged.
 *
 * @param {Array} fixtures - Raw fixture objects from FPL API
 * @returns {Array} - Resolved fixture array
 */
export function applyOverrides(fixtures) {
  if (!Array.isArray(fixtures)) return [];

  const activeOverrides = getActiveOverrides();
  if (!activeOverrides.length) return fixtures;

  return fixtures.map((f) => {
    const match = activeOverrides.find((ov) => _matchesOverride(f, ov));
    if (!match) return f;

    const overridden = {
      ...f,
      event: match.override.event,
      _override: {
        original_event: match.match.original_event,
        status: match.status,
        source_url: match.source_url || null,
        notes: match.notes || null,
        override_id: match.id || null,
      },
    };

    if (match.override.kickoff_time) {
      overridden.kickoff_time = match.override.kickoff_time;
    }

    return overridden;
  });
}

/**
 * Returns all overrides whose status is 'confirmed'.
 * Only confirmed overrides are applied to live data.
 *
 * @returns {Array}
 */
export function getActiveOverrides() {
  return (overridesData.overrides || []).filter(
    (ov) => ov && ov.status === 'confirmed'
  );
}

// ─────────────────────────────────────────────
//  Internal matching logic
// ─────────────────────────────────────────────

/**
 * Returns true when a raw FPL fixture matches the criteria in an override entry.
 *
 * Precedence:
 *  1. fixture_id (most reliable – use when the FPL fixture ID is known)
 *  2. team_h + team_a + original_event (fallback for pre-announcement overrides)
 *
 * @param {Object} fixture
 * @param {Object} override
 * @returns {boolean}
 */
function _matchesOverride(fixture, override) {
  const m = override.match;
  if (!m) return false;

  // Primary: exact fixture ID match
  if (m.fixture_id != null && fixture.id === m.fixture_id) return true;

  // Secondary: team combination + original gameweek
  if (m.team_h != null && m.team_a != null && m.original_event != null) {
    return (
      fixture.team_h === m.team_h &&
      fixture.team_a === m.team_a &&
      fixture.event === m.original_event
    );
  }

  return false;
}
