// test-ft-seeding.js
// Regression tests for free-transfer seeding on import, especially when
// import falls back to an older GW than the planning GW.
//
// Bug: loadTeamEntry() always seeded freeTransfersByGW[planningGW] with
// ftResult.nextGWft. When history extended beyond the imported picks GW,
// nextGWft could correspond to a GW *after* planningGW, producing an
// incorrect FT count.  The fix uses perGW[planningGW] when available.
//
// Run with: node test-ft-seeding.js

// ── Helpers (mirror production logic) ────────────────────────────────────────

function normalizeFreeTransfersValue(value) {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.max(0, Math.min(5, n));
}

/**
 * Mirrors computeFreeTransfersFromHistory in data.js.
 */
function computeFreeTransfersFromHistory(historyData) {
  if (!historyData?.current?.length) return null;

  const events = [...historyData.current].sort((a, b) => a.event - b.event);
  const chipMap = {};
  for (const c of (historyData.chips || [])) {
    chipMap[c.event] = c.name;
  }

  let ft = 1;
  const perGW = {};

  for (const ev of events) {
    perGW[ev.event] = ft;
    const chip = chipMap[ev.event];
    const transfers = ev.event_transfers || 0;

    if (chip === 'wildcard') {
      ft = 1;
    } else if (chip === 'freehit') {
      ft = Math.min(5, ft + 1);
    } else {
      ft = Math.min(5, Math.max(0, ft - transfers) + 1);
    }
  }

  return { perGW, nextGWft: ft, chips: historyData.chips || [] };
}

/**
 * Mirrors the fixed FT-seeding logic from loadTeamEntry.
 * Returns the FT value that would be seeded for planningGW.
 */
function computeSeedFT(ftResult, planningGW) {
  if (!ftResult) return 1;
  const seedFT = (ftResult.perGW[planningGW] !== undefined)
    ? ftResult.perGW[planningGW]
    : ftResult.nextGWft;
  return normalizeFreeTransfersValue(seedFT);
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

// ── Test 1: No fallback – planningGW is the next unplayed GW ────────────────
console.log('\nTest 1: No fallback – planningGW is next unplayed GW (uses nextGWft)');
{
  // History through GW32, planning from GW33, picks available for GW33.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 1 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31 starts with ft=1 (default), after 0 transfers: ft = min(5, max(0,1-0)+1) = 2
  // GW32 starts with ft=2, after 1 transfer: ft = min(5, max(0,2-1)+1) = 2
  // nextGWft = 2 (for GW33)
  // perGW[33] is undefined → should use nextGWft
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 for GW33 (nextGWft used, perGW[33] absent)`);
}

// ── Test 2: Fallback – history extends beyond importedGW ────────────────────
console.log('\nTest 2: Fallback – history includes planningGW, uses perGW[planningGW]');
{
  // History through GW33 (is_current), but picks fell back to GW32.
  // Planning GW = 33.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 1 },
      { event: 33, event_transfers: 2 },  // GW33 current, transfers already made
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 1 transfer  → ft=2
  // GW33: ft=2, 2 transfers → ft=min(5, max(0,2-2)+1)=1
  // nextGWft = 1 (for GW34!)
  // perGW[33] = 2 (FTs at start of GW33)
  //
  // OLD CODE would seed GW33 with nextGWft=1 (WRONG – that's GW34's FT).
  // FIXED CODE uses perGW[33]=2 (CORRECT – FTs available at start of GW33).
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 for GW33 (perGW[33] used, not nextGWft=1)`);
}

// ── Test 3: Fallback with wildcard in current GW ────────────────────────────
console.log('\nTest 3: Fallback – wildcard used in planningGW, perGW still used');
{
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 5 },
    ],
    chips: [{ name: 'wildcard', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 0 transfers → ft=3
  // GW33: ft=3, wildcard → ft=1 (reset)
  // nextGWft = 1 (for GW34)
  // perGW[33] = 3
  //
  // The user's GW32 squad is imported. At GW33 they had 3 FTs available
  // before the wildcard.  The planner should show 3 FTs for GW33.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 3, `FT seeded as 3 for GW33 (perGW used, wildcard reset is for GW34)`);
}

// ── Test 4: No history at all – defaults to 1 ──────────────────────────────
console.log('\nTest 4: No history – defaults to 1 FT');
{
  const ftResult = computeFreeTransfersFromHistory({ current: [] });
  const seedFT = computeSeedFT(ftResult, 33);
  assert(seedFT === 1, `FT defaults to 1 when no history`);
}

// ── Test 5: FT cap at 5 ────────────────────────────────────────────────────
console.log('\nTest 5: FT capped at 5');
{
  // Many GWs with 0 transfers → FTs accumulate to 5.
  const historyData = {
    current: [
      { event: 25, event_transfers: 0 },
      { event: 26, event_transfers: 0 },
      { event: 27, event_transfers: 0 },
      { event: 28, event_transfers: 0 },
      { event: 29, event_transfers: 0 },
      { event: 30, event_transfers: 0 },
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // After enough 0-transfer GWs, FTs cap at 5. nextGWft=5, perGW[33] absent.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 5, `FT capped at 5`);
}

// ── Test 6: Verify old code would have been wrong in fallback scenario ──────
console.log('\nTest 6: Verify old logic (nextGWft always) gives wrong result in fallback');
{
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 3 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 0 transfers → ft=3
  // GW33: ft=3, 3 transfers → ft=min(5, max(0,3-3)+1) = 1
  // nextGWft = 1 (for GW34)
  // perGW[33] = 3

  // Old code: seed = nextGWft = 1 (WRONG for GW33)
  const oldSeed = normalizeFreeTransfersValue(ftResult.nextGWft);
  assert(oldSeed === 1, `Old logic would seed 1 (nextGWft for GW34, not GW33)`);

  // New code: seed = perGW[33] = 3 (CORRECT for GW33)
  const newSeed = computeSeedFT(ftResult, planningGW);
  assert(newSeed === 3, `New logic seeds 3 (perGW[33], correct for planning GW33)`);

  assert(oldSeed !== newSeed, `Old and new differ in fallback scenario – bug was real`);
}

// ── Test 7: planningGW matches last history GW (no fallback, perGW used) ────
console.log('\nTest 7: planningGW matches last history GW (perGW available, used correctly)');
{
  const historyData = {
    current: [
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 0 },
    ],
    chips: [],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);
  const planningGW = 33;

  // GW32: ft=1, 0 transfers → ft=2
  // GW33: ft=2, 0 transfers → ft=3
  // nextGWft = 3 (for GW34)
  // perGW[33] = 2

  // Even when "no fallback" in picks, if GW33 is in history, we use perGW.
  const seedFT = computeSeedFT(ftResult, planningGW);
  assert(seedFT === 2, `FT seeded as 2 from perGW[33], even though nextGWft=3`);
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
