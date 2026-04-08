// data.js - FPL data via Cloudflare Pages Functions proxy (/api/fpl/*)

import { fetchDefconData, mergeDefconIntoElements } from './defcon.js';

export let history = {
  baseline: null,
  undoStack: []
};

export let state = {
  // "Current" GW from bootstrap (e.g. 22)
  currentGW: 1,

  // The GW the user is viewing/planning (starts at currentGW)
  viewingGW: 1,

  // The minimum GW that user can navigate back to (set after team import)
  minNavigableGW: 1,

  // The GW we successfully fetched picks from (often currentGW-1 while current is in progress)
  importedGW: null,

  // Manager ID from imported team (used for syncing saved drafts)
  managerId: null,

  // Bank in £m (editable)
  bank: 0.0,

  // selling | purchase | current
  priceMode: 'selling',

  // Base FPL datasets
  elements: [],
  teams: [],
  fixtures: [],
  bootstrap: {},

  // Plan for all GWs up to GW38: plan[gw] = { starting: [{id,purchasePrice,sellingPrice}], bench: [...], chip: null|'wildcard'|'bboost'|'3xc'|'freehit', captain: null, viceCaptain: null }
  plan: {},

  // Free transfers tracked per GW (manually editable in UI)
  freeTransfersByGW: {},

  // Chips marked as already used historically (for mid-season planners)
  historicallyUsedChips: {},
};

const FPL_BASE = '/api/fpl';
export const CHIP_TYPES = ['wildcard', 'freehit', 'bboost', '3xc'];

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

/**
 * Recomputes sellingPrice for every player entry in a plan using current bootstrap prices.
 * Call this whenever a saved draft is loaded so that stale persisted sellingPrices
 * (which can exceed currentPrice after an overnight price drop) are corrected.
 */
export function normalizePlanPrices(plan) {
  if (!plan) return;
  for (const gw of Object.values(plan)) {
    if (!gw) continue;
    for (const arr of [gw.starting, gw.bench]) {
      if (!Array.isArray(arr)) continue;
      for (let i = 0; i < arr.length; i++) {
        const entry = arr[i];
        if (!entry || !entry.id) continue;
        const currentPrice = getCurrentPrice(entry.id);
        const purchasePrice = entry.purchasePrice ?? currentPrice;
        const sellingPrice = calculateSellingPrice(purchasePrice, currentPrice);
        arr[i] = { ...entry, purchasePrice, sellingPrice };
      }
    }
  }
}

/**
 * Count transfers made in gameweek `gw` by comparing player IDs in plan[gw]
 * against plan[gw - 1]. Returns 0 when either side is unavailable.
 */
export function countTransfersInGW(gw) {
  const curr = state.plan?.[gw];
  const prev = state.plan?.[gw - 1];
  if (!curr || !prev) return 0;

  const prevIds = new Set([...(prev.starting || []), ...(prev.bench || [])].map(e => e.id));
  return [...(curr.starting || []), ...(curr.bench || [])]
    .map(e => e.id)
    .filter(id => !prevIds.has(id)).length;
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
  state.freeTransfersByGW = {};
  state.historicallyUsedChips = {};
  // Initialize plan up to GW38 to allow full season planning
  for (let gw = state.currentGW; gw <= 38; gw++) {
    state.plan[gw] = { starting: [], bench: [], chip: null, captain: null, viceCaptain: null };
    state.freeTransfersByGW[gw] = 1;
  }
  for (const chip of CHIP_TYPES) state.historicallyUsedChips[chip] = false;
}

function normalizeFreeTransfersValue(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.max(0, Math.min(5, n));
}

export function ensureFreeTransfersByGW() {
  if (!state.freeTransfersByGW || typeof state.freeTransfersByGW !== 'object') {
    state.freeTransfersByGW = {};
  }

  const startGW = Math.max(1, state.minNavigableGW ?? state.currentGW ?? 1);
  for (let gw = startGW; gw <= 38; gw++) {
    state.freeTransfersByGW[gw] = normalizeFreeTransfersValue(state.freeTransfersByGW[gw]);
  }
}

export function getFreeTransfersForGW(gw) {
  return normalizeFreeTransfersValue(state.freeTransfersByGW?.[gw]);
}

export function setFreeTransfersForGW(gw, value) {
  if (!state.freeTransfersByGW || typeof state.freeTransfersByGW !== 'object') {
    state.freeTransfersByGW = {};
  }
  state.freeTransfersByGW[gw] = normalizeFreeTransfersValue(value);
}

export function recomputeFreeTransfersFromGW(startGW) {
  ensureFreeTransfersByGW();
  const start = Math.max(1, startGW ?? state.minNavigableGW ?? state.currentGW ?? 1);

  for (let gw = start; gw < 38; gw++) {
    const currentFT = getFreeTransfersForGW(gw);
    const chip = state.plan?.[gw]?.chip || null;
    const transfers = countTransfersInGW(gw);
    const skipDeduction = chip === 'wildcard' || chip === 'freehit';

    const nextFT = skipDeduction
      ? Math.min(5, currentFT + 1)
      : Math.min(5, Math.max(0, currentFT - transfers) + 1);

    state.freeTransfersByGW[gw + 1] = nextFT;
  }
}

