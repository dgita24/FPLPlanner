// test-stale-season-restore.js
// Regression tests for stale cross-season state detection at startup.
//
// These tests reproduce the bug reported after PR #122 was merged:
//   - User had fplplanner-state saved from the previous season (viewingGW=38, old players)
//   - Season rolled over; bootstrap now reports new season at GW1
//   - Since no fplplanner-season-marker key existed in localStorage (first deploy of the
//     season-marker feature), handleSeasonRolloverIfNeeded() did not clear the stale state
//   - main.js then restored the stale state: viewingGW=38, old-season players
//   - The forward-only GW clamp (viewingGW < planningGW) did not fire because 38 > 1
//   - Result: app showed GW38, half-populated old team, wrong/blank fixture panel
//
// Run with: node test-stale-season-restore.js

const MAX_GAMEWEEK = 38;

function getBootstrapPlanningGW(events, currentGW) {
  const next = events.find(e => e.is_next)?.id;
  const current = events.find(e => e.is_current)?.id;
  if (next) return next;
  if (current) return Math.min(current + 1, MAX_GAMEWEEK);
  return currentGW || 1;
}

/**
 * Simulates the state-restore decision from main.js.
 *
 * Returns:
 *   null                                  – no saved data or empty plan
 *   { discarded: true,  reason: string }  – stale/mismatched state, do not restore
 *   { discarded: false, state: object }   – valid state, restore it
 */
function simulateStateRestore(savedData, currentSeasonMarker, bootstrapPlanningGW) {
  if (!savedData) return null;

  const savedSeasonMarker = savedData.seasonMarker;

  // Case 1: explicit season marker mismatch
  const explicitSeasonMismatch =
    savedSeasonMarker && currentSeasonMarker &&
    savedSeasonMarker !== currentSeasonMarker;

  // Case 2: legacy state (no saved marker) at the very start of a new season
  const likelyStaleNoMarker =
    !savedSeasonMarker &&
    bootstrapPlanningGW <= 2 &&
    (savedData.viewingGW ?? 1) > 5;

  if (explicitSeasonMismatch || likelyStaleNoMarker) {
    return {
      discarded: true,
      reason: explicitSeasonMismatch ? 'seasonMismatch' : 'likelyStale',
    };
  }

  if (savedData.plan && Object.values(savedData.plan).some(gw => gw?.starting?.length > 0)) {
    return { discarded: false, state: savedData };
  }

  return null;
}

// ── Test fixtures ────────────────────────────────────────────────────────────

const newSeasonMarker = JSON.stringify({
  firstEventId: 1,
  firstEventDeadline: '2025-08-15T17:30:00Z',
  lastEventId: 38,
  lastEventDeadline: '2026-05-24T14:00:00Z',
  totalEvents: 38,
});

const oldSeasonMarker = JSON.stringify({
  firstEventId: 1,
  firstEventDeadline: '2024-08-16T17:30:00Z',
  lastEventId: 38,
  lastEventDeadline: '2025-05-25T14:00:00Z',
  totalEvents: 38,
});

// Typical stale save: the user left the app on GW38 of the previous season.
// Written BEFORE the season-marker feature was deployed (no seasonMarker field).
const staleLegacySavedState = {
  plan: {
    38: {
      starting: [{ id: 100001, purchasePrice: 10.0, sellingPrice: 10.0 }],
      bench: [],
      chip: null,
      captain: 100001,
      viceCaptain: null,
    },
  },
  bank: 5.2,
  viewingGW: 38,
  minNavigableGW: 35,
  priceMode: 'selling',
  freeTransfersByGW: {},
  historicallyUsedChips: {},
  // No seasonMarker — legacy format
};

