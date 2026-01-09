// data.js - FPL data via Cloudflare Pages Functions proxy (/api/fpl/*)

export let state = {
  currentGW: 1,        // current GW (e.g., 22)
  importedGW: null,    // GW we actually imported picks from (e.g., 21)
  elements: [],
  teams: [],
  fixtures: [],
  bootstrap: {}
};

const FPL_BASE = '/api/fpl';

async function parseJsonOrThrow(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Expected JSON but got "${ct || 'unknown'}" (HTTP ${res.status}). Body: ${text.slice(0, 120)}`);
  }
  return await res.json();
}

export async function loadBootstrap() {
  try {
    const res = await fetch(`${FPL_BASE}/bootstrap-static/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    state.bootstrap = await parseJsonOrThrow(res);
    state.elements = state.bootstrap.elements || [];
    state.teams = state.bootstrap.teams || [];

    // Use CURRENT GW for the app's "current GW" display.
    const current = state.bootstrap.events?.find(e => e.is_current)?.id;
    const next = state.bootstrap.events?.find(e => e.is_next)?.id;
    state.currentGW = current || next || 1;

    return true;
  } catch (err) {
    console.error('Bootstrap error:', err);
    return false;
  }
}

export async function loadFixtures(gw) {
  const res = await fetch(`${FPL_BASE}/fixtures/?event=${gw}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  state.fixtures = await parseJsonOrThrow(res);
  return state.fixtures;
}

/**
 * Option A:
 * Try requested GW first (e.g., 22). If "Not found", fall back to the most recent
 * finished/previous GW from bootstrap (typically GW21 while GW22 is in progress).
 */
export async function loadTeamEntry(managerId, gwRequested) {
  const events = state.bootstrap?.events || [];

  // Candidate GWs in order to try
  const candidates = [];

  // 1) Try the requested GW first (sometimes it works)
  if (Number.isFinite(+gwRequested)) candidates.push(+gwRequested);

  // 2) Then try last finished/previous GWs (most likely to work)
  const finished = events
    .filter(e => e && typeof e.id === 'number' && e.id <= gwRequested && (e.finished || e.is_previous))
    .sort((a, b) => b.id - a.id)
    .map(e => e.id);

  for (const id of finished) candidates.push(id);

  // 3) Final safety fallback: just step backwards a little
  for (let g = gwRequested - 1; g >= Math.max(1, gwRequested - 6); g--) candidates.push(g);

  // De-dupe while preserving order
  const unique = [];
  const seen = new Set();
  for (const g of candidates) {
    if (!seen.has(g)) {
      seen.add(g);
      unique.push(g);
    }
  }

  // Try each GW until picks are returned
  for (const gw of unique) {
    try {
      const res = await fetch(`${FPL_BASE}/entry/${managerId}/event/${gw}/picks/`);
      if (!res.ok) continue;

      const json = await parseJsonOrThrow(res);

      if (json && json.picks) {
        json._imported_gw = gw;
        state.importedGW = gw;
        return json;
      }
    } catch (e) {
      // keep trying other GWs
    }
  }

  return null;
}
