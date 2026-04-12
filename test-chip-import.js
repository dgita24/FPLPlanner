// test-chip-import.js
// Regression tests for chip state on fresh import vs saved draft re-import.
//
// Bug: fresh import was auto-marking historically used chips from the FPL API
// history, causing all chips to appear pre-ticked. Expected: fresh import
// should initialise chip state as clean (all unticked).
//
// Run with: node test-chip-import.js

const CHIP_TYPES = ['wildcard', 'freehit', 'bboost', '3xc'];

// ── Minimal mock of state ───────────────────────────────────────────────────

function createState() {
  return {
    currentGW: 30,
    viewingGW: 31,
    minNavigableGW: 31,
    plan: {},
    freeTransfersByGW: {},
    historicallyUsedChips: {},
  };
}

function initEmptyPlan(state) {
  state.plan = {};
  state.freeTransfersByGW = {};
  state.historicallyUsedChips = {};
  for (let gw = state.currentGW; gw <= 38; gw++) {
    state.plan[gw] = { starting: [], bench: [], chip: null, captain: null, viceCaptain: null };
    state.freeTransfersByGW[gw] = 1;
  }
  for (const chip of CHIP_TYPES) state.historicallyUsedChips[chip] = false;
}

function resetChipUsageState(state) {
  for (const chip of CHIP_TYPES) {
    state.historicallyUsedChips[chip] = false;
  }
  for (let gw = state.currentGW; gw <= 38; gw++) {
    if (!state.plan[gw]) continue;
    state.plan[gw].chip = null;
  }
}

function ensureHistoricallyUsedChips(state) {
  if (!state.historicallyUsedChips || typeof state.historicallyUsedChips !== 'object') {
    state.historicallyUsedChips = {};
  }
  for (const chip of CHIP_TYPES) {
    state.historicallyUsedChips[chip] = !!state.historicallyUsedChips[chip];
  }
}

// ── Simulate fresh import logic (AFTER fix) ─────────────────────────────────

function simulateFreshImport(state, apiChips) {
  // Mirrors loadTeamEntry flow after fix:
  // 1. Reset chip state
  resetChipUsageState(state);

  // 2. Simulate FT result with chip history from API
  const ftResult = { nextGWft: 2, chips: apiChips };

  // 3. Seed FT (this still happens)
  state.freeTransfersByGW[state.viewingGW] = ftResult.nextGWft;

  // 4. FIXED: we intentionally do NOT auto-mark historically used chips here.
  //    (The removed code was:)
  //    for (const c of (ftResult.chips || [])) {
  //      if (CHIP_TYPES.includes(c.name)) {
  //        state.historicallyUsedChips[c.name] = true;
  //      }
  //    }

  ensureHistoricallyUsedChips(state);
}

// ── Simulate saved draft re-import ──────────────────────────────────────────

function simulateSavedDraftLoad(state, savedPayload) {
  // Mirrors loadTeam cloud / localLoad flow
  state.plan = savedPayload.plan;
  state.historicallyUsedChips = savedPayload.historicallyUsedChips || {};
  ensureHistoricallyUsedChips(state);
}

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

// Test 1: Fresh import with manager who has used wildcard + bboost → all unticked
console.log('\nTest 1: Fresh import – chips should be unticked regardless of API history');
{
  const state = createState();
  initEmptyPlan(state);

  const apiChips = [
    { name: 'wildcard', event: 5 },
    { name: 'bboost', event: 12 },
  ];

  simulateFreshImport(state, apiChips);

  assert(state.historicallyUsedChips.wildcard === false, 'wildcard unticked after fresh import');
  assert(state.historicallyUsedChips.freehit === false, 'freehit unticked after fresh import');
  assert(state.historicallyUsedChips.bboost === false, 'bboost unticked after fresh import');
  assert(state.historicallyUsedChips['3xc'] === false, '3xc unticked after fresh import');
}

// Test 2: Fresh import with manager who has used all chips → all unticked
console.log('\nTest 2: Fresh import – all 4 chips used in API history → still all unticked');
{
  const state = createState();
  initEmptyPlan(state);

  const apiChips = [
    { name: 'wildcard', event: 3 },
    { name: 'freehit', event: 10 },
    { name: 'bboost', event: 15 },
    { name: '3xc', event: 20 },
  ];

  simulateFreshImport(state, apiChips);

  for (const chip of CHIP_TYPES) {
    assert(state.historicallyUsedChips[chip] === false, `${chip} unticked after fresh import`);
  }
}

// Test 3: Fresh import with no chip history → all unticked
console.log('\nTest 3: Fresh import – no chip history → all unticked');
{
  const state = createState();
  initEmptyPlan(state);

  simulateFreshImport(state, []);

  for (const chip of CHIP_TYPES) {
    assert(state.historicallyUsedChips[chip] === false, `${chip} unticked after fresh import (no history)`);
  }
}

// Test 4: Saved draft re-import with some chips ticked → those chips restored
console.log('\nTest 4: Saved draft re-import – preserves ticked chip state');
{
  const state = createState();
  initEmptyPlan(state);

  const savedPayload = {
    plan: state.plan,
    historicallyUsedChips: {
      wildcard: true,
      freehit: false,
      bboost: true,
      '3xc': false,
    },
  };

  simulateSavedDraftLoad(state, savedPayload);

  assert(state.historicallyUsedChips.wildcard === true, 'wildcard restored as ticked from saved draft');
  assert(state.historicallyUsedChips.freehit === false, 'freehit restored as unticked from saved draft');
  assert(state.historicallyUsedChips.bboost === true, 'bboost restored as ticked from saved draft');
  assert(state.historicallyUsedChips['3xc'] === false, '3xc restored as unticked from saved draft');
}

// Test 5: Saved draft with no chip state → defaults to all unticked
console.log('\nTest 5: Saved draft with missing chip state → defaults to all unticked');
{
  const state = createState();
  initEmptyPlan(state);

  const savedPayload = {
    plan: state.plan,
    // no historicallyUsedChips key
  };

  simulateSavedDraftLoad(state, savedPayload);

  for (const chip of CHIP_TYPES) {
    assert(state.historicallyUsedChips[chip] === false, `${chip} defaults to unticked when draft has no chip state`);
  }
}

// Test 6: FT seeding still works after fix
console.log('\nTest 6: FT seeding still works after chip fix');
{
  const state = createState();
  initEmptyPlan(state);

  simulateFreshImport(state, [{ name: 'wildcard', event: 5 }]);

  assert(state.freeTransfersByGW[state.viewingGW] === 2, 'FT correctly seeded from API history');
}

// Test 7: Plan chip fields are null after fresh import
console.log('\nTest 7: Plan chip fields are null after fresh import');
{
  const state = createState();
  initEmptyPlan(state);
  // Manually set a chip on a GW to verify resetChipUsageState clears it
  state.plan[31].chip = 'wildcard';

  simulateFreshImport(state, [{ name: 'wildcard', event: 5 }]);

  for (let gw = state.currentGW; gw <= 38; gw++) {
    assert(state.plan[gw].chip === null, `plan[${gw}].chip is null after fresh import`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAIL');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
  process.exit(0);
}
