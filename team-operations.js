// team-operations.js - Team-related operations (transfers, swaps, etc.)

import { state, history, calculateSellingPrice } from './data.js';
import { validateStartingXI, validateClubLimit, getOverLimitClubs, getElementType, getPlayerTeamId, validateSquadComposition } from './validation.js';
import { displayPrice, showMessage, renderPitch, renderBench, setPendingSwap, getPendingSwap, getChipDisplayName } from './ui-render.js';

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

  if (aBench !== -1 && bBench !== -1) {
    const tmp = team.bench[aBench];
    team.bench[aBench] = team.bench[bBench];
    team.bench[bBench] = tmp;
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

  // Clicking a different player on the same side.
  if (currentPendingSwap.side === sideNow) {
    if (sideNow === 'bench') {
      // Bench-to-bench reorder: only allowed between outfield bench players.
      if (isGK(currentPendingSwap.id) || isGK(playerId)) {
        setPendingSwap(null);
        showMessage('Bench GK can only swap with the starting GK.', 'error');
        updateUI();
        return;
      }
      // Both are outfield bench players – fall through to apply the swap.
    } else {
      // Both in the starting XI: prompt to select a bench player.
      showMessage(
        'Swap in progress: select a bench player to complete (or click again to cancel).',
        'info'
      );
      updateUI();
      return;
    }
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
  for (let g = gw; g <= 38; g++) {
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
  for (let g = gw; g <= 38; g++) {
    const t = state.plan[g];
    if (!t) continue;
    swapWithinTeam(t, a, b);
    
    // Clear captain/vice-captain if they are being moved to the bench
    const aInBench = t.bench.some(e => e.id === a);
    const bInBench = t.bench.some(e => e.id === b);
    
    if (aInBench && t.captain === a) t.captain = null;
    if (aInBench && t.viceCaptain === a) t.viceCaptain = null;
    if (bInBench && t.captain === b) t.captain = null;
    if (bInBench && t.viceCaptain === b) t.viceCaptain = null;
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
  for (let g = gw; g <= 38; g++) {
    const t = state.plan[g];
    if (!t) continue;
    t.starting = t.starting.filter((e) => e.id !== playerId);
    t.bench = t.bench.filter((e) => e.id !== playerId);
    
    // Clear captain/vice-captain if this player was assigned
    if (t.captain === playerId) t.captain = null;
    if (t.viceCaptain === playerId) t.viceCaptain = null;
  }

  const removedCount = batchTransfers.removedPlayers.length;
  showMessage(
    `Player ${removedCount} sold. ${removedCount === 1 ? 'Pick replacement' : 'Continue removing or add replacements'} (or Cancel).`,
    'info'
  );
  updateUI();
}

// Reinstate a specific removed player (undo individual removal)
export function reinstatePlayer(playerId, updateUI) {
  if (!batchTransfers.isActive) {
    showMessage('No active batch transfer.', 'info');
    return;
  }

  // Find the removed player in the batch
  const removedIndex = batchTransfers.removedPlayers.findIndex(rp => rp.id === playerId);
  if (removedIndex === -1) {
    showMessage('Player not found in removed list.', 'error');
    return;
  }

  const removed = batchTransfers.removedPlayers[removedIndex];
  const gw = state.viewingGW;

  // Find the player in the snapshot to restore it
  const snapshotTeam = batchTransfers.snapshot.plan[gw];
  if (!snapshotTeam) return;

  const originalEntry = 
    snapshotTeam.starting.find(e => e.id === playerId) ||
    snapshotTeam.bench.find(e => e.id === playerId);

  if (!originalEntry) {
    showMessage('Cannot find original player data.', 'error');
    return;
  }

  // Restore the player to all future GWs
  for (let g = gw; g <= 38; g++) {
    const t = state.plan[g];
    if (!t) continue;

    // Check if player already exists
    const exists = t.starting.some(e => e.id === playerId) || t.bench.some(e => e.id === playerId);
    if (exists) continue;

    // Add back to the correct side
    if (removed.side === 'starting') {
      if (t.starting.length < 11) {
        t.starting.push({ ...originalEntry });
      }
    } else {
      if (t.bench.length < 4) {
        const isGK = getElementType(playerId) === 1;
        if (isGK) {
          t.bench.unshift({ ...originalEntry });
        } else {
          const gkIndex = t.bench.findIndex(e => getElementType(e.id) === 1);
          if (gkIndex === -1) t.bench.push({ ...originalEntry });
          else t.bench.splice(gkIndex + 1, 0, { ...originalEntry });
        }
      }
    }
  }

  // Deduct the selling price from bank
  state.bank = Number((state.bank - removed.sellingPrice).toFixed(1));

  // Remove from the batch list
  batchTransfers.removedPlayers.splice(removedIndex, 1);

  // If no more removals, deactivate batch mode
  if (batchTransfers.removedPlayers.length === 0) {
    batchTransfers = {
      snapshot: null,
      removedPlayers: [],
      isActive: false
    };
    showMessage('Player reinstated. Batch transfer cancelled.', 'success');
  } else {
    const remaining = batchTransfers.removedPlayers.length;
    showMessage(
      `Player reinstated. ${remaining} slot${remaining > 1 ? 's' : ''} still need filling.`,
      'success'
    );
  }

  updateUI();
}

export function addSelectedToSquad(updateUI) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  const playerIds = window.selectedPlayerIds || [];
  if (playerIds.length === 0) {
    showMessage('Select player(s) in the table first.', 'error');
    return;
  }

  if (!batchTransfers.isActive || batchTransfers.removedPlayers.length === 0) {
    showMessage('Sell a player first (X), then Add to squad (or Cancel transfer).', 'info');
    return;
  }

  // Process each selected player
  let successCount = 0;
  let failedPlayers = [];

  for (const playerId of playerIds) {
    const result = addSinglePlayerToSquad(playerId, team, gw, updateUI);
    if (result.success) {
      successCount++;
    } else {
      failedPlayers.push({ id: playerId, reason: result.reason });
    }
  }

  // Clear selection after processing
  window.selectedPlayerIds = [];

  // Show summary message
  if (successCount > 0) {
    const remaining = batchTransfers.removedPlayers.length;
    if (remaining === 0) {
      showMessage('All transfers completed successfully!', 'success');
    } else {
      showMessage(
        `${successCount} player${successCount > 1 ? 's' : ''} added. ${remaining} more slot${remaining === 1 ? '' : 's'} to fill.`,
        'success'
      );
    }
  }

  if (failedPlayers.length > 0) {
    const firstFailed = failedPlayers[0];
    const p = getPlayer(firstFailed.id);
    showMessage(
      `${p?.web_name || 'Player'}: ${firstFailed.reason}`,
      'error'
    );
  }

  updateUI();
}

// Helper function to add a single player
function addSinglePlayerToSquad(playerId, team, gw, updateUI) {
  const p = getPlayer(playerId);
  if (!p) {
    return { success: false, reason: 'Player data not found' };
  }

  // Prevent duplicates
  const already =
    team.starting.some((e) => e.id === playerId) ||
    team.bench.some((e) => e.id === playerId);

  if (already) {
    return { success: false, reason: 'Already in your squad' };
  }

  // Budget check
  const buy = p.now_cost / 10;
  if (state.bank < buy) {
    return { success: false, reason: `Not enough money. Need £${buy.toFixed(1)}m, have £${Number(state.bank).toFixed(1)}m` };
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
      return { success: false, reason: 'All available slots are full' };
    } else {
      return { success: false, reason: 'No slots to fill' };
    }
    return;
  }
  
  // Intelligently choose target side based on player type and available slots
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
  for (let g = gw; g <= 38; g++) {
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
      return { success: false, reason: 'Max 3 players per club' };
    }

    // Validate squad composition (2 GK, 5 DEF, 5 MID, 3 FWD)
    const squadOk = validateSquadComposition(temp);
    if (!squadOk.ok) {
      return { success: false, reason: squadOk.message };
    }

    // Only validate formation if squad is complete (15 players)
    const totalPlayers = temp.starting.length + temp.bench.length;
    if (totalPlayers === 15) {
      const v = validateStartingXI(temp);
      if (!v.ok) {
        return { success: false, reason: v.message };
      }
    }
  }

  // ---------- APPLY TRANSFER ----------
  pushUndoState();
  state.bank = Number((state.bank - buy).toFixed(1));

  for (let g = gw; g <= 38; g++) {
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
      return { success: false, reason: `Squad incomplete: ${totalPlayers}/15 players` };
    }

    const v = validateStartingXI(finalTeam);
    if (!v.ok) {
      return { success: false, reason: v.message };
    }

    // Clear batch state
    batchTransfers = {
      snapshot: null,
      removedPlayers: [],
      isActive: false
    };
  }

  return { success: true };
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

