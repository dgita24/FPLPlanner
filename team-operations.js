// team-operations.js - Team-related operations (transfers, swaps, etc.)

import { state, history, calculateSellingPrice } from './data.js';
import { validateStartingXI, validateClubLimit, getOverLimitClubs, getElementType, getPlayerTeamId } from './validation.js';
import { displayPrice, showMessage, renderPitch, renderBench, setPendingSwap, getPendingSwap } from './ui-render.js';

// Track batch transfers: multiple players can be removed before adding replacements
let batchTransfers = {
  snapshot: null, // { plan, bank } - saved before any transfers
  removedPlayers: [], // Array of { id, side, sellingPrice } for each removed player
  isActive: false
};

export function resetTransferState() {
  batchTransfers = {
    snapshot: null,
    removedPlayers: [],
    isActive: false
  };
  setPendingSwap(null);
}

function getPlayer(id) {
  return state.elements.find((p) => p.id === id);
}

function pushUndoState() {
  history.undoStack.push(JSON.parse(JSON.stringify(state)));

  // Safety cap to avoid unbounded memory growth
  if (history.undoStack.length > 50) {
    history.undoStack.shift();
  }
}

/* -------------------------
   CANCEL TRANSFER (ROBUST)
-------------------------- */

function deepClone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function snapshotForCancel() {
  return {
    plan: deepClone(state.plan),
    bank: state.bank,
  };
}

function restorePlanInPlace(snapshotPlan) {
  // Keep the same object reference for state.plan; replace its contents.
  for (const k of Object.keys(state.plan)) delete state.plan[k];
  for (const [k, v] of Object.entries(snapshotPlan)) state.plan[k] = v;
}

export function cancelTransfer(updateUI) {
  if (!batchTransfers.isActive || !batchTransfers.snapshot) {
    showMessage('No pending transfer to cancel.', 'info');
    return;
  }

  restorePlanInPlace(batchTransfers.snapshot.plan);
  state.bank = batchTransfers.snapshot.bank;

  batchTransfers = {
    snapshot: null,
    removedPlayers: [],
    isActive: false
  };

  showMessage('All transfers cancelled. Sold players restored.', 'success');
  updateUI();
}

/* -------------------------
   TWO-CLICK SWAP
-------------------------- */

function getSide(team, playerId) {
  if (team.starting.some((e) => e.id === playerId)) return 'starting';
  if (team.bench.some((e) => e.id === playerId)) return 'bench';
  return null;
}

function isGK(playerId) {
  return getElementType(playerId) === 1;
}

function swapWithinTeam(team, aId, bId) {
  const aStart = team.starting.findIndex((e) => e.id === aId);
  const aBench = team.bench.findIndex((e) => e.id === aId);
  const bStart = team.starting.findIndex((e) => e.id === bId);
  const bBench = team.bench.findIndex((e) => e.id === bId);

  if (aStart !== -1 && bBench !== -1) {
    const tmp = team.starting[aStart];
    team.starting[aStart] = team.bench[bBench];
    team.bench[bBench] = tmp;
    return true;
  }

  if (aBench !== -1 && bStart !== -1) {
    const tmp = team.bench[aBench];
    team.bench[aBench] = team.starting[bStart];
    team.starting[bStart] = tmp;
    return true;
  }

  return false;
}

export function substitutePlayer(playerId, updateUI) {
  const gw = state.viewingGW;
  const teamNow = state.plan[gw];
  if (!teamNow) return;

  if (batchTransfers.isActive) {
    showMessage('Finish the pending transfers (Add players) or Cancel first.', 'info');
    return;
  }

  const sideNow = getSide(teamNow, playerId);
  if (!sideNow) return;

  const currentPendingSwap = getPendingSwap();

  // First click: arm selection.
  if (!currentPendingSwap) {
    setPendingSwap({ id: playerId, side: sideNow });
    updateUI();
    return;
  }

  // Click same player again: cancel.
  if (currentPendingSwap.id === playerId) {
    setPendingSwap(null);
    updateUI();
    return;
  }

  // Clicking a different player on the same side: keep original armed selection.
  if (currentPendingSwap.side === sideNow) {
    const want = currentPendingSwap.side === 'starting' ? 'bench' : 'starter';
    showMessage(
      `Swap in progress: select a ${want} to complete (or click again to cancel).`,
      'info'
    );
    updateUI();
    return;
  }

  // GK must swap with GK.
  if (isGK(currentPendingSwap.id) !== isGK(playerId)) {
    setPendingSwap(null);
    showMessage('Invalid swap: GK must swap with GK.', 'error');
    updateUI();
    return;
  }

  const a = currentPendingSwap.id;
  const b = playerId;

  // Validate formation for every affected GW before applying
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const temp = {
      starting: t.starting.map((x) => ({ ...x })),
      bench: t.bench.map((x) => ({ ...x })),
    };

    swapWithinTeam(temp, a, b);
    const v = validateStartingXI(temp);
    if (!v.ok) {
      setPendingSwap(null);
      showMessage(v.message, 'error');
      updateUI();
      return;
    }
  }

  // Apply swap from this GW forward
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    swapWithinTeam(t, a, b);
  }

  setPendingSwap(null);
  updateUI();
}

