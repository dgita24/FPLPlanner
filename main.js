// main.js - App initialization
import { loadBootstrap, state } from './data.js';
import { renderTable, populateFilters } from './table.js';

async function init() {
  console.log('FPLPlanner starting...');
  const success = await loadBootstrap();
  if (success) {
    console.log(`App ready! GW ${state.currentGW}, ${state.elements.length} players`);
    document.getElementById('currentGWDisplay').textContent = state.currentGW;
    populateFilters();
    renderTable();
  } else {
    console.error('Failed to load FPL data');
  }
}

document.addEventListener('DOMContentLoaded', init);

