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
 * Derives the planning GW from bootstrap events (mirrors main.js + ui-init.js).
 */
function getBootstrapPlanningGW(events, currentGW) {
  const next = events.find(e => e.is_next)?.id;
  const current = events.find(e => e.is_current)?.id;
  return next || current || currentGW || 1;
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
  return Math.max(stateViewingGW, freshPlanningGW);
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
  // During a live gameweek, is_current is set but is_next is not
  const events = [
    { id: 32, is_current: true, is_next: false, finished: false },
  ];
  const planningGW = getBootstrapPlanningGW(events, 32);
  assert(planningGW === 32, 'Bootstrap planning GW = 32 (is_current fallback)');

  const result = clampRestoredState(31, 31, planningGW);
  assert(result.viewingGW === 32, 'viewingGW clamped from 31 to 32');
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

console.log('\n== Import: viewingGW ahead of bootstrap is preserved ==');

{
  const events = [
    { id: 33, is_next: true, is_current: false, finished: false },
  ];
  const importGW = getImportPlanningGW(35, events, 32);
  assert(importGW === 35, 'Import targets GW35 when viewingGW is ahead of bootstrap');
}

// ── Results ─────────────────────────────────────────────────────────────────

console.log('\n==================================================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('ALL TESTS PASSED');
} else {
  console.error('SOME TESTS FAILED');
  process.exit(1);
}