/* -------------------------
   CHIP SELECTION
-------------------------- */

export function selectChip(chipType, updateUI) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  
  if (!team) {
    showMessage('No team data for this gameweek', 'error');
    return;
  }

  // Check if a chip is already selected for this GW
  if (team.chip === chipType) {
    // Unselect the chip
    pushUndoState();
    team.chip = null;
    showMessage(`${getChipDisplayName(chipType)} deselected for GW${gw}`, 'success');
  } else {
    // Select the chip
    pushUndoState();
    team.chip = chipType;
    showMessage(`${getChipDisplayName(chipType)} selected for GW${gw}`, 'success');
  }
  
  updateUI();
}

export function getActiveChip(gw) {
  const team = state.plan[gw];
  return team ? team.chip : null;
}

/* -------------------------
   PLAYER MARK / TARGET
-------------------------- */

export function togglePlayerMark(playerId, updateUI) {
  const gw = state.viewingGW;
  const team = state.plan[gw];
  if (!team) return;

  const entry =
    team.starting.find((e) => e.id === playerId) ||
    team.bench.find((e) => e.id === playerId);
  if (!entry) return;

  pushUndoState();
  entry.marked = !entry.marked;

  const p = state.elements.find((el) => el.id === playerId);
  const name = p ? p.web_name : `Player ${playerId}`;
  showMessage(
    entry.marked
      ? `${name} marked for transfer/bench`
      : `${name} mark removed`,
    'info'
  );

  updateUI();
}