// ── Runner ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('== THE BUG: legacy GW38 state discarded when new season is GW1 ==');
{
  // Exact scenario that produced the reported regression.
  const newSeasonEvents = [
    { id: 1, is_next: true, is_current: false, finished: false },
  ];
  const bootstrapPlanningGW = getBootstrapPlanningGW(newSeasonEvents, 1);
  assert(bootstrapPlanningGW === 1, 'bootstrap planning GW is 1 at season start');

  const result = simulateStateRestore(staleLegacySavedState, newSeasonMarker, bootstrapPlanningGW);
  assert(result?.discarded === true, 'stale GW38 state is discarded');
  assert(result?.reason === 'likelyStale', 'discarded via legacy heuristic (no saved marker, GW1 season, high savedGW)');
}

console.log('\n== Explicit season marker mismatch always discards saved state ==');
{
  // Saved state has the old season\'s marker explicitly stored (post-fix format).
  const savedWithOldMarker = {
    ...staleLegacySavedState,
    viewingGW: 1, // even GW1 from old season should be discarded
    seasonMarker: oldSeasonMarker,
  };
  const result = simulateStateRestore(savedWithOldMarker, newSeasonMarker, 1);
  assert(result?.discarded === true, 'old-marker state discarded even when viewingGW=1');
  assert(result?.reason === 'seasonMismatch', 'discarded via explicit marker check');
}

console.log('\n== Matching season marker — same-season state is restored ==');
{
  const validSavedState = {
    plan: {
      15: {
        starting: [{ id: 200001, purchasePrice: 8.0, sellingPrice: 8.0 }],
        bench: [],
        chip: null,
        captain: 200001,
        viceCaptain: null,
      },
    },
    bank: 3.5,
    viewingGW: 15,
    minNavigableGW: 14,
    priceMode: 'selling',
    freeTransfersByGW: {},
    historicallyUsedChips: {},
    seasonMarker: newSeasonMarker, // same season
  };
  const midSeasonEvents = [
    { id: 14, is_current: true, is_next: false, finished: false },
    { id: 15, is_next: true, is_current: false, finished: false },
  ];
  const bootstrapPlanningGW = getBootstrapPlanningGW(midSeasonEvents, 14);
  assert(bootstrapPlanningGW === 15, 'bootstrap planning GW is 15 mid-season');

  const result = simulateStateRestore(validSavedState, newSeasonMarker, bootstrapPlanningGW);
  assert(result?.discarded === false, 'same-season state with matching marker is restored');
  assert(result?.state?.viewingGW === 15, 'saved viewingGW is preserved');
  assert(result?.state?.bank === 3.5, 'saved bank is preserved');
}

console.log('\n== Legacy mid-season state is NOT discarded when bootstrap is mid-season ==');
{
  // A user who visited mid-season BEFORE the season-marker feature was deployed
  // has no seasonMarker in their save.  Bootstrap is at GW19 (same season).
  // The likelyStaleNoMarker heuristic must NOT fire because bootstrapPlanningGW > 2.
  const midSeasonLegacySave = {
    plan: {
      18: {
        starting: [{ id: 300001, purchasePrice: 7.0, sellingPrice: 7.0 }],
        bench: [],
        chip: null,
        captain: 300001,
        viceCaptain: null,
      },
    },
    bank: 4.0,
    viewingGW: 18,
    minNavigableGW: 16,
    priceMode: 'selling',
    freeTransfersByGW: {},
    historicallyUsedChips: {},
    // No seasonMarker (legacy format)
  };
  const midSeasonEvents = [
    { id: 18, is_current: true, is_next: false, finished: false },
    { id: 19, is_next: true, is_current: false, finished: false },
  ];
  const bootstrapPlanningGW = getBootstrapPlanningGW(midSeasonEvents, 18);
  assert(bootstrapPlanningGW === 19, 'bootstrap planning GW is 19');

  const result = simulateStateRestore(midSeasonLegacySave, newSeasonMarker, bootstrapPlanningGW);
  // bootstrapPlanningGW=19 > 2, so likelyStaleNoMarker is false
  assert(result?.discarded !== true, 'mid-season legacy state is not discarded (bootstrapGW > 2)');
}

