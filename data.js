// data.js - FPL API via Cloudflare Pages proxy (/api/fpl/*)

export let state = {
  currentGW: 1,
  elements: [],
  teams: [],
  fixtures: [],
  bootstrap: {},
};

// Route everything through your Pages Function proxy
const FPL_BASE = '/api/fpl';

async function parseJsonOrThrow(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(
      `Expected JSON but got "${contentType || 'unknown'}" (HTTP ${res.status}). ` +
      `Body starts: ${text.slice(0, 120)}`
    );
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

    // Use CURRENT gameweek (in play); if none exists, fall back to NEXT.
    const current = state.bootstrap.events?.find(e => e.is_current)?.id;
    const next = state.bootstrap.events?.find(e => e.is_next)?.id;
    state.currentGW = current || next || 1;

    console.log(`Loaded ${state.elements.length} players for GW ${state.currentGW}`);
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

export async function loadTeamEntry(managerId, gw) {
  try {
    const res = await fetch(`${FPL_BASE}/entry/${managerId}/event/${gw}/picks/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await parseJsonOrThrow(res);
  } catch (err) {
    console.error('Team entry error:', err);
    return null;
  }
}
