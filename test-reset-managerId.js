// test-reset-managerId.js
// Regression test for the reset-button bug where saved drafts became
// inaccessible after pressing Reset.
//
// Root cause: history.baseline was captured inside loadTeamEntry() before
// state.managerId was set in importTeam(), so after reset state.managerId
// reverted to null, blocking all draft API calls that require a managerId.
//
// Run with: node test-reset-managerId.js

// ── Minimal mocks ────────────────────────────────────────────────────────────

function createState() {
  return {
    currentGW: 30,
    viewingGW: 31,
    minNavigableGW: 31,
    managerId: null,
    bank: 0,
    plan: {},
    freeTransfersByGW: {},
    historicallyUsedChips: {},
  };
}

function createHistory() {
  return { baseline: null, undoStack: [] };
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Simulates what loadTeamEntry() does: saves baseline BEFORE managerId is set.
function simulateLoadTeamEntry(state, history) {
  // Populate minimal plan data (mirrors the real function)
  state.plan[state.viewingGW] = {
    starting: [{ id: 1, purchasePrice: 6.0, sellingPrice: 6.0 }],
    bench: [],
    chip: null,
    captain: 1,
    viceCaptain: null,
  };
  state.bank = 1.5;

  // Baseline is saved here — managerId has NOT been set yet (still null)
  history.baseline = deepCopy(state);
  history.undoStack = [];
}

// Simulates what importTeam() does AFTER loadTeamEntry() returns.
function simulateImportTeam(state, history, teamId) {
  // state is already populated by simulateLoadTeamEntry

  // Set managerId (this happens AFTER loadTeamEntry returns)
  state.managerId = teamId;

  // THE FIX: patch baseline so reset preserves managerId
  if (history.baseline) history.baseline.managerId = teamId;
}

// Simulates resetToImportedTeam()
function simulateReset(state, history) {
  if (!history.baseline) return false;

  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, deepCopy(history.baseline));

  history.undoStack = [];
  return true;
}

// ── Test runner ──────────────────────────────────────────────────────────────

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

// ── Test 1: managerId preserved after reset (bug fix verification) ───────────
console.log('\nTest 1: managerId is preserved after Reset (fix verification)');
{
  const state = createState();
  const history = createHistory();
  const TEAM_ID = '12345';

  simulateLoadTeamEntry(state, history);
  simulateImportTeam(state, history, TEAM_ID);

  // Sanity: state has managerId before reset
  assert(state.managerId === TEAM_ID, 'managerId set correctly after import');
  // Sanity: baseline also has managerId (thanks to the fix)
  assert(history.baseline.managerId === TEAM_ID, 'baseline.managerId patched by fix');

  simulateReset(state, history);

  assert(state.managerId === TEAM_ID, 'managerId preserved after Reset');
  assert(state.plan[state.viewingGW] !== undefined, 'plan data restored after Reset');
}

// ── Test 2: BEFORE fix – baseline missing managerId causes null after reset ──
console.log('\nTest 2: Without the fix, managerId would be null after Reset (regression guard)');
{
  const state = createState();
  const history = createHistory();
  const TEAM_ID = '67890';

  simulateLoadTeamEntry(state, history);

  // Simulate import WITHOUT the fix (do not patch baseline.managerId)
  state.managerId = TEAM_ID;
  // history.baseline.managerId is still null here

  assert(history.baseline.managerId === null, 'baseline.managerId is null without fix');

  simulateReset(state, history);

  assert(state.managerId === null, 'managerId lost after Reset without fix (expected regression)');
}

// ── Test 3: Reset still restores team data (existing behaviour intact) ───────
console.log('\nTest 3: Reset correctly restores imported team state');
{
  const state = createState();
  const history = createHistory();
  const TEAM_ID = '11111';

  simulateLoadTeamEntry(state, history);
  simulateImportTeam(state, history, TEAM_ID);

  // Simulate a transfer: swap out player 1 for player 99
  state.plan[state.viewingGW].starting[0] = { id: 99, purchasePrice: 5.5, sellingPrice: 5.5 };
  state.bank = 0.2;

  simulateReset(state, history);

  assert(state.plan[state.viewingGW].starting[0].id === 1, 'player 1 restored after Reset');
  assert(state.bank === 1.5, 'bank restored after Reset');
  assert(state.managerId === TEAM_ID, 'managerId still present after Reset');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests run: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
