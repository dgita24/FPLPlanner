// test-wc-transfer-propagation.js
// Regression tests for the WC transfer propagation bug.
//
// Scenario: user picks WC team in GW35, navigates to GW36 and organises
// starters/subs (including substituting the newly-bought player to bench),
// then goes back to GW35 and swaps the transfer for a different player.
// GW36 must still have exactly 15 players with the replacement present.
//
// Also tests Bug 2: block buying player already in a future planned GW.
//
// Run with: node test-wc-transfer-propagation.js

// ── Minimal mocks mirroring data.js / validation.js / team-operations.js ────

let mockElements = [];

function getElementType(playerId) {
  const p = mockElements.find(e => e.id === playerId);
  return p?.element_type ?? null;
}

function getPlayerTeamId(playerId) {
  const p = mockElements.find(e => e.id === playerId);
  return p?.team ?? null;
}

function validateStartingXI(team) {
  if (!team || !Array.isArray(team.starting)) return { ok: false, message: 'missing starting XI' };
  // Only validate formation when starting XI is complete; skip for in-progress squads
  // (mirrors production validateStartingXI in validation.js)
  if (team.starting.length !== 11) return { ok: true, message: '' };
  let gk = 0, def = 0, mid = 0, fwd = 0;
  for (const e of team.starting) {
    const et = getElementType(e.id);
    if (et === 1) gk++;
    else if (et === 2) def++;
    else if (et === 3) mid++;
    else if (et === 4) fwd++;
  }
  if (gk !== 1) return { ok: false, message: 'must have exactly 1 GK' };
  if (def < 3) return { ok: false, message: 'at least 3 DEF' };
  if (mid < 2) return { ok: false, message: 'at least 2 MID' };
  if (fwd < 1) return { ok: false, message: 'at least 1 FWD' };
  return { ok: true, message: '' };
}

function validatePositionLimits(team) {
  if (!team) return { ok: false, message: 'missing team' };
  const all = [...(team.starting || []), ...(team.bench || [])];
  let gk = 0, def = 0, mid = 0, fwd = 0;
  for (const e of all) {
    const et = getElementType(e.id);
    if (et === 1) gk++;
    else if (et === 2) def++;
    else if (et === 3) mid++;
    else if (et === 4) fwd++;
  }
  if (gk > 2) return { ok: false, message: 'max 2 GK' };
  if (def > 5) return { ok: false, message: 'max 5 DEF' };
  if (mid > 5) return { ok: false, message: 'max 5 MID' };
  if (fwd > 3) return { ok: false, message: 'max 3 FWD' };
  return { ok: true, message: '' };
}

function validateSquadComposition(team) {
  if (!team) return { ok: false, message: 'missing team' };
  const all = [...(team.starting || []), ...(team.bench || [])];
  // Only validate composition when squad is complete (15); skip during partial build
  // (mirrors production validateSquadComposition in validation.js)
  if (all.length !== 15) return { ok: true, message: '' };
  let gk = 0, def = 0, mid = 0, fwd = 0;
  for (const e of all) {
    const et = getElementType(e.id);
    if (et === 1) gk++;
    else if (et === 2) def++;
    else if (et === 3) mid++;
    else if (et === 4) fwd++;
  }
  if (gk !== 2) return { ok: false, message: 'must have 2 GK' };
  if (def !== 5) return { ok: false, message: 'must have 5 DEF' };
  if (mid !== 5) return { ok: false, message: 'must have 5 MID' };
  if (fwd !== 3) return { ok: false, message: 'must have 3 FWD' };
  return { ok: true, message: '' };
}

function validateClubLimit(team) {
  if (!team) return { ok: true, message: '' };
  const counts = new Map();
  const all = [...(team.starting || []), ...(team.bench || [])];
  for (const e of all) {
    const tid = getPlayerTeamId(e.id);
    if (tid == null) continue;
    counts.set(tid, (counts.get(tid) || 0) + 1);
  }
  for (const [, c] of counts.entries()) {
    if (c > 3) return { ok: false, message: 'max 3 per club' };
  }
  return { ok: true, message: '' };
}

