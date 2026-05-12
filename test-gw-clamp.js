// test-gw-clamp.js
// Tests for the GW clamping logic that prevents stale localStorage from
// dragging the app back to an older gameweek on startup.
//
// Bug: main.js restored state.viewingGW directly from localStorage without
// checking whether the saved GW was behind the bootstrap-derived planning GW.
// Users who had saved state from GW32 would see GW32 on load during GW33.
//
// Run with: node test-gw-clamp.js

// ── Helpers (mirror production clamping logic) ──────────────────────────────

/**
 * Derives the planning GW from bootstrap events (mirrors data.js getBootstrapPlanningGW).
 *
 * Priority:
 *  1. is_next  – FPL API explicitly marks the upcoming transfer-window GW.
 *  2. is_current + 1 – deadline has passed; the transfer window is for the
 *     next GW.  Cap at MAX_GAMEWEEK (38) to avoid overflowing past GW38.
 *  3. currentGW fallback, then 1.
 */
const MAX_GAMEWEEK = 38;

function getBootstrapPlanningGW(events, currentGW) {
  const next = events.find(e => e.is_next)?.id;
  const current = events.find(e => e.is_current)?.id;
  if (next) return next;
  if (current) return Math.min(current + 1, MAX_GAMEWEEK);
  return currentGW || 1;
}

/**
 * Simulates the clamping logic applied in main.js after localStorage restore.
 * Returns the clamped state values.
 */
function clampRestoredState(savedViewingGW, savedMinNavigableGW, bootstrapPlanningGW) {
  let viewingGW = savedViewingGW;
  let minNavigableGW = savedMinNavigableGW ?? savedViewingGW;

  if (viewingGW < bootstrapPlanningGW) {
    viewingGW = bootstrapPlanningGW;
  }
  if (minNavigableGW < bootstrapPlanningGW) {
    minNavigableGW = bootstrapPlanningGW;
  }
  return { viewingGW, minNavigableGW };
}

/**
 * Simulates the import planning GW derivation from ui-init.js importTeam().
 */
function getImportPlanningGW(stateViewingGW, events, currentGW) {
  const freshPlanningGW = getBootstrapPlanningGW(events, currentGW);
  return freshPlanningGW;
}

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log('== GW Clamping: stale viewingGW gets clamped forward ==');

{
  // Scenario: saved GW32, bootstrap says GW33 is next
  const events = [
    { id: 32, is_current: true, is_next: false, finished: false },
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 32);
  assert(planningGW === 33, 'Bootstrap planning GW = 33 (is_next)');

  const result = clampRestoredState(32, 32, planningGW);
  assert(result.viewingGW === 33, 'viewingGW clamped from 32 to 33');
  assert(result.minNavigableGW === 33, 'minNavigableGW clamped from 32 to 33');
}

console.log('\n== GW Clamping: already-current viewingGW is not changed ==');

{
  const events = [
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 32);
  assert(planningGW === 33, 'Bootstrap planning GW = 33');

  const result = clampRestoredState(33, 33, planningGW);
  assert(result.viewingGW === 33, 'viewingGW stays at 33');
  assert(result.minNavigableGW === 33, 'minNavigableGW stays at 33');
}

console.log('\n== GW Clamping: future viewingGW is preserved ==');

{
  // User was viewing GW35 while bootstrap says GW33
  const events = [
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 32);
  const result = clampRestoredState(35, 33, planningGW);
  assert(result.viewingGW === 35, 'viewingGW 35 preserved (ahead of bootstrap)');
  assert(result.minNavigableGW === 33, 'minNavigableGW stays at 33 (already >= planning)');
}

console.log('\n== GW Clamping: only is_current, no is_next ==');

