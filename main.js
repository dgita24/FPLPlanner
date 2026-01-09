// main.js - App initialization
import { loadBootstrap, state } from './data.js';
import { renderTable, populateFilters } from './table.js';
import { initUI } from './ui.js';

async function init() {
  console.log('FPLPlanner starting...');

  const success = await loadBootstrap();

  if (success) {
    console.log(`App ready! GW ${state.currentGW}, ${state.elements.length} players`);

    initUI();
    populateFilters();
    renderTable();
  } else {
    console.error('Failed to load FPL data');
  }
}

document.addEventListener('DOMContentLoaded', init);