// ── Simulate the addSinglePlayerToSquad logic (mirrors team-operations.js) ──
// Includes the Bug-1 fix: fallback to opposite side when target side is full.
// Includes the Bug-2 fix: block transfer if player already in a future GW.

function simulateAddSinglePlayer(playerId, plan, gw, batchRemovedPlayers, bank) {
  const p = mockElements.find(e => e.id === playerId);
  if (!p) return { success: false, reason: 'Player data not found' };

  const team = plan[gw];

  // Current-GW duplicate check
  const already =
    team.starting.some(e => e.id === playerId) ||
    team.bench.some(e => e.id === playerId);
  if (already) return { success: false, reason: 'Already in your squad' };

  // Future-GW duplicate check (Bug 2 guard)
  for (let g = gw + 1; g <= 38; g++) {
    const ft = plan[g];
    if (!ft) continue;
    const inFuture =
      ft.starting.some(e => e.id === playerId) ||
      ft.bench.some(e => e.id === playerId);
    if (inFuture) return { success: false, reason: `Already in your planned squad for GW${g}` };
  }

  const buy = p.now_cost / 10;
  if (bank < buy) return { success: false, reason: 'Not enough money' };

  const playerElementType = getElementType(playerId);
  const isGKPlayer = playerElementType === 1;

  const startingSlotsForPos = batchRemovedPlayers.filter(
    rp => rp.side === 'starting' && rp.elementType === playerElementType
  ).length;
  const benchSlotsForPos = batchRemovedPlayers.filter(
    rp => rp.side === 'bench' && rp.elementType === playerElementType
  ).length;
  const startingSlotsNeeded = batchRemovedPlayers.filter(rp => rp.side === 'starting').length;
  const benchSlotsNeeded = batchRemovedPlayers.filter(rp => rp.side === 'bench').length;

  const currentStartingCount = team.starting.length;
  const currentBenchCount = team.bench.length;

  let targetSide = null;
  const posMatchStarting = startingSlotsForPos > 0 && currentStartingCount < 11;
  const posMatchBench = benchSlotsForPos > 0 && currentBenchCount < 4;

  if (posMatchStarting && posMatchBench) {
    if (isGKPlayer) {
      const startingHasGK = team.starting.some(e => getElementType(e.id) === 1);
      targetSide = startingHasGK ? 'bench' : 'starting';
    } else {
      targetSide = 'starting';
    }
  } else if (posMatchStarting) {
    if (isGKPlayer) {
      const startingHasGK = team.starting.some(e => getElementType(e.id) === 1);
      targetSide = startingHasGK && posMatchBench ? 'bench' : 'starting';
    } else {
      targetSide = 'starting';
    }
  } else if (posMatchBench) {
    targetSide = 'bench';
  } else {
    const canAddToStarting = currentStartingCount < 11 && startingSlotsNeeded > 0;
    const canAddToBench = currentBenchCount < 4 && benchSlotsNeeded > 0;
    if (!canAddToStarting && !canAddToBench) {
      return { success: false, reason: startingSlotsNeeded > 0 || benchSlotsNeeded > 0 ? 'All available slots are full' : 'No slots to fill' };
    }
    if (canAddToStarting && canAddToBench) {
      if (isGKPlayer) {
        const startingHasGK = team.starting.some(e => getElementType(e.id) === 1);
        targetSide = startingHasGK ? 'bench' : 'starting';
      } else {
        targetSide = 'starting';
      }
    } else if (canAddToStarting) {
      targetSide = 'starting';
    } else {
      targetSide = 'bench';
    }
  }

  const purchasePrice = buy;
  const sellingPrice = purchasePrice;
  const entry = { id: playerId, purchasePrice, sellingPrice };

  // Validate loop (with Bug-1 fix: length-aware placement with fallback)
  for (let g = gw; g <= 38; g++) {
    const t = plan[g];
    if (!t) continue;
    const temp = {
      starting: t.starting.map(x => ({ ...x })),
      bench: t.bench.map(x => ({ ...x })),
    };

    if (targetSide === 'starting') {
      if (temp.starting.length < 11) {
        temp.starting.push({ ...entry });
      } else if (temp.bench.length < 4) {
        if (isGKPlayer) {
          temp.bench.unshift({ ...entry });
        } else {
          const gkIndex = temp.bench.findIndex(e => getElementType(e.id) === 1);
          if (gkIndex === -1) temp.bench.push({ ...entry });
          else temp.bench.splice(gkIndex + 1, 0, { ...entry });
        }
      }
    } else {
      if (temp.bench.length < 4) {
        if (isGKPlayer) {
          temp.bench.unshift({ ...entry });
        } else {
          const gkIndex = temp.bench.findIndex(e => getElementType(e.id) === 1);
          if (gkIndex === -1) temp.bench.push({ ...entry });
          else temp.bench.splice(gkIndex + 1, 0, { ...entry });
        }
      } else if (temp.starting.length < 11) {
        temp.starting.push({ ...entry });
      }
    }

    const clubOk = validateClubLimit(temp);
    if (!clubOk.ok) return { success: false, reason: 'Max 3 players per club' };
    const posOk = validatePositionLimits(temp);
    if (!posOk.ok) return { success: false, reason: posOk.message };
    const squadOk = validateSquadComposition(temp);
    if (!squadOk.ok) return { success: false, reason: squadOk.message };
    const totalPlayers = temp.starting.length + temp.bench.length;
    if (totalPlayers === 15) {
      const v = validateStartingXI(temp);
      if (!v.ok) return { success: false, reason: v.message };
    }
  }

  // Apply loop (with Bug-1 fix: length-aware placement with fallback)
  for (let g = gw; g <= 38; g++) {
    const t = plan[g];
    if (!t) continue;
    const exists = t.starting.some(e => e.id === playerId) || t.bench.some(e => e.id === playerId);
    if (exists) continue;

    if (targetSide === 'starting') {
      if (t.starting.length < 11) {
        t.starting.push({ ...entry });
      } else if (t.bench.length < 4) {
        if (isGKPlayer) {
          t.bench.unshift({ ...entry });
        } else {
          const gkIndex = t.bench.findIndex(e => getElementType(e.id) === 1);
          if (gkIndex === -1) t.bench.push({ ...entry });
          else t.bench.splice(gkIndex + 1, 0, { ...entry });
        }
      }
    } else {
      if (t.bench.length < 4) {
        if (isGKPlayer) {
          t.bench.unshift({ ...entry });
        } else {
          const gkIndex = t.bench.findIndex(e => getElementType(e.id) === 1);
          if (gkIndex === -1) t.bench.push({ ...entry });
          else t.bench.splice(gkIndex + 1, 0, { ...entry });
        }
      } else if (t.starting.length < 11) {
        t.starting.push({ ...entry });
      }
    }
  }

  // Consume the matching slot from the batch list
  let slotIndex = batchRemovedPlayers.findIndex(
    rp => rp.side === targetSide && rp.elementType === playerElementType
  );
  if (slotIndex === -1) {
    slotIndex = batchRemovedPlayers.findIndex(rp => rp.side === targetSide);
  }
  if (slotIndex !== -1) batchRemovedPlayers.splice(slotIndex, 1);

  return { success: true };
}

