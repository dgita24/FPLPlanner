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

    await loadFixturesData();
    renderFixtures();
    populateFilters();
    renderTable();
  } else {
    console.error('Failed to load FPL data');
  }
}

// DELAY initUI until DOM + window.onload (fixes onclick binding)
window.addEventListener('load', () => {
  init();
});
