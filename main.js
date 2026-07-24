// main.js - App initialization
import { loadBootstrap, state, normalizePlanPrices, ensureFreeTransfersByGW, ensureHistoricallyUsedChips, recomputeFreeTransfersFromGW, getBootstrapPlanningGW } from './data.js';
import { renderTable, populateFilters } from './table.js';
import { initUI } from './ui.js';
import { loadFixturesData, renderFixtures } from './fixtures.js';
import { initFixturePlanner } from './fixture-planner.js';
import { showMessage } from './ui-render.js';

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

        // ── Season compatibility guard ────────────────────────────────────────
        // Saved state from a previous season must not be restored — it would
        // show stale players and lock the app to the old season's GW.
        //
        // Two detection paths:
        //  1. Explicit marker mismatch: the saved state carries a seasonMarker
        //     that differs from the current bootstrap marker.  This is the
        //     reliable path once the app has written at least one save with the
        //     new format (ui-init.js now includes seasonMarker in every write).
        //  2. Legacy heuristic: saved state has no seasonMarker (written before
        //     this fix), the bootstrap is at GW1/GW2 (very start of new season),
        //     and the saved viewingGW is well above GW1 — strong signal that the
        //     save belongs to the prior season (e.g. the user left the app on
        //     GW38 of last season, the season marker feature was deployed, and
        //     they now revisit at the start of the new season).
        const bootstrapPlanningGW = getBootstrapPlanningGW();
        const savedSeasonMarker = data.seasonMarker;
        const currentSeasonMarker = state.seasonMarker;

        const explicitSeasonMismatch =
          savedSeasonMarker && currentSeasonMarker &&
          savedSeasonMarker !== currentSeasonMarker;

        const likelyStaleNoMarker =
          !savedSeasonMarker &&
          bootstrapPlanningGW <= 2 &&
          (data.viewingGW ?? 1) > 5;

        if (explicitSeasonMismatch || likelyStaleNoMarker) {
          console.log('Stale cross-season state detected in localStorage — discarding.');
          state.seasonRolloverDetected = true;
          state.seasonRolloverMessage = state.seasonRolloverMessage ||
            'New FPL season detected. Local planner cache was reset. Please import your team to continue.';
          try { localStorage.removeItem('fplplanner-state'); } catch (_) {}
        } else if (data.plan && Object.values(data.plan).some(gw => gw?.starting?.length > 0)) {
          state.plan = data.plan;
          normalizePlanPrices(state.plan);
          state.bank = data.bank;
          state.viewingGW = data.viewingGW;
          state.minNavigableGW = data.minNavigableGW ?? data.viewingGW;
          state.priceMode = data.priceMode;
          state.freeTransfersByGW = data.freeTransfersByGW || {};
          state.historicallyUsedChips = data.historicallyUsedChips || {};

          // Clamp restored viewingGW forward so stale localStorage can never
          // drag the app back to an older gameweek than bootstrap indicates.
          if (state.viewingGW < bootstrapPlanningGW) {
            console.log(`Clamping stale viewingGW ${state.viewingGW} → ${bootstrapPlanningGW}`);
            state.viewingGW = bootstrapPlanningGW;
          }
          // Ensure minNavigableGW is never behind bootstrap planning GW.
          // Use a safe fallback in case the saved value was missing/undefined.
          const restoredMin = state.minNavigableGW ?? state.viewingGW;
          state.minNavigableGW = Math.max(restoredMin, bootstrapPlanningGW);

          ensureFreeTransfersByGW();
          ensureHistoricallyUsedChips();
          recomputeFreeTransfersFromGW(state.viewingGW);

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

    if (state.seasonRolloverDetected) {
      const banner = document.getElementById('import-banner');
      if (banner) {
        const text = banner.querySelector('span');
        if (text) text.textContent = state.seasonRolloverMessage;
        banner.style.display = 'block';
      }
      showMessage('New season detected. Local cache reset — import your team to continue.', 'info');
    }
  } else {
    console.error('Failed to load FPL data');
  }
}

// DELAY initUI until DOM + window.onload (fixes onclick binding)
window.addEventListener('load', () => {
  init();
});
