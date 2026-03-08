// ui-init.js - Initializes all UI-related event listeners and dependencies

import { state, history, loadTeamEntry } from './data.js';
import { setupSidebarHandlers, closeSidebar, toggleSidebarMenu } from './ui-sidebar.js';
import { showMessage, renderPitch, renderBench, ensureFixturesForView } from './ui-render.js';
import { renderFixtures, setFixturesGW, isFixturesSyncEnabled } from './fixtures.js';
import { cancelTransfer, substitutePlayer, addSelectedToSquad, removePlayer, resetTransferState, isPendingTransfer, getBatchTransferInfo, reinstatePlayer, selectChip } from './team-operations.js';
import { setPendingSwap } from './ui-render.js';
import { setDefaultSort } from './table.js';
import { MAX_GAMEWEEK, MAX_DRAFTS_PER_MANAGER } from './constants.js';

// Global selected draft tracker
let selectedDraft = null;

// Tracks the draft chosen for overwrite from the save card
let selectedOverwriteDraft = null;

// Promise resolver for the delete draft modal
let _deleteDraftResolve = null;

// Show the delete-draft confirmation modal; returns a Promise that resolves with
// the entered password string, or null if the user cancelled.
function showDeleteDraftModal(teamid) {
  const modal = document.getElementById('deleteDraftModal');
  const msgEl = document.getElementById('deleteDraftModalMessage');
  const pwdEl = document.getElementById('deleteDraftPassword');
  if (!modal || !msgEl || !pwdEl) {
    // Fallback to native prompt if modal elements are missing
    return Promise.resolve(prompt(`Enter the password for draft "${teamid}" to confirm deletion:\n\nThis action cannot be undone.`));
  }
  msgEl.textContent = `Enter the password for draft "${teamid}" to confirm deletion. This action cannot be undone.`;
  pwdEl.value = '';
  modal.classList.add('open');
  pwdEl.focus();

  // Allow pressing Enter to confirm
  function onKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); window._confirmDeleteDraft(); }
    if (e.key === 'Escape') { e.preventDefault(); window._cancelDeleteDraft(); }
  }
  pwdEl.addEventListener('keydown', onKeyDown);

  return new Promise(resolve => {
    _deleteDraftResolve = (value) => {
      pwdEl.removeEventListener('keydown', onKeyDown);
      modal.classList.remove('open');
      _deleteDraftResolve = null;
      resolve(value);
    };
  });
}

// Exposed to inline onclick handlers in index.html
window._cancelDeleteDraft = function () {
  if (_deleteDraftResolve) _deleteDraftResolve(null);
};

window._confirmDeleteDraft = function () {
  const pwd = document.getElementById('deleteDraftPassword')?.value ?? '';
  if (_deleteDraftResolve) _deleteDraftResolve(pwd);
};

// Helper function for pluralization
function pluralize(word, count) {
  return count === 1 ? word : word + 's';
}

// Toggle expandable cards
function toggleCard(cardId) {
  const card = document.getElementById(cardId);
  const clickedCard = event.currentTarget;
  const allActionCards = document.querySelectorAll('.action-card');
  const allExpandableCards = document.querySelectorAll('.expandable-card');
  
  // Check if card is currently visible
  const isVisible = card.style.display === 'block';
  
  // Hide all expandable cards
  allExpandableCards.forEach(c => {
    c.style.display = 'none';
  });
  
  // Remove active state from all action cards
  allActionCards.forEach(ac => ac.classList.remove('active'));
  
  // Toggle the clicked card
  if (!isVisible) {
    card.style.display = 'block';
    clickedCard.classList.add('active');

    // Refresh drafts list whenever the drafts card is opened
    if (cardId === 'draftsCard') {
      populateSavedTeamsDropdown();
    }
  }
}

// Select a draft for loading
function selectDraft(teamid) {
  selectedDraft = teamid;
  
  // Update visual selection
  document.querySelectorAll('#savedDraftsContainer li').forEach(li => {
    if (li.querySelector('span').textContent.trim() === '• ' + teamid) {
      li.classList.add('selected');
    } else {
      li.classList.remove('selected');
    }
  });

  // Ensure the load section (password + button) is visible and ready for input
  const loadSection = document.getElementById('loadSection');
  const loadPassword = document.getElementById('loadPassword');
  if (loadSection) loadSection.style.display = 'block';
  if (loadPassword) {
    loadPassword.value = '';
    loadPassword.focus();
  }
}