export function ensureHistoricallyUsedChips() {
  if (!state.historicallyUsedChips || typeof state.historicallyUsedChips !== 'object') {
    state.historicallyUsedChips = {};
  }
  for (const chip of CHIP_TYPES) {
    state.historicallyUsedChips[chip] = !!state.historicallyUsedChips[chip];
  }
}

export function isChipHistoricallyUsed(chipType) {
  ensureHistoricallyUsedChips();
  return !!state.historicallyUsedChips[chipType];
}

export function setChipHistoricallyUsed(chipType, isUsed) {
  ensureHistoricallyUsedChips();
  state.historicallyUsedChips[chipType] = !!isUsed;
}

export function resetChipUsageState() {
  ensureHistoricallyUsedChips();
  for (const chip of CHIP_TYPES) {
    state.historicallyUsedChips[chip] = false;
  }
  for (let gw = state.currentGW; gw <= 38; gw++) {
    if (!state.plan[gw]) continue;
    state.plan[gw].chip = null;
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

    // Use the current GW when available (GW is live) for importing data
    // Only use next GW during the gap between gameweeks
    state.currentGW = current || next || 1;
    
    // For planning purposes, default to viewing the next GW
    // This allows users to plan for the upcoming gameweek
    state.viewingGW = next || current || 1;
    
    // Set initial minimum navigable GW at bootstrap (before any team import)
    state.minNavigableGW = state.viewingGW;

    initEmptyPlan();
    
    // Load DEFCON data in the background (non-blocking)
    loadDefconData();
    
    return true;
  } catch (err) {
    console.error('Bootstrap error:', err);
    return false;
  }
}

/**
 * Loads DEFCON data and merges it into elements.
 * This is called after bootstrap loads and runs in the background.
 */
export async function loadDefconData() {
  try {
    console.log('Loading DEFCON data...');
    const defconData = await fetchDefconData(state.elements);
    mergeDefconIntoElements(state.elements, defconData);
    console.log('DEFCON data loaded successfully');
    
    // Trigger table re-render if available (avoid circular dependency)
    if (typeof window.renderTable === 'function') {
      window.renderTable();
    }
  } catch (error) {
    console.error('Failed to load DEFCON data:', error);
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

  // Fetch entry summary for current bank balance
  let entrySummary = null;
  try {
    const entryRes = await fetch(`${FPL_BASE}/entry/${managerId}/`);
    if (entryRes.ok) {
      entrySummary = await parseJsonOrThrow(entryRes);
    }
  } catch (e) {
    // non-fatal
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

      // Use current bank from entry summary if available (most accurate for current GW)
      // Otherwise fall back to historical bank from picks
      if (entrySummary && typeof entrySummary.last_deadline_bank === 'number') {
        state.bank = entrySummary.last_deadline_bank / 10;
      } else {
        // Extract bank at last deadline (entry_history.bank is in 0.1 units)
        const bankTenths = json.entry_history?.bank;
        if (typeof bankTenths === 'number') {
          state.bank = bankTenths / 10;
        }
      }

      // Build starting/bench entries with purchase & selling prices
      const picks = json.picks || [];

      // Extract captain and vice-captain from picks
      const captainPick = picks.find(p => p.is_captain);
      const viceCaptainPick = picks.find(p => p.is_vice_captain);
      const captainId = captainPick ? captainPick.element : null;
      const viceCaptainId = viceCaptainPick ? viceCaptainPick.element : null;

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

      // Populate planner from currentGW up to GW38
      for (let g = state.currentGW; g <= 38; g++) {
        if (!state.plan[g]) {
          state.plan[g] = { starting: [], bench: [], chip: null, captain: null, viceCaptain: null };
        }
        state.plan[g].starting = deepCopy(starting);
        state.plan[g].bench = deepCopy(bench);
        state.plan[g].chip = null;
        state.plan[g].captain = captainId;
        state.plan[g].viceCaptain = viceCaptainId;
      }
      resetChipUsageState();
      ensureFreeTransfersByGW();
      recomputeFreeTransfersFromGW(state.currentGW);

      // Set viewing GW to next gameweek for planning purposes
      const events = state.bootstrap?.events || [];
      const next = events.find(e => e.is_next)?.id;
      state.viewingGW = next || state.currentGW;
      
      // Set minimum navigable GW after successful team import to prevent going back before imported GW
      state.minNavigableGW = state.viewingGW;

      // Save baseline state for Reset
      history.baseline = JSON.parse(JSON.stringify(state));
      history.undoStack = [];

      return json;
    } catch (e) {
      // try next gw
    }
  }

  return null;
}
