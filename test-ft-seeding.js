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
      ft = ft; // FH preserves FTs; no +1 rollover since the chip was "used"
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

// ── Test 8: Free Hit in GW33 – FTs preserved, no +1 rollover ────────────────
console.log('\nTest 8: Free Hit in GW33 – FTs preserved, no +1 rollover');
{
  // Manager had 3 FTs going into GW33, played FH → should still have 3 FTs for GW34.
  const historyData = {
    current: [
      { event: 31, event_transfers: 0 },
      { event: 32, event_transfers: 0 },
      { event: 33, event_transfers: 15 }, // FH: unlimited transfers, ignored
    ],
    chips: [{ name: 'freehit', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);

  // GW31: ft=1, 0 transfers → ft=2
  // GW32: ft=2, 0 transfers → ft=3
  // GW33: ft=3, freehit → ft=3 (preserved, no +1)
  // nextGWft = 3 (for GW34)
  assert(ftResult.nextGWft === 3, `FH preserves 3 FTs → nextGWft=3 for GW34`);
}

// ── Test 9: Free Hit with only 1 FT – still preserved (not +1) ──────────────
console.log('\nTest 9: Free Hit with 1 FT – FT count stays at 1, not bumped to 2');
{
  // Manager had 1 FT going into GW33 (used 2 transfers in GW32), played FH.
  const historyData = {
    current: [
      { event: 32, event_transfers: 2 }, // 2 transfers → FT goes to 0, then +1 = 1? No: max(0, 1-2)+1=1
      { event: 33, event_transfers: 15 },
    ],
    chips: [{ name: 'freehit', event: 33 }],
  };
  const ftResult = computeFreeTransfersFromHistory(historyData);

  // GW32: ft=1, 2 transfers → ft=min(5, max(0,1-2)+1)=min(5,0+1)=1
  // GW33: ft=1, freehit → ft=1 (preserved)
  // nextGWft = 1
  assert(ftResult.nextGWft === 1, `FH with 1 FT → nextGWft=1 (not bumped to 2)`);
}

// ── Helper that mirrors the new direct FT seeding in loadTeamEntry ───────────

/**
 * Mirrors the new FT seeding logic that uses entry_history.extra_free_transfers
 * directly from the picks response.
 */
function seedFTFromPicks(extraFT, eventTransfers, importedChip, importedGW, planningGW) {
  function norm(v) { return normalizeFreeTransfersValue(v); }
  if (typeof extraFT !== 'number') return null; // no seeding
  let seedFT = extraFT;
  if (importedGW < planningGW) {
    if (importedChip === 'wildcard') {
      seedFT = 1; // WC resets FT to 1 for the following GW
    } else {
      seedFT = Math.min(5, Math.max(0, seedFT - (eventTransfers || 0)) + 1);
    }
    for (let g = importedGW + 1; g < planningGW; g++) {
      seedFT = Math.min(5, seedFT + 1);
    }
  }
  return norm(seedFT);
}

// ── Tests: direct extra_free_transfers seeding ───────────────────────────────

console.log('\nTest 10: importedGW == planningGW — extra_free_transfers used directly');
{
  // importedGW=36 IS the planningGW (e.g. is_next=36): FTs for GW36 = 2 directly.
  const seed = seedFTFromPicks(2, 0, null, 36, 36);
  assert(seed === 2, `extraFT=2, importedGW==planningGW=36 → seed=2 directly ✓`);
}

console.log('\nTest 11: importedGW < planningGW, 0 real transfers → rollover +1');
{
  // importedGW=35 (is_current), planningGW=36.
  // extraFT=2 (had 2 FTs for GW35), 0 event_transfers.
  // FT for GW36 = min(5, max(0, 2-0)+1) = 3.
  const seed = seedFTFromPicks(2, 0, null, 35, 36);
  assert(seed === 3, `extraFT=2, 0 event_transfers, importedGW=35→36: seed=3 ✓`);
}

console.log('\nTest 12: importedGW < planningGW, 1 real transfer → rollover');
{
  // importedGW=35, planningGW=36.
  // extraFT=2 (had 2 FTs for GW35), 1 event_transfer made.
  // FT for GW36 = min(5, max(0, 2-1)+1) = 2.
  const seed = seedFTFromPicks(2, 1, null, 35, 36);
  assert(seed === 2, `extraFT=2, 1 event_transfer, importedGW=35→36: seed=2 ✓`);
}

console.log('\nTest 13: importedGW < planningGW, 1 FT, 1 transfer → rollover gives 1');
{
  // importedGW=35, planningGW=36.
  // extraFT=1 (had 1 FT for GW35), 1 event_transfer made.
  // FT for GW36 = min(5, max(0, 1-1)+1) = 1.
  const seed = seedFTFromPicks(1, 1, null, 35, 36);
  assert(seed === 1, `extraFT=1, 1 event_transfer, importedGW=35→36: seed=1 ✓`);
}

console.log('\nTest 14: WC in importedGW → FT resets to 1 for planningGW');
{
  // importedGW=35 used WC, planningGW=36.
  // Regardless of extraFT, WC resets next GW FT to 1.
  const seed = seedFTFromPicks(3, 8, 'wildcard', 35, 36);
  assert(seed === 1, `WC in importedGW=35, planningGW=36: seed=1 (WC reset) ✓`);
}

console.log('\nTest 15: API lag — importedGW=34, planningGW=36, 2 gap GWs');
{
  // Picks fell back to GW34 (2 GWs behind planningGW=36).
  // extraFT=1 for GW34, 1 event_transfer in GW34.
  // Step GW34→GW35: min(5, max(0,1-1)+1) = 1
  // Step GW35→GW36: min(5, 1+1) = 2
  const seed = seedFTFromPicks(1, 1, null, 34, 36);
  assert(seed === 2, `extraFT=1 at GW34, importedGW=34→planningGW=36: seed=2 ✓`);
}

console.log('\nTest 16: FT cap at 5');
{
  // extraFT=4, 0 transfers, importedGW=35, planningGW=36 → would be 5.
  const seed = seedFTFromPicks(4, 0, null, 35, 36);
  assert(seed === 5, `extraFT=4, 0 transfers, rollover → capped at 5 ✓`);
}

console.log('\nTest 17: extraFT missing → no seeding (null returned)');
{
  // If API doesn't return extra_free_transfers, seeding is skipped (defaults to 1).
  const seed = seedFTFromPicks(undefined, 0, null, 35, 36);
  assert(seed === null, `extraFT=undefined → null (no seeding, default 1 FT applies) ✓`);
}

console.log('\nTest 18: user-reported scenario — had 1 FT for GW36, should see 1');
{
  // importedGW=36 == planningGW=36.
  // API returns extra_free_transfers=1 for GW36.  Should seed 1 directly.
  const seed = seedFTFromPicks(1, 0, null, 36, 36);
  assert(seed === 1, `extraFT=1 for planningGW=36 → seed=1 directly ✓`);
}

console.log('\nTest 19: user-reported scenario — had 2 FTs for GW36, should see 2');
{
  // importedGW=36 == planningGW=36.
  // API returns extra_free_transfers=2 for GW36.  Should seed 2 directly.
  const seed = seedFTFromPicks(2, 0, null, 36, 36);
  assert(seed === 2, `extraFT=2 for planningGW=36 → seed=2 directly ✓`);
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
