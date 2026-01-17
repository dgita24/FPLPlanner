// ui-init.js - Initializes all UI-related event listeners and dependencies

import { state, history, loadTeamEntry } from './data.js';
import { setupSidebarHandlers, closeSidebar } from './ui-sidebar.js';
import { showMessage, renderPitch, renderBench, ensureFixturesForView } from './ui-render.js';
import { renderFixtures } from './fixtures.js';
import { cancelTransfer, substitutePlayer, addSelectedToSquad, removePlayer, resetTransferState, isPendingTransfer, getBatchTransferInfo, reinstatePlayer, selectChip } from './team-operations.js';
import { setPendingSwap } from './ui-render.js';
import { setDefaultSort } from './table.js';

// Helper function for pluralization
function pluralize(word, count) {
  return count === 1 ? word : word + 's';
}

function updateUI() {
  // kick off fixture loads for current viewing window (async)
  ensureFixturesForView();

  // Show the GW being viewed/planned
  const gwEl = document.getElementById('currentGWDisplay');
  if (gwEl) gwEl.textContent = state.viewingGW;

  const prevBtn = document.getElementById('prevGW');
  const nextBtn = document.getElementById('nextGW');
  if (prevBtn) prevBtn.disabled = state.viewingGW <= state.currentGW;
  if (nextBtn) nextBtn.disabled = state.viewingGW >= 38;

  const bankInput = document.getElementById('bankInput');
  if (bankInput) bankInput.value = Number(state.bank).toFixed(1);

  const pm = document.getElementById('priceModeSelect');
  if (pm && pm.value !== state.priceMode) pm.value = state.priceMode;

  // Enable/disable cancel transfer button (if present)
  const cancelBtn = document.getElementById('cancelTransferBtn');
  if (cancelBtn) cancelBtn.disabled = !isPendingTransfer();

  // Update batch transfer status display
  const batchInfo = getBatchTransferInfo();
  const batchStatus = document.getElementById('batchTransferStatus');
  if (batchStatus) {
    if (batchInfo.isActive && batchInfo.removedCount > 0) {
      const count = batchInfo.removedCount;
      batchStatus.textContent = `${count} ${pluralize('player', count)} removed - add ${pluralize('replacement', count)}`;
      batchStatus.style.display = 'block';
    } else {
      batchStatus.style.display = 'none';
    }
  }

  renderPitch();
  renderBench();
}

function changeGW(delta) {
  if (isPendingTransfer()) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
    return;
  }

  const minGW = state.currentGW;
  const maxGW = 38;

  let next = state.viewingGW + delta;
  if (next < minGW) next = minGW;
  if (next > maxGW) next = maxGW;

  state.viewingGW = next;

  // cancel any in-progress swap when changing GW
  setPendingSwap(null);

  updateUI();
  renderFixtures();
}

// Import team from FPL
async function importTeam() {
  const teamId = document.getElementById('importTeamId')?.value?.trim();
  if (!teamId) {
    showMessage('Enter Team ID', 'error');
    return;
  }

  showMessage(`Loading team (planning GW${state.currentGW})...`, 'info');

  const data = await loadTeamEntry(teamId, state.currentGW);

  if (!data || !data.picks) {
    showMessage('Failed to load team.', 'error');
    return;
  }

  const importedGW = data._imported_gw || state.importedGW;
  if (importedGW && importedGW !== state.currentGW) {
    showMessage(
      `⚠️ Imported from GW${importedGW} (GW${state.currentGW} picks not yet available). Your current squad may be different if you made transfers since GW${importedGW}.`,
      'info'
    );
  } else {
    showMessage(`Team imported for GW${state.currentGW}.`, 'success');
  }

  // Set viewing GW to next gameweek for planning purposes
  const events = state.bootstrap?.events || [];
  const next = events.find(e => e.is_next)?.id;
  const current = events.find(e => e.is_current)?.id;
  state.viewingGW = next || current || state.currentGW;

  // reset transient UI state
  resetTransferState();

  // Close the menu after import
  closeSidebar();

  updateUI();
  
  // Set default sort to points (descending) after import
  setDefaultSort();
}