// Editable mobile bank display
window.editMobileBank = function() {
  const el = document.getElementById('mobileBankDisplay');
  if (!el || el.querySelector('input')) return; // already editing

  const currentVal = Number(state.bank).toFixed(1);
  el.innerHTML = '';
  el.onclick = null; // prevent re-triggering

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '0.1';
  input.value = currentVal;
  input.className = 'mobile-bank-input';

  el.appendChild(document.createTextNode('£'));
  el.appendChild(input);
  el.appendChild(document.createTextNode('m'));

  input.focus();
  input.select();

  function finishEdit() {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && v >= 0) {
      state.bank = v;
    }
    el.textContent = '£' + Number(state.bank).toFixed(1) + 'm';
    el.onclick = function() { window.editMobileBank(); };
    updateUI();
  }

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { input.blur(); }
    if (e.key === 'Escape') {
      input.value = currentVal;
      input.blur();
    }
  });
};

// Export updateUI for use in other modules
export function updateUI() {
  // kick off fixture loads for current viewing window (async)
  ensureFixturesForView();

  // Show the GW being viewed/planned
  const gwEl = document.getElementById('currentGWDisplay');
  if (gwEl) gwEl.textContent = state.viewingGW;

  // Update mobile GW display
  const mobileGWEl = document.getElementById('mobileGWDisplay');
  if (mobileGWEl) mobileGWEl.textContent = state.viewingGW;

  // Update mobile bank display
  const mobileBankEl = document.getElementById('mobileBankDisplay');
  if (mobileBankEl && !mobileBankEl.querySelector('input')) {
    mobileBankEl.textContent = `£${Number(state.bank).toFixed(1)}m`;
    mobileBankEl.onclick = function() { window.editMobileBank(); };
  }

  const prevBtn = document.getElementById('prevGW');
  const nextBtn = document.getElementById('nextGW');
  if (prevBtn) prevBtn.disabled = state.viewingGW <= state.minNavigableGW;
  if (nextBtn) nextBtn.disabled = state.viewingGW >= MAX_GAMEWEEK;

  // Update mobile GW nav button states
  const prevBtnMobile = document.getElementById('prevGWMobile');
  const nextBtnMobile = document.getElementById('nextGWMobile');
  if (prevBtnMobile) prevBtnMobile.disabled = state.viewingGW <= state.minNavigableGW;
  if (nextBtnMobile) nextBtnMobile.disabled = state.viewingGW >= MAX_GAMEWEEK;

  // Update sync toggle visual state
  const syncToggle = document.getElementById('fixturesSyncToggle');
  if (syncToggle) {
    if (isFixturesSyncEnabled()) {
      syncToggle.classList.add('active');
      syncToggle.title = 'Sync ON: Fixtures follow gameweek';
    } else {
      syncToggle.classList.remove('active');
      syncToggle.title = 'Sync OFF: Independent navigation';
    }
  }

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

  // Auto-persist state to localStorage after every UI update,
  // but only when a team is actually loaded (avoid overwriting saved data with an empty plan)
  const hasTeam = state.plan && Object.values(state.plan).some(gw => gw?.starting?.length > 0);
  if (hasTeam) {
    try {
      const data = {
        plan: state.plan,
        bank: state.bank,
        viewingGW: state.viewingGW,
        minNavigableGW: state.minNavigableGW,
        priceMode: state.priceMode
      };
      localStorage.setItem('fplplanner-state', JSON.stringify(data));
    } catch (e) {
      // silently fail - localStorage might be full or disabled
    }
  }
}

// Helper function to change GW with validation
function setViewingGW(newGW) {
  // Use minNavigableGW as the minimum boundary (set after team import)
  const minGW = state.minNavigableGW;
  const maxGW = MAX_GAMEWEEK;

  let validGW = newGW;
  if (validGW < minGW) validGW = minGW;
  if (validGW > maxGW) validGW = maxGW;

  state.viewingGW = validGW;

  // cancel any in-progress swap when changing GW
  setPendingSwap(null);

  updateUI();
  renderFixtures();
}

// Helper to check for pending transfers and show message
function checkAndWarnPendingTransfer() {
  if (isPendingTransfer()) {
    showMessage('Finish the pending transfer (Add) or Cancel it first.', 'info');
    return true;
  }
  return false;
}

function changeGW(delta) {
  if (checkAndWarnPendingTransfer()) return;

  const next = state.viewingGW + delta;
  setViewingGW(next);

  // If fixtures sync is enabled, update fixtures GW to match
  if (isFixturesSyncEnabled()) {
    setFixturesGW(next);
  }
}

