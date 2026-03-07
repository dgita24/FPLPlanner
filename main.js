// main.js - App initialization
import { loadBootstrap, state } from './data.js';
import { renderTable, populateFilters } from './table.js';
import { initUI } from './ui.js';
import { loadFixturesData, renderFixtures } from './fixtures.js';

async function init() {
  console.log('FPLPlanner starting...');

  // CRITICAL: Initialize UI FIRST (binds window.toggleSidebarMenu etc.)
  initUI();

  const success = await loadBootstrap();

  if (success) {
    console.log(`App ready! GW ${state.currentGW}, ${state.elements.length} players`);

    // Auto-restore any previously saved session so team survives page refresh
    tryRestoreSession();

    await loadFixturesData();
    renderFixtures();
    populateFilters();
    renderTable();
  } else {
    console.error('Failed to load FPL data');
  }
}

// Restore the last auto-saved state from localStorage (silently, no toasts)
function tryRestoreSession() {
  try {
    const saved = localStorage.getItem('fplplanner-state');
    if (!saved) return;
    const data = JSON.parse(saved);
    // Only restore if there's a meaningful plan (at least one GW with players)
    const hasPlan = data.plan && Object.values(data.plan).some(
      gw => gw != null &&
        ((Array.isArray(gw.starting) && gw.starting.length > 0) ||
         (Array.isArray(gw.bench) && gw.bench.length > 0))
    );
    if (!hasPlan) return;
    state.plan = data.plan;
    state.bank = data.bank ?? state.bank;
    state.viewingGW = data.viewingGW ?? state.viewingGW;
    state.minNavigableGW = data.minNavigableGW ?? state.viewingGW;
    state.priceMode = data.priceMode ?? state.priceMode;
    if (window.updateUI) window.updateUI();
  } catch (e) {
    console.warn('Session restore failed:', e);
  }
}

// DELAY initUI until DOM + window.onload (fixes onclick binding)
window.addEventListener('load', () => {
  init();
});
