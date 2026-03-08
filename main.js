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

    // Restore auto-saved team from localStorage.
    // This MUST happen after loadBootstrap() because loadBootstrap() calls initEmptyPlan()
    // which wipes state.plan. Restoring here ensures the saved team survives bootstrap.
    try {
      const saved = localStorage.getItem('fplplanner-state');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.plan && Object.values(data.plan).some(gw => gw?.starting?.length > 0)) {
          state.plan = data.plan;
          state.bank = data.bank;
          state.viewingGW = data.viewingGW;
          state.minNavigableGW = data.minNavigableGW ?? data.viewingGW;
          state.priceMode = data.priceMode;

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
