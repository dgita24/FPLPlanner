// team-operations.js - Team-related operations (transfers, swaps, etc.)

import { state, history, calculateSellingPrice } from './data.js';
import { validateStartingXI, validateClubLimit, getOverLimitClubs, getElementType, getPlayerTeamId } from './validation.js';
import { displayPrice, showMessage, renderPitch, renderBench, setPendingSwap, getPendingSwap } from './ui-render.js';

// Remember where the last sale came from so the next buy goes there.
let lastSoldSide = null; // 'starting' | 'bench'

// Snapshot used to cancel a planned transfer (sale before buy).
let pendingTransfer = null; // { plan, bank }

export function resetTransferState() {
  lastSoldSide = null;
  pendingTransfer = null;
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
  if (!pendingTransfer) {
    showMessage('No pending transfer to cancel.', 'info');
    return;
  }

  restorePlanInPlace(pendingTransfer.plan);
  state.bank = pendingTransfer.bank;

  pendingTransfer = null;
  lastSoldSide = null;

  showMessage('Transfer cancelled. Sold player restored.', 'success');
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

  if (pendingTransfer) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
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

  if (pendingTransfer) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
    return;
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

  // Snapshot BEFORE any mutations so we can cancel and restore
  pendingTransfer = snapshotForCancel();

  // record where the sale came from, so the next buy goes there
  if (source === 'starting' || source === 'bench') lastSoldSide = source;

  // Add selling price to bank once
  const sell = entry.sellingPrice ?? displayPrice(entry);
  state.bank = Number((state.bank + sell).toFixed(1));

  // Remove from this GW and all future planned GWs
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;
    t.starting = t.starting.filter((e) => e.id !== playerId);
    t.bench = t.bench.filter((e) => e.id !== playerId);
  }

  showMessage('Player sold. Pick a replacement and click Add to squad (or Cancel transfer).', 'info');
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

  if (!lastSoldSide || !pendingTransfer) {
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

  // Capacity check (current GW only)
  if (lastSoldSide === 'starting' && team.starting.length >= 11) {
    showMessage('Starting XI is already full.', 'error');
    return;
  }

  if (lastSoldSide === 'bench' && team.bench.length >= 4) {
    showMessage('Bench is already full.', 'error');
    return;
  }

  const purchasePrice = buy;
  const sellingPrice = calculateSellingPrice(purchasePrice, buy);
  const entry = { id: playerId, purchasePrice, sellingPrice };

  const isGKPlayer = getElementType(playerId) === 1;

  // ---------- VALIDATE ACROSS FUTURE GWs ----------
  for (let g = gw; g <= state.currentGW + 7; g++) {
    const t = state.plan[g];
    if (!t) continue;

    const temp = {
      starting: t.starting.map((x) => ({ ...x })),
      bench: t.bench.map((x) => ({ ...x })),
    };

    if (lastSoldSide === 'starting') {
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

    const v = validateStartingXI(temp);
    if (!v.ok) {
      showMessage(v.message, 'error');
      return;
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

    if (lastSoldSide === 'starting') {
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

  lastSoldSide = null;
  pendingTransfer = null;

  showMessage('Player bought and added to squad.', 'success');
  updateUI();
}

export function isPendingTransfer() {
  return !!pendingTransfer;
}