// Function to sync pitch GW from fixtures navigation (called when sync is ON)
// Export for use by fixtures module
export function syncPitchGWFromFixtures(newGW) {
  if (checkAndWarnPendingTransfer()) {
    // Revert fixtures GW back to match pitch
    setFixturesGW(state.viewingGW);
    return;
  }

  setViewingGW(newGW);
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

  // Store manager ID for syncing saved drafts
  state.managerId = teamId;

  // Dismiss the import prompt banner now that the team has been imported
  const importBanner = document.getElementById('import-banner');
  if (importBanner) importBanner.style.display = 'none';

  // Update team ID display in sidebar header
  const teamIdDisplay = document.getElementById('currentTeamId');
  if (teamIdDisplay && state.managerId) {
    teamIdDisplay.textContent = state.managerId;
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
  
  // Set minimum navigable GW to prevent going back before imported team
  state.minNavigableGW = state.viewingGW;

  // reset transient UI state
  resetTransferState();

  // Populate saved teams dropdown for this manager
  await populateSavedTeamsDropdown();

  // Close the menu after import
  closeSidebar();

  updateUI();
  
  // Set default sort to points (descending) after import
  setDefaultSort();
}

// Delete a saved draft
async function deleteDraft(teamid) {
  if (!state.managerId) {
    showMessage('No manager ID available. Import a team first.', 'error');
    return;
  }

  // Prompt for the password used to save this draft — required to confirm deletion
  const password = await showDeleteDraftModal(teamid);
  if (password === null) {
    // User cancelled
    return;
  }
  if (!password) {
    showMessage('Password is required to delete a draft.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/delete-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        teamid: teamid,
        managerid: state.managerId,
        password: password
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showMessage(`Draft "${teamid}" deleted successfully`, 'success');
      
      // Refresh the saved teams list
      await populateSavedTeamsDropdown();
    } else {
      throw new Error(result.error || 'Delete failed');
    }
  } catch (err) {
    showMessage(`Delete error: ${err.message}`, 'error');
  }
}

// Local Save/Load
function localSave() {
  try {
    const data = {
      plan: state.plan,
      bank: state.bank,
      viewingGW: state.viewingGW,
      minNavigableGW: state.minNavigableGW,
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
    state.minNavigableGW = data.minNavigableGW ?? state.viewingGW; // fallback for old saves
    state.priceMode = data.priceMode;
    updateUI();
    showMessage('Team loaded locally', 'success');
  } catch (e) {
    showMessage('Local load failed', 'error');
  }
}

// Saved teams list management - now fetches from cloud based on manager ID
function refreshSavedTeamsDropdown() {
  populateSavedTeamsDropdown();
}

async function populateSavedTeamsDropdown() {
  const container = document.getElementById('savedDraftsContainer');
  const draftCount = document.getElementById('draftCount');
  const loadSection = document.getElementById('loadSection');
  
  if (!container) {
    console.warn('Saved drafts container not found');
    return;
  }
  
  // Clear existing content
  container.innerHTML = '<p class="helper-text">Loading...</p>';
  
  // Only populate if we have a manager ID
  if (!state.managerId) {
    container.innerHTML = '<p class="helper-text">Import a team to see saved drafts</p>';
    if (draftCount) draftCount.textContent = '(0/5)';
    if (loadSection) loadSection.style.display = 'none';
    return;
  }
  
  try {
    // Fetch saved teams for this manager ID from the server
    const response = await fetch('/api/list-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerid: state.managerId })
    });
    
    if (!response.ok) {
      console.error('Failed to fetch saved drafts');
      container.innerHTML = '<p class="helper-text" style="color: var(--error);">Failed to load drafts</p>';
      return;
    }
    
    const result = await response.json();
    
    if (result.success && result.drafts && result.drafts.length > 0) {
      const count = result.drafts.length;
      if (draftCount) draftCount.textContent = `(${count}/5)`;
      
      let html = '<ul>';
      
      result.drafts.forEach(draft => {
        // Use JSON.stringify for safe JavaScript context escaping
        const jsEscaped = JSON.stringify(draft.teamid).slice(1, -1); // Remove surrounding quotes
        
        // Escape for HTML context (display text)
        const htmlEscaped = draft.teamid
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        
        html += `
          <li>
            <span onclick="selectDraft('${jsEscaped}')">• ${htmlEscaped}</span>
            <button 
              onclick="deleteDraft('${jsEscaped}')" 
              title="Delete ${htmlEscaped}"
              aria-label="Delete ${htmlEscaped}"
            >
              🗑️
            </button>
          </li>
        `;
      });
      
      html += '</ul>';
      container.innerHTML = html;
      
      if (loadSection) loadSection.style.display = 'block';
    } else {
      container.innerHTML = '<p class="helper-text">No saved drafts yet</p>';
      if (draftCount) draftCount.textContent = '(0/5)';
      if (loadSection) loadSection.style.display = 'none';
    }
  } catch (e) {
    console.error('Failed to load saved teams list:', e);
    container.innerHTML = '<p class="helper-text" style="color: var(--error);">Error loading drafts</p>';
  }
}

// Populate the overwrite list inside the save card
async function populateSaveCardOverwrite() {
  const container = document.getElementById('saveOverwriteContainer');
  if (!container) return;

  if (!state.managerId) {
    container.innerHTML = '<p class="helper-text">Import a team to see saved drafts</p>';
    return;
  }

  container.innerHTML = '<p class="helper-text">Loading...</p>';

  try {
    const response = await fetch('/api/list-drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ managerid: state.managerId })
    });

    if (!response.ok) {
      container.innerHTML = '<p class="helper-text" style="color: var(--error);">Failed to load drafts</p>';
      return;
    }

    const result = await response.json();

    if (result.success && result.drafts && result.drafts.length > 0) {
      let html = '<ul>';
      result.drafts.forEach(draft => {
        const htmlEscaped = draft.teamid
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        html += `
          <li data-teamid="${htmlEscaped}">
            <span>• ${htmlEscaped}</span>
          </li>
        `;
      });
      html += '</ul>';
      container.innerHTML = html;
    } else {
      container.innerHTML = '<p class="helper-text">No saved drafts yet</p>';
    }
  } catch (e) {
    container.innerHTML = '<p class="helper-text" style="color: var(--error);">Error loading drafts</p>';
  }
}

