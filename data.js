// data.js - FPL data via Cloudflare Pages Functions proxy (/api/fpl/*)

export let state = {
  // "Current" GW from bootstrap (e.g. 22)
  currentGW: 1,

  // The GW the user is viewing/planning (starts at currentGW)
  viewingGW: 1,

  // The GW we successfully fetched picks from (often currentGW-1 while current is in progress)
  importedGW: null,

  // Bank in £m (editable)
  bank: 0.0,

  // selling | purchase | current
  priceMode: 'selling',

  // Base FPL datasets
  elements: [],
  teams: [],
  fixtures: [],
  bootstrap: {},

  // Plan for 8 GWs: plan[gw] = { starting: [{id,purchasePrice,sellingPrice}], bench: [...] }
  plan: {},
};

const FPL_BASE = '/api/fpl';

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function calculateSellingPrice(purchasePrice, currentPrice) {
  if (purchasePrice === undefined || purchasePrice === null) return currentPrice;
  if (currentPrice <= purchasePrice) return currentPrice;

  // FPL selling price rule: keep half profit, rounded down to 0.1
  const pp = Math.round(purchasePrice * 10);
  const cp = Math.round(currentPrice * 10);
  const profit = cp - pp;
  const gain = Math.floor(profit / 2);
  return (pp + gain) / 10;
}

function getCurrentPrice(elementId) {
  const p = state.elements.find(x => x.id === elementId);
  return p ? (p.now_cost / 10) : 0;
}

async function parseJsonOrThrow(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Expected JSON but got "${ct || 'unknown'}" (HTTP ${res.status}). Body: ${text.slice(0, 120)}`);
  }
  return await res.json();
}

function initEmptyPlan() {
  state.plan = {};
  for (let i = 0; i < 8; i++) {
    const gw = state.currentGW + i;
    state.plan[gw] = { starting: [], bench: [] };
  }
}

// data.js - only this function needs updating

export async function loadBootstrap() {
  try {
    const res = await fetch(`${FPL_BASE}/bootstrap-static/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    state.bootstrap = await parseJsonOrThrow(res);
    state.elements = state.bootstrap.elements || [];
    state.teams = state.bootstrap.teams || [];

    const events = state.bootstrap.events || [];
    const current = events.find(e => e.is_current)?.id;
    const next = events.find(e => e.is_next)?.id;

    // Use the *upcoming* GW as the planner's current GW when available
    state.currentGW = next || current || 1;
    state.viewingGW = state.currentGW;

    initEmptyPlan();
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

async function loadTransfersPurchaseMap(managerId) {
  // Same approach as your older single-file: build purchase map from /transfers/ [file:71]
  try {
    const res = await fetch(`${FPL_BASE}/entry/${managerId}/transfers/`);
    if (!res.ok) return {};

    const transfers = await parseJsonOrThrow(res);
    if (!Array.isArray(transfers)) return {};

    // Sort newest first so first seen element_in becomes the most recent purchase price
    transfers.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));

    const map = {};
    for (const tr of transfers) {
      if (tr && tr.element_in != null && map[tr.element_in] === undefined && tr.element_in_cost != null) {
        map[tr.element_in] = tr.element_in_cost / 10;
      }
    }
    return map;
  } catch (e) {
    return {};
  }
}

/**
 * Option A import:
 * Try current GW first; if not found, fall back to latest finished/previous GW.
 * When we import from an older GW, we still populate the plan starting at *currentGW*.
 */
export async function loadTeamEntry(managerId, gwRequested) {
  const events = state.bootstrap?.events || [];

  // Candidates to try (in order)
  const candidates = [];

  if (Number.isFinite(+gwRequested)) candidates.push(+gwRequested);

  const finished = events
    .filter(
      e =>
        e &&
        typeof e.id === 'number' &&
        e.id <= gwRequested &&
        (e.finished || e.is_previous)
    )
    .sort((a, b) => b.id - a.id)
    .map(e => e.id);

  for (const id of finished) candidates.push(id);

  // final safety
  for (let g = gwRequested - 1; g >= Math.max(1, gwRequested - 6); g--) {
    candidates.push(g);
  }

  const unique = [];
  const seen = new Set();
  for (const g of candidates) {
    if (!seen.has(g)) {
      seen.add(g);
      unique.push(g);
    }
  }

  // Purchase-price map from transfers (best-effort)
  const purchaseMap = await loadTransfersPurchaseMap(managerId);

  // Fetch entry summary (for free transfers etc.)
  let entrySummary = null;
  try {
    const entryRes = await fetch(`${FPL_BASE}/entry/${managerId}/`);
    if (entryRes.ok) {
      entrySummary = await parseJsonOrThrow(entryRes);
    }
  } catch (e) {
    // non-fatal
  }

  // Derive free transfers (simple + safe)
  if (entrySummary) {
    const usedLastGW = entrySummary.last_deadline_total_transfers ?? 0;
    state.freeTransfers = usedLastGW === 0 ? 2 : 1;
  }

  for (const gw of unique) {
    try {
      const res = await fetch(
        `${FPL_BASE}/entry/${managerId}/event/${gw}/picks/`
      );
      if (!res.ok) continue;

      const json = await parseJsonOrThrow(res);
      if (!json || !json.picks) continue;

      // Mark imported gw
      state.importedGW = gw;
      json._imported_gw = gw;

      // Extract bank at last deadline (entry_history.bank is in 0.1 units)
      const bankTenths = json.entry_history?.bank;
      if (typeof bankTenths === 'number') {
        state.bank = bankTenths / 10;
      }

      // Build starting/bench entries with purchase & selling prices
      const picks = json.picks || [];

      const starting = picks
        .filter(p => p.position <= 11)
        .sort((a, b) => a.position - b.position)
        .map(p => {
          const currentPrice = getCurrentPrice(p.element);
          const purchasePrice = purchaseMap[p.element] ?? currentPrice;
          const sellingPrice = calculateSellingPrice(
            purchasePrice,
            currentPrice
          );
          return { id: p.element, purchasePrice, sellingPrice };
        });

      const bench = picks
        .filter(p => p.position > 11)
        .sort((a, b) => a.position - b.position)
        .map(p => {
          const currentPrice = getCurrentPrice(p.element);
          const purchasePrice = purchaseMap[p.element] ?? currentPrice;
          const sellingPrice = calculateSellingPrice(
            purchasePrice,
            currentPrice
          );
          return { id: p.element, purchasePrice, sellingPrice };
        });

      // Populate planner from currentGW forward
      for (let i = 0; i < 8; i++) {
        const g = state.currentGW + i;
        if (!state.plan[g]) {
          state.plan[g] = { starting: [], bench: [] };
        }
        state.plan[g].starting = deepCopy(starting);
        state.plan[g].bench = deepCopy(bench);
      }

      // Always show current GW in the UI after import
      state.viewingGW = state.currentGW;

      return json;
    } catch (e) {
      // try next gw
    }
  }

  return null;
}