console.log('\n== Legacy state with low savedGW at season start is not discarded ==');
{
  // Pre-season: user navigated to GW1 and saved. Then comes back next day.
  // bootstrapPlanningGW=1, savedViewingGW=1 — heuristic threshold (> 5) is not met.
  const preSeasonSave = {
    plan: {
      1: {
        starting: [{ id: 400001, purchasePrice: 6.0, sellingPrice: 6.0 }],
        bench: [],
        chip: null,
        captain: 400001,
        viceCaptain: null,
      },
    },
    bank: 94.0,
    viewingGW: 1,
    minNavigableGW: 1,
    priceMode: 'selling',
    freeTransfersByGW: {},
    historicallyUsedChips: {},
    // No seasonMarker — but savedViewingGW=1 ≤ threshold of 5
  };
  const result = simulateStateRestore(preSeasonSave, newSeasonMarker, 1);
  assert(result?.discarded !== true, 'saved GW1 state at GW1 bootstrap is not discarded by heuristic');
}

console.log('\n== No saved data returns null (bootstrap defaults are used) ==');
{
  const result = simulateStateRestore(null, newSeasonMarker, 1);
  assert(result === null, 'null saved data returns null');
}

console.log('\n== Empty plan returns null (no-op, not treated as stale) ==');
{
  const emptyPlanSave = {
    plan: { 1: { starting: [], bench: [], chip: null, captain: null, viceCaptain: null } },
    bank: 100.0,
    viewingGW: 1,
    minNavigableGW: 1,
    priceMode: 'selling',
    freeTransfersByGW: {},
    historicallyUsedChips: {},
    seasonMarker: newSeasonMarker,
  };
  const result = simulateStateRestore(emptyPlanSave, newSeasonMarker, 1);
  assert(result === null, 'empty plan is treated as no saved data (null)');
}

console.log('\n== Build mode: stale state discard leaves initEmptyPlan squads intact ==');
{
  // After discard, state.plan should come from initEmptyPlan() — all empty squads.
  const emptyPlan = {};
  for (let gw = 1; gw <= MAX_GAMEWEEK; gw++) {
    emptyPlan[gw] = { starting: [], bench: [], chip: null, captain: null, viceCaptain: null };
  }
  const hasPlayers = Object.values(emptyPlan).some(gw => gw?.starting?.length > 0);
  assert(!hasPlayers, 'initEmptyPlan squads have no players (build mode starts clean)');
  assert(Object.keys(emptyPlan).length === MAX_GAMEWEEK, `plan has entries for all ${MAX_GAMEWEEK} GWs`);
}

console.log('\n== Season start: GW1 context — correct bootstrap planning GW ==');
{
  const events = [{ id: 1, is_next: true, is_current: false, finished: false }];
  const planningGW = getBootstrapPlanningGW(events, 1);
  assert(planningGW === 1, 'planning GW is GW1 at season start');
}

console.log('\n== Season start: GW2 context (GW1 just closed) — heuristic still applies ==');
{
  // GW1 deadline just passed; bootstrap may still show GW1 as is_current before
  // is_next is set.  Planning GW = 2.  A legacy save at GW38 should still be discarded.
  const events = [{ id: 1, is_current: true, is_next: false, finished: false }];
  const bootstrapPlanningGW = getBootstrapPlanningGW(events, 1);
  assert(bootstrapPlanningGW === 2, 'planning GW is 2 immediately after GW1 deadline');

  const result = simulateStateRestore(staleLegacySavedState, newSeasonMarker, bootstrapPlanningGW);
  assert(result?.discarded === true, 'stale GW38 state discarded at GW2 bootstrap');
  assert(result?.reason === 'likelyStale', 'discarded via heuristic (bootstrapPlanningGW=2 ≤ threshold)');
}

// ── Results ──────────────────────────────────────────────────────────────────

console.log('\n==================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}