// Local Save/Load
function localSave() {
  try {
    const data = {
      plan: state.plan,
      bank: state.bank,
      viewingGW: state.viewingGW,
      priceMode: state.priceMode
    };
    localStorage.setItem('fplplanner-state', JSON.stringify(data));
    showMessage('Team saved locally', 'success');
  } catch (e) {
    showMessage('Local save failed', 'error');
  }
}

function localLoad() {
  try {
    const saved = localStorage.getItem('fplplanner-state');
    if (!saved) {
      showMessage('No local save found', 'info');
      return;
    }
    const data = JSON.parse(saved);
    state.plan = data.plan;
    state.bank = data.bank;
    state.viewingGW = data.viewingGW;
    state.priceMode = data.priceMode;
    updateUI();
    showMessage('Team loaded locally', 'success');
  } catch (e) {
    showMessage('Local load failed', 'error');
  }
}

// Cloud Save
async function saveTeam() {
  const teamId = document.getElementById('saveTeamId')?.value?.trim();
  const password = document.getElementById('savePassword')?.value?.trim();
  const label = document.getElementById('saveLabel')?.value?.trim();

  if (!teamId || !password) {
    showMessage('Enter Team ID and Password', 'error');
    return;
  }

  const sideMsg = document.getElementById('sideMsg');
  if (sideMsg) sideMsg.textContent = 'Saving...';

  try {
    const payload = {
      plan: state.plan,
      bank: state.bank,
      viewingGW: state.viewingGW,
      priceMode: state.priceMode
    };

    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamid: teamId, label, password, payload })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showMessage('Team saved to cloud!', 'success');
      if (sideMsg) sideMsg.textContent = `✓ Saved as: ${teamId}`;
      // Close sidebar after successful save
      closeSidebar();
    } else {
      throw new Error(result.error || 'Save failed');
    }
  } catch (err) {
    showMessage(`Save error: ${err.message}`, 'error');
    if (sideMsg) sideMsg.textContent = `Error: ${err.message}`;
  }
}

// Cloud Load
async function loadTeam() {
  const teamId = document.getElementById('loadTeamId')?.value?.trim();
  const password = document.getElementById('loadPassword')?.value?.trim();

  if (!teamId || !password) {
    showMessage('Enter Team ID and Password', 'error');
    return;
  }

  const sideMsg = document.getElementById('sideMsg');
  if (sideMsg) sideMsg.textContent = 'Loading...';

  try {
    const response = await fetch('/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamid: teamId, password })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      const data = result.data;
      state.plan = data.payload.plan;
      state.bank = data.payload.bank;
      state.viewingGW = data.payload.viewingGW;
      state.priceMode = data.payload.priceMode;

      updateUI();
      showMessage('Team loaded from cloud!', 'success');
      if (sideMsg) sideMsg.textContent = `✓ Loaded: ${data.label || teamId}`;

      // Close sidebar after load
      closeSidebar();
    } else {
      throw new Error(result.error || 'Load failed');
    }
  } catch (err) {
    showMessage(`Load error: ${err.message}`, 'error');
    if (sideMsg) sideMsg.textContent = `Error: ${err.message}`;
  }
}

function undoLastAction() {
  if (!history.undoStack.length) {
    showMessage('Nothing to undo.', 'info');
    return;
  }

  const prev = history.undoStack.pop();

  // Replace state contents (preserve object reference)
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, prev);

  updateUI();
  showMessage('Last action undone.', 'success');
}

function resetToImportedTeam() {
  if (!history.baseline) {
    showMessage('No imported team to reset to.', 'error');
    return;
  }

  // Restore baseline state (preserve object reference)
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, JSON.parse(JSON.stringify(history.baseline)));

  // Clear undo history
  history.undoStack = [];

  updateUI();
  showMessage('Team reset to imported state.', 'success');
}