{
  // After a GW's deadline passes the FPL API sets is_current for the live GW
  // but may not yet have is_next for the following GW.  The planning/viewing
  // GW must advance to is_current + 1 (the open transfer-window GW).
  const events = [
    { id: 32, is_current: true, is_next: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 32);
  assert(planningGW === 33, 'Bootstrap planning GW = 33 (is_current + 1, transfer window is open for next GW)');

  const result = clampRestoredState(31, 31, planningGW);
  assert(result.viewingGW === 33, 'viewingGW clamped from 31 to 33');
}

console.log('\n== GW Clamping: no events (empty bootstrap) ==');

{
  const events = [];
  const planningGW = getBootstrapPlanningGW(events, 5);
  assert(planningGW === 5, 'Falls back to currentGW=5');

  const result = clampRestoredState(3, 3, planningGW);
  assert(result.viewingGW === 5, 'viewingGW clamped from 3 to 5');
}

console.log('\n== GW Clamping: missing minNavigableGW in saved state ==');

{
  const events = [
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 32);
  // Simulate old saved state that didn't have minNavigableGW
  const result = clampRestoredState(31, undefined, planningGW);
  assert(result.viewingGW === 33, 'viewingGW clamped from 31 to 33');
  assert(result.minNavigableGW === 33, 'minNavigableGW defaults from viewingGW=31, clamped to 33');
}

console.log('\n== Import: fresh planning GW overrides stale viewingGW ==');

{
  const events = [
    { id: 32, is_current: true, is_next: false, finished: false },
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  // Even if state.viewingGW is stale at 31
  const importGW = getImportPlanningGW(31, events, 32);
  assert(importGW === 33, 'Import targets GW33, not stale GW31');
}

console.log('\n== Import: viewingGW already correct ==');

{
  const events = [
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const importGW = getImportPlanningGW(33, events, 32);
  assert(importGW === 33, 'Import targets GW33 when viewingGW is already 33');
}

console.log('\n== Import: viewingGW ahead of bootstrap is reset to fresh planning GW ==');

{
  const events = [
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const importGW = getImportPlanningGW(35, events, 32);
  assert(importGW === 33, 'Import targets GW33 even when viewingGW is ahead');
}

console.log('\n== Import: repeated imports while user is on future GW stay on fresh planning GW ==');

{
  const events = [
    { id: 37, is_next: true, is_current: false, finished: false },
  ];

  // First import at the correct GW
  const firstImportGW = getImportPlanningGW(37, events, 36);
  assert(firstImportGW === 37, 'First import targets GW37');

  // User navigates to GW38, then imports again
  const secondImportGW = getImportPlanningGW(38, events, 36);
  assert(secondImportGW === 37, 'Second import resets back to GW37');

  // Repeated imports continue targeting the authoritative GW
  const thirdImportGW = getImportPlanningGW(38, events, 36);
  assert(thirdImportGW === 37, 'Repeated imports continue targeting GW37');
}

// ── Results ─────────────────────────────────────────────────────────────────

console.log('\n== GW38 edge case: is_current=38, no is_next (final GW) ==');

{
  // GW38 is the last gameweek – there is no GW39.  The cap at MAX_GAMEWEEK
  // must prevent the planning GW from advancing past 38.
  const events = [
    { id: 38, is_current: true, is_next: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 38);
  assert(planningGW === 38, 'GW38 planning GW stays at 38 (no GW39 exists)');
}

console.log('\n== Real-world: GW35 deadline passed, GW35 games ongoing, is_next not yet set ==');

{
  // GW35 deadline passed Friday evening; FPL API shows is_current=35 but
  // is_next=36 has not been set yet.  Header must show GW36 (transfer window).
  const events = [
    { id: 35, is_current: true, is_next: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 35);
  assert(planningGW === 36, 'GW35 live with no is_next → planning GW = 36 (transfer window)');
}

console.log('\n== Real-world: GW35 deadline passed, is_next=36 set by FPL API ==');

{
  // Normal mid-season case: FPL API sets both is_current and is_next.
  const events = [
    { id: 35, is_current: true, is_next: false, finished: false },
    { id: 36, is_current: false, is_next: true, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 35);
  assert(planningGW === 36, 'is_next=36 takes priority → planning GW = 36');
}


console.log('\n==================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}
