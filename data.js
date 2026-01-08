// data.js - Direct FPL API (no proxy needed)
export let state = {
  currentGW: 1,
  elements: [],
  teams: [],
  fixtures: [],
  bootstrap: {}
};

const FPL_BASE = '/api';

export async function loadBootstrap() {
  try {
    const res = await fetch(`${FPL_BASE}/bootstrap-static/`);
    state.bootstrap = await res.json();
    state.elements = state.bootstrap.elements;
    state.teams = state.bootstrap.teams;
    state.currentGW = state.bootstrap.events.find(e => e.is_next)?.id || 1;
    console.log(`Loaded ${state.elements.length} players for GW ${state.currentGW}`);
    return true;
  } catch (err) {
    console.error('Bootstrap error:', err);
    return false;
  }
}

export async function loadFixtures(gw) {
  const res = await fetch(`${FPL_BASE}/fixtures/?event=${gw}`);
  state.fixtures = await res.json();
}

export async function loadTeamEntry(managerId, gw) {
  try {
    const res = await fetch(`/api/fpl/entry/${managerId}/event/${gw}/picks/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('Team entry error:', err);
    return null;
  }
}