// Captain/Vice-Captain functions
// Logic: When setting a captain/VC on a player who already has the other role,
// swap the roles between the two players (if both roles are currently assigned).
// This prevents losing assignments when clicking on already-assigned players.
function setCaptain(playerId) {
  const team = state.plan[state.viewingGW];
  if (!team) return;

  // Check if player is in starting XI
  const inStarting = team.starting.some(p => p.id === playerId);
  if (!inStarting) {
    showMessage('Only starting XI players can be captain.', 'error');
    return;
  }

  // If this player is currently vice-captain AND there's a captain, swap roles
  if (team.viceCaptain === playerId && team.captain !== null) {
    const oldCaptain = team.captain;
    team.captain = playerId;
    team.viceCaptain = oldCaptain;
    showMessage('Captain and Vice-Captain swapped.', 'success');
  } else {
    team.captain = playerId;
    showMessage('Captain set.', 'success');
  }

  updateUI();
}

function setViceCaptain(playerId) {
  const team = state.plan[state.viewingGW];
  if (!team) return;

  // Check if player is in starting XI
  const inStarting = team.starting.some(p => p.id === playerId);
  if (!inStarting) {
    showMessage('Only starting XI players can be vice-captain.', 'error');
    return;
  }

  // If this player is currently captain AND there's a vice-captain, swap roles
  if (team.captain === playerId && team.viceCaptain !== null) {
    const oldViceCaptain = team.viceCaptain;
    team.viceCaptain = playerId;
    team.captain = oldViceCaptain;
    showMessage('Captain and Vice-Captain swapped.', 'success');
  } else {
    team.viceCaptain = playerId;
    showMessage('Vice-Captain set.', 'success');
  }

  updateUI();
}

