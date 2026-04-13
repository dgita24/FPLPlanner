// main.js - App initialization
import { loadBootstrap, state, normalizePlanPrices, ensureFreeTransfersByGW, ensureHistoricallyUsedChips, recomputeFreeTransfersFromGW } from './data.js';
import { renderTable, populateFilters } from './table.js';
import { initUI } from './ui.js';
import { loadFixturesData, renderFixtures } from './fixtures.js';
import { initFixturePlanner } from './fixture-planner.js';

async function init() {
  console.log('FPLPlanner starting...');

  // CRITICAL: Initialize UI FIRST (binds window.toggleSidebarMenu etc.)
  initUI();
  initFixturePlanner();

  const success = await loadBootstrap();

  if (success) {
    console.log(`App ready! GW ${state.currentGW}, ${state.elements.length} players`);

    // Restore auto-saved team from localStorage.
    // This MUST happen after loadBootstrap() because loadBootstrap() calls initEmptyPlan()
    // which wipes state.plan. Restoring here ensures the saved team survives bootstrap.
    try {
      const saved = localStorage.getItem('fplplanner-state');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.plan && Object.values(data.plan).some(gw => gw?.starting?.length > 0)) {
          state.plan = data.plan;
          normalizePlanPrices(state.plan);
          state.bank = data.bank;
          state.viewingGW = data.viewingGW;
          state.minNavigableGW = data.minNavigableGW ?? data.viewingGW;
          state.priceMode = data.priceMode;
          state.freeTransfersByGW = data.freeTransfersByGW || {};
          state.historicallyUsedChips = data.historicallyUsedChips || {};
          ensureFreeTransfersByGW();
          ensureHistoricallyUsedChips();
          recomputeFreeTransfersFromGW(state.viewingGW);

          // Mark that current plan came from localStorage, not a fresh import.
          // importTeam() will clear this flag after a successful import.
          state._restoredFromLocalStorage = true;

          // Show persistent banner prompting user to import their team,
          // since managerId is not saved to localStorage
          if (!state.managerId) {
            const banner = document.getElementById('import-banner');
            if (banner) banner.style.display = 'block';
          }
        }
      }
    } catch (e) {
      // silently fail - localStorage might be unavailable
    }

    await loadFixturesData();
    renderFixtures();
    populateFilters();
    renderTable();

    // Re-render pitch with the (potentially restored) state after all data is ready
    if (window.updateUI) window.updateUI();
  } else {
    console.error('Failed to load FPL data');
  }
}

// DELAY initUI until DOM + window.onload (fixes onclick binding)
window.addEventListener('load', () => {
  init();
});