// Select a draft as the overwrite target in the save card
function selectOverwriteDraft(teamid) {
  selectedOverwriteDraft = teamid;

  // Update visual selection using data-teamid for reliable matching
  document.querySelectorAll('#saveOverwriteContainer li[data-teamid]').forEach(li => {
    if (li.dataset.teamid === teamid) {
      li.classList.add('selected');
    } else {
      li.classList.remove('selected');
    }
  });

  // Pre-fill the draft name field
  const saveTeamId = document.getElementById('saveTeamId');
  if (saveTeamId) saveTeamId.value = teamid;

  // Show overwrite indicator
  const indicator = document.getElementById('overwriteIndicator');
  if (indicator) {
    indicator.textContent = `⚠️ Overwriting: "${teamid}"`;
    indicator.style.display = 'block';
  }

  // Focus the password field for a smooth UX
  const savePassword = document.getElementById('savePassword');
  if (savePassword) savePassword.focus();
}

// Clear the overwrite selection when the user manually edits the draft name
function onSaveNameInput() {
  const saveTeamId = document.getElementById('saveTeamId');
  if (selectedOverwriteDraft && saveTeamId && saveTeamId.value.trim() !== selectedOverwriteDraft) {
    selectedOverwriteDraft = null;
    document.querySelectorAll('#saveOverwriteContainer li').forEach(li => li.classList.remove('selected'));
    const indicator = document.getElementById('overwriteIndicator');
    if (indicator) indicator.style.display = 'none';
  }
}