// Simulate removePlayer: removes player from gw..38 in plan
function simulateRemovePlayer(playerId, plan, gw, batchRemovedPlayers, bank) {
  const team = plan[gw];
  const entry =
    team.starting.find(e => e.id === playerId) ||
    team.bench.find(e => e.id === playerId);
  if (!entry) return bank;

  const actualSource = team.starting.some(e => e.id === playerId) ? 'starting' : 'bench';
  const sell = entry.sellingPrice ?? 5;

  batchRemovedPlayers.push({
    id: playerId,
    side: actualSource,
    sellingPrice: sell,
    elementType: getElementType(playerId),
  });

  for (let g = gw; g <= 38; g++) {
    const t = plan[g];
    if (!t) continue;
    t.starting = t.starting.filter(e => e.id !== playerId);
    t.bench = t.bench.filter(e => e.id !== playerId);
  }

  return Number((bank + sell).toFixed(1));
}

// Simulate substitutePlayer (swap) applied from gwFrom forwards
function simulateSwapForwardFrom(plan, gwFrom, aId, bId) {
  for (let g = gwFrom; g <= 38; g++) {
    const t = plan[g];
    if (!t) continue;
    const aStart = t.starting.findIndex(e => e.id === aId);
    const aBench = t.bench.findIndex(e => e.id === aId);
    const bStart = t.starting.findIndex(e => e.id === bId);
    const bBench = t.bench.findIndex(e => e.id === bId);
    if (aStart !== -1 && bBench !== -1) {
      const tmp = t.starting[aStart];
      t.starting[aStart] = t.bench[bBench];
      t.bench[bBench] = tmp;
    } else if (aBench !== -1 && bStart !== -1) {
      const tmp = t.bench[aBench];
      t.bench[aBench] = t.starting[bStart];
      t.starting[bStart] = tmp;
    }
  }
}