/* -------------------------
   TRANSFERS (SELL/BUY)
-------------------------- */

export function removePlayer(playerId, source, updateUI) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  // Snapshot BEFORE the first transfer in a batch
  if (!batchTransfers.isActive) {
    batchTransfers.snapshot = snapshotForCancel();
    batchTransfers.isActive = true;
  }

  // If currently over the 3-per-club limit, the next transfer out must be from that club.
  const overLimit = getOverLimitClubs(team);
  if (overLimit.size > 0) {
    const playerClub = getPlayerTeamId(playerId);
    if (!overLimit.has(playerClub)) {
      showMessage('You have 4+ players from a club. Your next transfer out must be from that club.', 'error');
      return;
    }
  }

  // Find the entry in the currently viewed GW (sell once)
  const entry =
    team.starting.find((e) => e.id === playerId) ||
    team.bench.find((e) => e.id === playerId);

  if (!entry) return;

  // Record where the sale came from and add selling price to bank
  const actualSource = team.starting.some((e) => e.id === playerId) ? 'starting' : 'bench';
  const sell = entry.sellingPrice ?? displayPrice(entry);
  
  // Track this removal
  batchTransfers.removedPlayers.push({
    id: playerId,
    side: actualSource,
    sellingPrice: sell
  });

  state.bank = Number((state.bank + sell).toFixed(1));

  // Remove from this GW and all future planned GWs
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    t.starting = t.starting.filter((e) => e.id !== playerId);
    t.bench = t.bench.filter((e) => e.id !== playerId);
  }

  const removedCount = batchTransfers.removedPlayers.length;
  showMessage(
    `Player ${removedCount} sold. ${removedCount === 1 ? 'Pick replacement' : 'Continue removing or add replacements'} (or Cancel).`,
    'info'
  );
  updateUI();
}