// Cloud Load
async function loadTeam() {
  const teamId = selectedDraft; // Use selected draft instead of input field
  const password = document.getElementById('loadPassword')?.value?.trim();

  if (!teamId) {
    showMessage('Please select a draft to load', 'error');
    return;
  }
  
  if (!password) {
    showMessage('Password required', 'error');
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
      state.minNavigableGW = data.payload.minNavigableGW ?? state.viewingGW;
      state.priceMode = data.payload.priceMode;

      updateUI();
      showMessage('Team loaded from cloud!', 'success');
      if (sideMsg) sideMsg.textContent = `✓ Loaded: ${data.label || teamId}`;

      closeSidebar();
    } else {
      throw new Error(result.error || 'Load failed');
    }
  } catch (err) {
    // ✅ Better: differentiate between wrong credentials vs other errors
    const errorMsg = err.message || 'Load failed';
    if (errorMsg.includes('not found') || errorMsg.includes('Invalid password')) {
      showMessage('Saved draft name and/or password incorrect', 'error');
    } else {
      showMessage(`Load error: ${errorMsg}`, 'error');
    }
    if (sideMsg) sideMsg.textContent = `Error: ${errorMsg}`;
  }
}
async function saveTeam() {
  const teamId = document.getElementById('saveTeamId')?.value?.trim();
  const password = document.getElementById('savePassword')?.value?.trim();
  const label = document.getElementById('saveLabel')?.value?.trim();

  if (!teamId || !password) {
    showMessage('Draft team name and/or password missing or incorrect.', 'error');
    return;
  }

  const sideMsg = document.getElementById('sideMsg');
  if (sideMsg) sideMsg.textContent = 'Saving...';

  try {
    const payload = {
      plan: state.plan,
      bank: state.bank,
      viewingGW: state.viewingGW,
      minNavigableGW: state.minNavigableGW,
      priceMode: state.priceMode
    };

    const response = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        teamid: teamId, 
        label, 
        password, 
        payload,
        managerid: state.managerId || null
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showMessage('Team saved to cloud!', 'success');
      if (sideMsg) sideMsg.textContent = `✓ Saved as: ${teamId}`;
      
      // Refresh saved teams list
      refreshSavedTeamsDropdown();
      
      // Close sidebar after successful save
      closeSidebar();
    } else {
      throw new Error(result.error || 'Save failed');
    }
  } catch (err) {
    const errorMsg = err.message || 'Unknown error';
    if (errorMsg.includes('Maximum draft limit')) {
      showMessage('⚠️ Draft limit reached (5/5). Update an existing draft or delete one first.', 'error');
    } else {
      showMessage(`Save error: ${errorMsg}`, 'error');
    }
    if (sideMsg) sideMsg.textContent = `Error: ${errorMsg}`;
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

  // Clear batch transfer state, removed/sold cards, and pending swaps (CRUCIAL LINE)
  resetTransferState();

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

// Touch/click handler for captain selector on mobile/tablet
function setupCaptainSelectorTouchHandlers() {
  // Detect if device is touch-capable
  function isTouchDevice() {
    return ('ontouchstart' in window) || 
           (navigator.maxTouchPoints > 0) || 
           (navigator.msMaxTouchPoints > 0) ||
           window.matchMedia('(pointer: coarse)').matches ||
           window.matchMedia('(max-width: 900px)').matches;
  }

  // Only add touch handlers on touch devices
  if (!isTouchDevice()) {
    return;
  }

  // Click handler for badge containers to toggle captain selector
  document.addEventListener('click', (e) => {
    // Check if click is on badge-container, player name, or club crest (badge)
    const badgeContainer = e.target.closest('.badge-container');
    const playerCard = e.target.closest('.player-card');
    
    // Allow triggering from badge-container, player name (.name), or club badge (.badge)
    const nameElement = e.target.closest('.player-card .name');
    const badgeElement = e.target.closest('.badge-container .badge');
    
    if (badgeContainer || (playerCard && (nameElement || badgeElement))) {
      // Get the badge container - either directly or from the player card
      const targetBadgeContainer = badgeContainer || (playerCard ? playerCard.querySelector('.badge-container') : null);
      
      if (!targetBadgeContainer) {
        return;
      }
      
      // Check if click is on a captain button - if so, let it execute normally
      const isCaptainBtn = e.target.closest('.captain-btn');
      if (isCaptainBtn) {
        // After the button click, remove all show-captain-options classes
        setTimeout(() => {
          document.querySelectorAll('.badge-container.show-captain-options').forEach(el => {
            el.classList.remove('show-captain-options');
          });
        }, 50);
        return;
      }

      // Toggle the captain selector for this badge container
      e.stopPropagation();
      
      // First, close any other open captain selectors
      document.querySelectorAll('.badge-container.show-captain-options').forEach(el => {
        if (el !== targetBadgeContainer) {
          el.classList.remove('show-captain-options');
        }
      });
      
      // Toggle this one
      targetBadgeContainer.classList.toggle('show-captain-options');
    } else {
      // Click outside - close all captain selectors
      document.querySelectorAll('.badge-container.show-captain-options').forEach(el => {
        el.classList.remove('show-captain-options');
      });
    }
  });
}

// Switch between mobile tabs (Pitch / Fixtures / Transfers / More)
function switchMobileTab(tab) {
  const allTabs = ['pitch', 'fixtures', 'transfers', 'more'];
  const isDesktop = window.innerWidth >= 769; // matches CSS @media (min-width: 769px)

  // Remove active state from all tab buttons
  allTabs.forEach((t) => {
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.remove('tab-active');
  });

  // Remove overlay class from panels
  const fixturesPanel = document.getElementById('fixturesPanel');
  const transferPanel = document.getElementById('transferPanel');
  if (fixturesPanel) fixturesPanel.classList.remove('mobile-panel-active');
  if (transferPanel) transferPanel.classList.remove('mobile-panel-active');

  // Activate the selected tab button
  const activeBtn = document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
  if (activeBtn) activeBtn.classList.add('tab-active');

  // Show the relevant panel overlay
  if (isDesktop && (tab === 'fixtures' || tab === 'transfers')) {
    // On desktop: show both panels side-by-side (each occupying half the screen)
    if (fixturesPanel) fixturesPanel.classList.add('mobile-panel-active');
    if (transferPanel) transferPanel.classList.add('mobile-panel-active');
  } else if (tab === 'fixtures' && fixturesPanel) {
    fixturesPanel.classList.add('mobile-panel-active');
  } else if (tab === 'transfers' && transferPanel) {
    transferPanel.classList.add('mobile-panel-active');
  }
  // 'pitch' and 'more' show default content (mainColumn)
}

export function initUI() {
  // Inject CSS for two-click swap highlight + placeholder cards
  if (!document.getElementById('plannerInjectedStyle')) {
    const style = document.createElement('style');
    style.id = 'plannerInjectedStyle';
    style.textContent = `
      .player-card.pending-swap {
        outline: 3px solid var(--success);
        box-shadow: 0 0 0 3px var(--success-light);
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
        background: var(--error-transparent);
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
        color: var(--success);
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

  // Expose nav + actions used by inline onclicks in index.html
  window.changeGW = changeGW;
  window.syncPitchGWFromFixtures = syncPitchGWFromFixtures;
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
  window.deleteDraft = deleteDraft;
  window.toggleCard = toggleCard;
  window.selectDraft = selectDraft;
  window.selectOverwriteDraft = selectOverwriteDraft;
  window.onSaveNameInput = onSaveNameInput;
  window.undoLastAction = undoLastAction;
  window.resetToImportedTeam = resetToImportedTeam;
  window.setCaptain = setCaptain;
  window.setViceCaptain = setViceCaptain;
  window.donatePlaceholder = () => showMessage('Donate feature coming soon! This is a placeholder for now.', 'info');
  window.closeSidebar = closeSidebar;
  window.changePriceMode = (value) => {
    state.priceMode = value;
    updateUI();
  };

  // Open sidebar and expand the cloud save card
  window.openCloudSave = function() {
    const sb = document.getElementById('sidebar');
    if (!sb || !sb.classList.contains('open')) {
      toggleSidebarMenu();
    }
    setTimeout(() => {
      document.querySelectorAll('.expandable-card').forEach(c => { c.style.display = 'none'; });
      document.querySelectorAll('.action-card').forEach(ac => ac.classList.remove('active'));
      const saveCard = document.getElementById('saveCard');
      if (saveCard) saveCard.style.display = 'block';

      // Reset overwrite state and form fields
      selectedOverwriteDraft = null;
      const saveTeamId = document.getElementById('saveTeamId');
      if (saveTeamId) saveTeamId.value = '';
      const savePassword = document.getElementById('savePassword');
      if (savePassword) savePassword.value = '';
      const indicator = document.getElementById('overwriteIndicator');
      if (indicator) indicator.style.display = 'none';

      // Refresh overwrite candidates
      populateSaveCardOverwrite();
    }, 100);
  };

  // Expose updateUI so it can be called from fixtures.js
  window.updateUI = updateUI;

  // Expose chip selection function
  window.selectChip = (chipType) => selectChip(chipType, updateUI);

  // Mobile tab navigation
  window.switchMobileTab = switchMobileTab;

  // Setup sidebar event handlers
  setupSidebarHandlers();

  // Setup touch/click handlers for captain selector on mobile
  setupCaptainSelectorTouchHandlers();

  // Delegated click handler for the overwrite list in the save card
  const overwriteContainer = document.getElementById('saveOverwriteContainer');
  if (overwriteContainer) {
    overwriteContainer.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-teamid]');
      if (li) selectOverwriteDraft(li.dataset.teamid);
    });
  }

  // Populate saved teams dropdown
  populateSavedTeamsDropdown();

  updateUI();
}