// ── Test helpers ─────────────────────────────────────────────────────────────

function makePlayer(id, element_type, team) {
  return { id, element_type, team, now_cost: 50 };
}
function mkEntry(id) { return { id, purchasePrice: 5, sellingPrice: 5 }; }

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

// ── Player pool ───────────────────────────────────────────────────────────────
// Valid 4-4-2 squad:
//   Starting: GK(101), DEF(201,202,203,204), MID(301,302,303,304), FWD(401,402)
//   Bench:    GK(102),                DEF(205),         MID(305),   FWD(403)
// 304 is a starting MID – used as the "sold" player in the WC scenario.
// 501 is the first replacement MID, 502 is the second replacement MID.
mockElements = [
  makePlayer(101, 1, 1), makePlayer(102, 1, 2),        // GKs
  makePlayer(201, 2, 3), makePlayer(202, 2, 4),
  makePlayer(203, 2, 5), makePlayer(204, 2, 6), makePlayer(205, 2, 7), // DEFs
  makePlayer(301, 3, 8), makePlayer(302, 3, 9), makePlayer(303, 3, 10),
  makePlayer(304, 3, 11), makePlayer(305, 3, 12), // MIDs
  makePlayer(401, 4, 13), makePlayer(402, 4, 14), makePlayer(403, 4, 15), // FWDs
  makePlayer(501, 3, 16), // replacement MID "playerB"
  makePlayer(502, 3, 17), // replacement MID "playerC"
];