export function addSelectedToSquad(updateUI) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  const playerId = window.selectedPlayerId;
  if (!playerId) {
    showMessage('Select a player in the table first.', 'error');
    return;
  }

  if (!batchTransfers.isActive || batchTransfers.removedPlayers.length === 0) {
    showMessage('Sell a player first (X), then Add to squad (or Cancel transfer).', 'info');
    return;
  }

  const p = getPlayer(playerId);
  if (!p) {
    showMessage('Player data not found.', 'error');
    return;
  }

  // Prevent duplicates
  const already =
    team.starting.some((e) => e.id === playerId) ||
    team.bench.some((e) => e.id === playerId);

  if (already) {
    showMessage('That player is already in your squad.', 'error');
    return;
  }

  // Budget check
  const buy = p.now_cost / 10;
  if (state.bank < buy) {
    showMessage(
      `Not enough money. Need ${buy.toFixed(1)}m, have ${Number(state.bank).toFixed(1)}m.`,
      'error'
    );
    return;
  }

  // Determine which slots are available based on removed players
  const startingSlotsNeeded = batchTransfers.removedPlayers.filter(p => p.side === 'starting').length;
  const benchSlotsNeeded = batchTransfers.removedPlayers.filter(p => p.side === 'bench').length;
  
  const currentStartingCount = team.starting.length;
  const currentBenchCount = team.bench.length;
  
  // Determine which side to add to based on available slots
  let targetSide = null;
  
  // Check if we can add to starting XI (has room and needs filling)
  const canAddToStarting = currentStartingCount < 11 && startingSlotsNeeded > 0;
  // Check if we can add to bench (has room and needs filling)
  const canAddToBench = currentBenchCount < 4 && benchSlotsNeeded > 0;
  
  if (!canAddToStarting && !canAddToBench) {
    if (startingSlotsNeeded > 0 || benchSlotsNeeded > 0) {
      showMessage('All available slots are full. Cannot add more players.', 'error');
    } else {
      showMessage('No slots to fill. All transfers complete.', 'info');
    }
    return;
  }
  
  // Prefer starting XI if both are available (user can choose by what they select)
  // For now, intelligently choose based on player position
  const isGKPlayer = getElementType(playerId) === 1;
  
  if (canAddToStarting && canAddToBench) {
    // Both available - check if GK should go to bench
    if (isGKPlayer) {
      // If adding a GK and starting XI already has a GK, prefer bench
      const startingHasGK = team.starting.some(e => getElementType(e.id) === 1);
      targetSide = startingHasGK ? 'bench' : 'starting';
    } else {
      // Default to starting XI for outfield players
      targetSide = 'starting';
    }
  } else if (canAddToStarting) {
    targetSide = 'starting';
  } else {
    targetSide = 'bench';
  }

  const purchasePrice = buy;
  const sellingPrice = calculateSellingPrice(purchasePrice, buy);
  const entry = { id: playerId, purchasePrice, sellingPrice };

  // ---------- VALIDATE ACROSS FUTURE GWs ----------
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const temp = {
      starting: t.starting.map((x) => ({ ...x })),
      bench: t.bench.map((x) => ({ ...x })),
    };

    if (targetSide === 'starting') {
      temp.starting.push({ ...entry });
    } else {
      if (isGKPlayer) {
        temp.bench.unshift({ ...entry });
      } else {
        const gkIndex = temp.bench.findIndex((e) => getElementType(e.id) === 1);
        if (gkIndex === -1) temp.bench.push({ ...entry });
        else temp.bench.splice(gkIndex + 1, 0, { ...entry });
      }
    }

    const clubOk = validateClubLimit(temp);
    if (!clubOk.ok) {
      showMessage(
        'Invalid transfer: max 3 players per club (or fix an over-limit club first).',
        'error'
      );
      return;
    }

    // Only validate formation if squad is complete (15 players)
    const totalPlayers = temp.starting.length + temp.bench.length;
    if (totalPlayers === 15) {
      const v = validateStartingXI(temp);
      if (!v.ok) {
        showMessage(v.message, 'error');
        return;
      }
    }
  }

  // ---------- APPLY TRANSFER ----------
  pushUndoState();
  state.bank = Number((state.bank - buy).toFixed(1));

  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const exists =
      t.starting.some((e) => e.id === playerId) ||
      t.bench.some((e) => e.id === playerId);

    if (exists) continue;

    if (targetSide === 'starting') {
      if (t.starting.length < 11) {
        t.starting.push({ ...entry });
      }
    } else {
      if (t.bench.length < 4) {
        if (isGKPlayer) {
          t.bench.unshift({ ...entry });
        } else {
          const gkIndex = t.bench.findIndex((e) => getElementType(e.id) === 1);
          if (gkIndex === -1) t.bench.push({ ...entry });
          else t.bench.splice(gkIndex + 1, 0, { ...entry });
        }
      }
    }
  }

  // Remove the filled slot from the batch (find matching side, not FIFO)
  const slotIndex = batchTransfers.removedPlayers.findIndex(p => p.side === targetSide);
  if (slotIndex !== -1) {
    batchTransfers.removedPlayers.splice(slotIndex, 1);
  }

  // Check if all transfers are complete
  const remainingSlots = batchTransfers.removedPlayers.length;
  if (remainingSlots === 0) {
    // All slots filled - validate final squad
    const finalTeam = state.plan[gw];
    const totalPlayers = finalTeam.starting.length + finalTeam.bench.length;
    
    if (totalPlayers !== 15) {
      showMessage(`Squad incomplete: ${totalPlayers}/15 players.`, 'error');
      return;
    }

    const v = validateStartingXI(finalTeam);
    if (!v.ok) {
      showMessage(v.message, 'error');
      return;
    }

    // Clear batch state
    batchTransfers = {
      snapshot: null,
      removedPlayers: [],
      isActive: false
    };

    showMessage('All transfers completed successfully!', 'success');
  } else {
    const remaining = remainingSlots;
    showMessage(
      `Player added. ${remaining} more ${remaining === 1 ? 'slot' : 'slots'} to fill.`,
      'success'
    );
  }

  updateUI();
}

export function isPendingTransfer() {
  return batchTransfers.isActive;
}

export function getBatchTransferInfo() {
  return {
    isActive: batchTransfers.isActive,
    removedCount: batchTransfers.removedPlayers.length,
    removedPlayers: batchTransfers.removedPlayers
  };
}