export function initUI() {
  // Inject CSS for two-click swap highlight + fixture UI + placeholder cards + chip UI
  if (!document.getElementById('plannerInjectedStyle')) {
    const style = document.createElement('style');
    style.id = 'plannerInjectedStyle';
    style.textContent = `
      .player-card.pending-swap {
        outline: 3px solid #00ff87;
        box-shadow: 0 0 0 3px rgba(0, 255, 135, 0.25);
      }

      /* Placeholder card styling for removed players */
      .player-card.placeholder-card {
        opacity: 0.5;
        position: relative;
        pointer-events: none;
      }

      .placeholder-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 68, 68, 0.85);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        z-index: 5;
        pointer-events: auto;
      }

      .reinstate-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.9);
        border: none;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        font-size: 20px;
        font-weight: bold;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }

      .reinstate-btn:hover {
        background: rgba(0, 0, 0, 1);
        transform: scale(1.1);
      }

      .placeholder-text {
        font-size: 16px;
        font-weight: 900;
        color: white;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        letter-spacing: 1px;
      }

      .placeholder-price {
        font-size: 13px;
        font-weight: 700;
        color: #00ff87;
        margin-top: 4px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      }

      /* Status flag in player table - using emoji flags */
      .table-status-flag {
        font-size: 16px;
        cursor: help;
        display: inline-block;
        line-height: 1;
      }

      /* Next fixture + fixtures strip */
      .player-card .fixture {
        font-size: 11px;
        color: #6f2dbd; /* purple */
        text-align: center;
        white-space: nowrap;
      }

      .player-card .fixture-next {
        font-weight: 800;
      }

      /* Put team | next fixture | price on one centered row */
      .player-card .info {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        column-gap: 6px;
      }

      .player-card .info .team {
        justify-self: start;
      }

      .player-card .info .next-fixture {
        justify-self: center;
        font-size: 11px;
        font-weight: 800;
        color: #6f2dbd; /* purple */
        white-space: nowrap;
      }

      .player-card .info .price {
        justify-self: end;
      }

      .player-card .future-fixtures {
        margin-top: 4px;
        padding: 3px 4px;
        border-top: 1px solid rgba(0,0,0,0.12);
        display: flex;
        justify-content: center;
        gap: 8px;
        flex-wrap: nowrap;
      }

      .player-card .future-fixtures .fixture {
        font-size: 10px;
        font-weight: 600;
        opacity: 0.95;
      }

      /* Chip container - positioned at top center of pitch */
      .chip-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        justify-content: center;
        z-index: 10;
      }

      /* Chip indicator - shown when chip is selected */
      .chip-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: rgba(255, 153, 0, 0.95);
        border: 2px solid #ff9800;
        border-radius: 8px;
        font-weight: bold;
        font-size: 13px;
        color: white;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        animation: chipPulse 2s ease-in-out infinite;
      }

      @keyframes chipPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }

      .chip-icon {
        font-size: 18px;
      }

      .chip-name {
        font-weight: 700;
        letter-spacing: 0.5px;
      }

      .chip-gw {
        background: rgba(0, 0, 0, 0.3);
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
      }

      /* Chip button */
      .chip-btn {
        padding: 10px 16px;
        background: #00ff87;
        color: #37003c;
        border: 2px solid #00ff87;
        border-radius: 6px;
        font-weight: bold;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        white-space: nowrap;
      }

      .chip-btn:hover {
        background: #00e676;
        border-color: #00e676;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
      }

      .chip-btn-active {
        background: #ff9800;
        border-color: #f57c00;
        color: white;
      }

      .chip-btn-active:hover {
        background: #f57c00;
        border-color: #e65100;
      }

      /* Chip buttons row - container for multiple chip buttons */
      .chip-buttons-row {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        grid-template-rows: repeat(2, 1fr);
        gap: 6px;
      }

      /* Smaller chip buttons for multiple chips */
      .chip-btn-small {
        padding: 6px 10px;
        background: #00ff87;
        color: #37003c;
        border: 2px solid #00ff87;
        border-radius: 5px;
        font-weight: bold;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        white-space: nowrap;
        min-width: 80px;
        text-align: center;
      }

      .chip-btn-small:hover {
        background: #00e676;
        border-color: #00e676;
        transform: translateY(-1px);
        box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
      }

      .chip-btn-small.chip-btn-active {
        background: #ff9800;
        border-color: #f57c00;
        color: white;
      }

      .chip-btn-small.chip-btn-active:hover {
        background: #f57c00;
        border-color: #e65100;
      }

      /* Used/disabled chip buttons - crossed out appearance */
      .chip-btn-small.chip-btn-used {
        background: #cccccc;
        border-color: #999999;
        color: #666666;
        cursor: not-allowed;
        text-decoration: line-through;
        opacity: 0.6;
      }

      .chip-btn-small.chip-btn-used:hover {
        background: #cccccc;
        border-color: #999999;
        transform: none;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }

      .chip-btn-small:disabled {
        cursor: not-allowed;
      }

      /* Mobile adjustments for chip UI */
      @media (max-width: 768px) {
        .chip-indicator {
          padding: 6px 10px;
          font-size: 11px;
        }

        .chip-icon {
          font-size: 14px;
        }

        .chip-btn {
          padding: 8px 12px;
          font-size: 12px;
        }

        .chip-btn-small {
          padding: 5px 8px;
          font-size: 10px;
          min-width: 70px;
        }

        .chip-buttons-row {
          gap: 4px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Bank input should be editable and reflect state.bank
  const bankInput = document.getElementById('bankInput');
  if (bankInput) {
    bankInput.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v < 0) {
        e.target.value = state.bank.toFixed(1);
        return;
      }
      state.bank = v;
      updateUI();
    });
  }

  // Price mode dropdown should update player card prices
  const pm = document.getElementById('priceModeSelect');
  if (pm) {
    pm.addEventListener('change', (e) => {
      state.priceMode = e.target.value;
      updateUI();
    });
  }

  // Expose nav + actions used by inline onclicks in index.html
  window.changeGW = changeGW;
  window.removePlayer = (playerId, source) => removePlayer(playerId, source, updateUI);
  window.reinstatePlayer = (playerId) => reinstatePlayer(playerId, updateUI);
  window.substitutePlayer = (playerId) => substitutePlayer(playerId, updateUI);
  window.addSelectedToSquad = () => addSelectedToSquad(updateUI);
  window.cancelTransfer = () => cancelTransfer(updateUI);
  window.importTeam = importTeam;
  window.localSave = localSave;
  window.localLoad = localLoad;
  window.saveTeam = saveTeam;
  window.loadTeam = loadTeam;
  window.undoLastAction = undoLastAction;
  window.resetToImportedTeam = resetToImportedTeam;
  window.setCaptain = setCaptain;
  window.setViceCaptain = setViceCaptain;

  // Expose chip selection function
  window.selectChip = (chipType) => selectChip(chipType, updateUI);

  // Setup sidebar event handlers
  setupSidebarHandlers();

  updateUI();
}