function buildBaseTeam() {
  return {
    starting: [
      mkEntry(101), mkEntry(201), mkEntry(202), mkEntry(203), mkEntry(204),
      mkEntry(301), mkEntry(302), mkEntry(303), mkEntry(304),
      mkEntry(401), mkEntry(402),
    ],
    bench: [mkEntry(102), mkEntry(205), mkEntry(305), mkEntry(403)],
    chip: null,
    captain: null,
    viceCaptain: null,
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function totalSize(plan, gw) {
  return plan[gw].starting.length + plan[gw].bench.length;
}

function hasPlayer(plan, gw, id) {
  return plan[gw].starting.some(e => e.id === id) || plan[gw].bench.some(e => e.id === id);
}

// ── Test 1: Simple re-edit with no prior GW36 reorganisation ─────────────────
// WC in GW35: sell 304 (starting MID), buy 501 → propagated to GW36+.
// Then re-edit GW35: sell 501, buy 502 → GW36 must still have 15 with 502.
console.log('\nTest 1: GW35 transfer re-edit propagates to GW36 (no prior GW36 reorganisation)');
{
  const plan = {};
  for (let g = 35; g <= 38; g++) plan[g] = deepClone(buildBaseTeam());

  // Step 1: WC – remove starting MID 304, add MID 501
  let bank = 0;
  let batch = [];
  bank = simulateRemovePlayer(304, plan, 35, batch, bank);
  const r1 = simulateAddSinglePlayer(501, plan, 35, batch, bank);
  assert(r1.success, 'Added MID 501 to GW35 via WC');
  assert(totalSize(plan, 35) === 15, 'GW35 has 15 after adding 501');
  assert(totalSize(plan, 36) === 15, 'GW36 has 15 after 501 propagation');
  assert(hasPlayer(plan, 36, 501), '501 present in GW36 after propagation');

  // Step 2: Re-edit – remove 501 from GW35, add 502
  batch = [];
  bank = simulateRemovePlayer(501, plan, 35, batch, bank);
  assert(totalSize(plan, 35) === 14, 'GW35 has 14 after removing 501');
  assert(totalSize(plan, 36) === 14, 'GW36 has 14 after removing 501');

  const r2 = simulateAddSinglePlayer(502, plan, 35, batch, bank);
  assert(r2.success, 'Added MID 502 to GW35 as replacement');
  assert(totalSize(plan, 35) === 15, 'GW35 has 15 after adding 502');
  assert(totalSize(plan, 36) === 15, 'GW36 has 15 after adding 502 — no stale state');
  assert(hasPlayer(plan, 36, 502), '502 present in GW36');
}

// ── Test 2: Core regression – GW36 reorganisation THEN GW35 re-edit ──────────
// This is the exact user-reported bug.
// 1. WC in GW35: sell 304 (starting MID), buy 501 → 501 in starting GW35+.
// 2. Navigate to GW36: substitute 501 (starting) with bench player 205 (DEF) swap.
//    substitutePlayer propagates the swap from GW36 forward.
//    After swap: 501 is in bench at GW36+; 205 is in starting at GW36+.
//    GW35 is unchanged (501 still in starting there).
// 3. Go back to GW35: remove 501 (in starting at GW35), add 502.
//    → For GW35: starting slot freed → 502 fills starting ✓
//    → For GW36: starting is already 11 (501 was on bench, removed from bench).
//      Bench has only 3 players. BUG: old code skips GW36 because starting.length !< 11.
//      FIX: fallback adds 502 to bench instead → GW36 back to 15 ✓
console.log('\nTest 2: Regression – GW36 reorganisation then GW35 transfer re-edit (core bug)');
{
  const plan = {};
  for (let g = 35; g <= 38; g++) plan[g] = deepClone(buildBaseTeam());

  // Step 1: WC in GW35 – remove 304 (starting MID), add 501
  let bank = 0;
  let batch = [];
  bank = simulateRemovePlayer(304, plan, 35, batch, bank);
  const r1 = simulateAddSinglePlayer(501, plan, 35, batch, bank);
  assert(r1.success, 'Step 1: WC – added MID 501 to GW35');
  assert(plan[36].starting.some(e => e.id === 501), 'Step 1: 501 in starting of GW36 after propagation');
  assert(totalSize(plan, 35) === 15, 'Step 1: GW35 has 15 players');
  assert(totalSize(plan, 36) === 15, 'Step 1: GW36 has 15 players');

  // Step 2: Navigate to GW36, substitute 501 (starting) ↔ 205 (bench)
  // simulateSwapForwardFrom applies the swap from GW36 onwards only.
  simulateSwapForwardFrom(plan, 36, 501, 205);

  assert(plan[36].bench.some(e => e.id === 501), 'Step 2: 501 is now in bench of GW36');
  assert(plan[36].starting.some(e => e.id === 205), 'Step 2: 205 is now in starting of GW36');
  assert(plan[35].starting.some(e => e.id === 501), 'Step 2: GW35 unaffected – 501 still in starting');
  assert(plan[36].starting.length === 11, 'Step 2: GW36 still has 11 starters');
  assert(plan[36].bench.length === 4, 'Step 2: GW36 still has 4 bench players');
  assert(totalSize(plan, 36) === 15, 'Step 2: GW36 still has 15 total players');

  // Step 3: Go back to GW35 – remove 501 (it is in STARTING at GW35) and add 502
  batch = [];
  bank = simulateRemovePlayer(501, plan, 35, batch, bank);
  // After removal:
  // GW35: 501 removed from starting → 10 starters, 4 bench = 14 total
  // GW36: 501 removed from bench   → 11 starters, 3 bench = 14 total  ← the problematic case
  assert(totalSize(plan, 35) === 14, 'Step 3: GW35 has 14 after removing 501');
  assert(totalSize(plan, 36) === 14, 'Step 3: GW36 has 14 after removing 501 (from bench)');
  assert(plan[36].starting.length === 11, 'Step 3: GW36 still has 11 starters (501 was on bench)');
  assert(plan[36].bench.length === 3,    'Step 3: GW36 has 3 bench players after 501 removal');
  assert(batch[0].side === 'starting', 'Step 3: batch records 501 as removed from starting (in GW35)');

  // Add 502 – targetSide = 'starting' (batch slot was starting MID)
  // GW35: starting.length=10 < 11 → add to starting ✓
  // GW36: starting.length=11 (NOT < 11), bench.length=3 < 4 → FALLBACK to bench ✓
  const r2 = simulateAddSinglePlayer(502, plan, 35, batch, bank);
  assert(r2.success, 'Step 3: Added MID 502 to GW35 (fallback fix prevents failure)');

  // KEY assertions – the bug regression check
  assert(totalSize(plan, 35) === 15, 'Step 3: GW35 has 15 players ✓');
  assert(totalSize(plan, 36) === 15, 'Step 3: GW36 has 15 players — Bug-1 regression fixed ✓');
  assert(totalSize(plan, 37) === 15, 'Step 3: GW37 has 15 players ✓');
  assert(hasPlayer(plan, 35, 502), '502 present in GW35');
  assert(hasPlayer(plan, 36, 502), '502 present in GW36');

  const xi36ok = validateStartingXI(plan[36]);
  assert(xi36ok.ok, 'GW36 starting XI is valid after fix');
}

// ── Test 3: Bug 2 – block buying a player already in a future GW ─────────────
console.log('\nTest 3: Bug 2 – block buying player already in future planned GW');
{
  // plan[30] = base team; plan[33] has MID 501 independently added (user planned ahead)
  const plan = {};
  for (let g = 30; g <= 38; g++) {
    plan[g] = { starting: [], bench: [], chip: null, captain: null, viceCaptain: null };
  }
  const base = buildBaseTeam();
  plan[30].starting = base.starting.map(e => ({ ...e }));
  plan[30].bench = base.bench.map(e => ({ ...e }));

  // Independently add 501 to GW33 starting (simulates a prior transfer planned at GW33)
  plan[33].starting.push(mkEntry(501));

  // Now remove starting MID 304 in GW30 to create a slot
  const batch = [];
  let bank = 0;
  bank = simulateRemovePlayer(304, plan, 30, batch, bank);

  // Try to buy 501 at GW30 – should be blocked
  const result = simulateAddSinglePlayer(501, plan, 30, batch, bank);
  assert(!result.success, 'Blocked: 501 already in planned GW33 squad');
  assert(
    typeof result.reason === 'string' && result.reason.includes('GW33'),
    `Error message references GW33: "${result.reason}"`
  );
}

// ── Test 4: Bug 2 – allow buying player absent from all future GWs ────────────
console.log('\nTest 4: Bug 2 – allow buying player absent from all future GW plans');
{
  const plan = {};
  for (let g = 30; g <= 38; g++) {
    plan[g] = { starting: [], bench: [], chip: null, captain: null, viceCaptain: null };
  }
  const base = buildBaseTeam();
  plan[30].starting = base.starting.map(e => ({ ...e }));
  plan[30].bench = base.bench.map(e => ({ ...e }));
  // GW31-38 are empty (no future plans); 501 not in any GW

  const batch = [];
  let bank = 0;
  bank = simulateRemovePlayer(304, plan, 30, batch, bank);

  const result = simulateAddSinglePlayer(501, plan, 30, batch, bank);
  assert(result.success, 'Allowed: 501 not in any future GW plan');
}

// ── Test 5: No regression – normal transfer (no reorganised future GW) ────────
console.log('\nTest 5: Normal transfer still works (no regression from the fallback fix)');
{
  const plan = {};
  for (let g = 35; g <= 38; g++) plan[g] = deepClone(buildBaseTeam());

  // Remove starting MID 304, add 501 → should work as before
  const batch = [];
  let bank = 0;
  bank = simulateRemovePlayer(304, plan, 35, batch, bank);
  const result = simulateAddSinglePlayer(501, plan, 35, batch, bank);
  assert(result.success, 'Normal transfer succeeds');
  assert(totalSize(plan, 35) === 15, 'GW35 has 15 players');
  assert(plan[35].starting.some(e => e.id === 501), '501 is in starting of GW35');
  assert(plan[36].starting.some(e => e.id === 501), '501 propagated to starting of GW36');

  const xi35ok = validateStartingXI(plan[35]);
  assert(xi35ok.ok, 'GW35 starting XI is valid');
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('FAIL');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
  process.exit(0);
}
