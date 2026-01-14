// ui-init.js - Initializes all UI-related event listeners and dependencies

import { state, history, loadTeamEntry } from './data.js';
import { setupSidebarHandlers, closeSidebar } from './ui-sidebar.js';
import { showMessage, renderPitch, renderBench, ensureFixturesForView } from './ui-render.js';
import { renderFixtures } from './fixtures.js';
import { cancelTransfer, substitutePlayer, addSelectedToSquad, removePlayer, resetTransferState, isPendingTransfer, getBatchTransferInfo } from './team-operations.js';
import { setPendingSwap } from './ui-render.js';

function updateUI() {
  // kick off fixture loads for current viewing window (async)
  ensureFixturesForView();

  // Show the GW being viewed/planned
  const gwEl = document.getElementById('currentGWDisplay');
  if (gwEl) gwEl.textContent = state.viewingGW;

  const prevBtn = document.getElementById('prevGW');
  const nextBtn = document.getElementById('nextGW');
  if (prevBtn) prevBtn.disabled = state.viewingGW <= state.currentGW;
  if (nextBtn) nextBtn.disabled = state.viewingGW >= state.currentGW + 7;

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
      batchStatus.textContent = `${batchInfo.removedCount} player${batchInfo.removedCount > 1 ? 's' : ''} removed - add replacement${batchInfo.removedCount > 1 ? 's' : ''}`;
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
  const maxGW = state.currentGW + 7;

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
      `Imported from GW${importedGW} (GW${state.currentGW} not public yet).`,
      'success'
    );
  } else {
    showMessage(`Team imported for GW${state.currentGW}.`, 'success');
  }

  // Always show/planning the active GW after import
  state.viewingGW = state.currentGW;

  // reset transient UI state
  resetTransferState();

  // Close the menu after import
  closeSidebar();

  updateUI();
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

export function initUI() {
  // Inject CSS for two-click swap highlight + fixture UI (no index.html change needed)
  if (!document.getElementById('plannerInjectedStyle')) {
    const style = document.createElement('style');
    style.id = 'plannerInjectedStyle';
    style.textContent = `
      .player-card.pending-swap {
        outline: 3px solid #00ff87;
        box-shadow: 0 0 0 3px rgba(0, 255, 135, 0.25);
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

  // Setup sidebar event handlers
  setupSidebarHandlers();

  updateUI();
}
