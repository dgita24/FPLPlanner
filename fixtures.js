import { state } from './data.js';
import { MIN_GAMEWEEK, MAX_GAMEWEEK } from './constants.js';

// Note: We can't import updateUI and syncPitchGWFromFixtures here directly due to circular dependencies
// (ui-init imports from fixtures, and fixtures would import from ui-init)
// Instead, we use the window object for these cross-module callbacks
// This is acceptable for UI event handlers that need to coordinate between modules

const fixturesByGW = new Map();
let fixturesGW = null;
let fixturesSyncEnabled = false; // Sync fixtures GW with pitch GW

export async function loadFixturesData() {
  try {
    // Load sync state from localStorage
    loadSyncState();
    
    const res = await fetch('/api/fpl/fixtures');
    
    if (!res.ok) {
      console.error(`Failed to load fixtures: HTTP ${res.status}`);
      renderFixturesError(`Unable to load fixtures (HTTP ${res.status})`);
      return;
    }

    const data = await res.json();

    fixturesByGW.clear();

    for (const f of data) {
      if (!f.event) continue;
      if (!fixturesByGW.has(f.event)) {
        fixturesByGW.set(f.event, []);
      }
      fixturesByGW.get(f.event).push(f);
    }

    // Default to showing next gameweek's fixtures for planning
    const events = state.bootstrap?.events || [];
    const next = events.find(e => e.is_next)?.id;
    const current = events.find(e => e.is_current)?.id;
    fixturesGW = next || current || state.currentGW;
    
    // If sync is enabled and viewingGW is set, use the pitch's viewing GW
    if (fixturesSyncEnabled && state.viewingGW !== null && state.viewingGW !== undefined) {
      fixturesGW = state.viewingGW;
    }
    
    renderFixtures();
  } catch (error) {
    console.error('Error loading fixtures:', error);
    renderFixturesError('Unable to load fixtures. Please check your connection.');
  }
}

window.changeFixturesGW = function (delta) {
  const newGW = Math.max(MIN_GAMEWEEK, Math.min(MAX_GAMEWEEK, fixturesGW + delta));
  fixturesGW = newGW;
  
  // If sync is enabled, also update the pitch GW
  if (fixturesSyncEnabled && window.syncPitchGWFromFixtures) {
    window.syncPitchGWFromFixtures(newGW);
  } else {
    renderFixtures();
  }
};

window.toggleFixturesSync = function () {
  fixturesSyncEnabled = !fixturesSyncEnabled;
  
  // Persist to localStorage
  try {
    localStorage.setItem('fplplanner-fixtures-sync', JSON.stringify(fixturesSyncEnabled));
  } catch (e) {
    console.error('Failed to save fixtures sync state:', e);
  }
  
  // If sync is turned ON, sync fixtures GW to current pitch GW
  if (fixturesSyncEnabled) {
    fixturesGW = state.viewingGW;
  }
  
  renderFixtures();
  
  // Update the pitch UI to reflect sync state
  if (window.updateUI) {
    window.updateUI();
  }
};

// Function to get current fixtures GW (for sync purposes)
export function getFixturesGW() {
  return fixturesGW;
}

// Function to set fixtures GW from external sources (e.g., pitch navigation)
export function setFixturesGW(gw) {
  fixturesGW = gw;
  renderFixtures();
}

// Function to check if sync is enabled
export function isFixturesSyncEnabled() {
  return fixturesSyncEnabled;
}

// Load sync state from localStorage on module init
function loadSyncState() {
  try {
    const saved = localStorage.getItem('fplplanner-fixtures-sync');
    if (saved !== null) {
      fixturesSyncEnabled = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load fixtures sync state:', e);
  }
}

export function renderFixtures() {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  const fixtures = fixturesByGW.get(fixturesGW) || [];

  const groups = groupByDate(fixtures);
  const hasFixtures = Object.keys(groups).length > 0;

  panel.innerHTML = `
    <div class="fixtures-controls">
      <div class="fixtures-button-grid">
        <button class="fixtures-control-btn import-save-btn" onclick="toggleSidebarMenu()">Menu/Login</button>
        <button class="fixtures-control-btn donate-btn" onclick="donatePlaceholder()">💝 Donate</button>
        
        <div class="bank-display">
          <span>Bank</span>
          <input type="number" id="bankInput" value="${state.bank.toFixed(1)}" step="0.1" />
          <span>m</span>
        </div>
        <button class="fixtures-control-btn local-btn" onclick="localLoad()">📂 Local Load</button>
        
        <div class="price-toggle">
          <span>Prices</span>
          <select id="priceModeSelect">
            <option value="selling" ${state.priceMode === 'selling' ? 'selected' : ''}>Selling</option>
            <option value="purchase" ${state.priceMode === 'purchase' ? 'selected' : ''}>Purchase</option>
            <option value="current" ${state.priceMode === 'current' ? 'selected' : ''}>Current</option>
          </select>
        </div>
        <button class="fixtures-control-btn local-btn" onclick="localSave()">💾 Local Save</button>
        
        <button class="fixtures-control-btn" onclick="resetToImportedTeam()">⏮️ Reset</button>
        <button class="fixtures-control-btn" onclick="toggleHelpModal()">❓ Help</button>
      </div>
    </div>

    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>

    ${hasFixtures 
      ? Object.entries(groups)
          .map(([date, games]) => `
            <div class="fixture-date-banner">${date}</div>
            ${games.map(renderFixtureRow).join('')}
          `)
          .join('')
      : '<div style="text-align: center; padding: 20px; opacity: 0.7;">No fixtures available for this gameweek</div>'
    }
  `;

  // Always reattach event listeners after rendering
  reattachFixturesControls();
}

function reattachFixturesControls() {
  const bankInput = document.getElementById('bankInput');
  if (bankInput) {
    bankInput.addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!Number.isFinite(v) || v < 0) {
        e.target.value = state.bank.toFixed(1);
        return;
      }
      state.bank = v;
      // Trigger updateUI if available globally
      if (window.updateUI) {
        window.updateUI();
      }
    });
  }

  const pm = document.getElementById('priceModeSelect');
  if (pm) {
    pm.addEventListener('change', (e) => {
      state.priceMode = e.target.value;
      // Trigger updateUI if available globally
      if (window.updateUI) {
        window.updateUI();
      }
    });
  }
}

function renderFixturesError(message) {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="fixtures-header">
      <strong>Fixtures</strong>
    </div>
    <div style="text-align: center; padding: 20px; color: #ff6b6b;">
      ${message}
    </div>
  `;
}

function renderFixtureRow(f) {
  const home = getTeam(f.team_h);
  const away = getTeam(f.team_a);

  let centreDisplay;

  if (f.finished && f.team_h_score !== null && f.team_a_score !== null) {
    centreDisplay = `${f.team_h_score}–${f.team_a_score}`;
  } else {
    centreDisplay = f.kickoff_time
      ? new Date(f.kickoff_time).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      : '';
  }

  return `
    <div class="fixture-row">
      <div class="team home">
        <span class="team-name">${home.name}</span>
        <img class="team-badge" src="${home.badge}" />
      </div>

      <div class="ko">${centreDisplay}</div>

      <div class="team away">
        <img class="team-badge" src="${away.badge}" />
        <span class="team-name">${away.name}</span>
      </div>
    </div>
  `;
}

function groupByDate(fixtures) {
  const groups = {};
  for (const f of fixtures) {
    if (!f.kickoff_time) continue;

    const d = new Date(f.kickoff_time);
    const label = d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    groups[label] ??= [];
    groups[label].push(f);
  }
  return groups;
}

function getTeam(teamId) {
  const t = state.teams.find(team => team.id === teamId);
  return {
    name: t ? t.name : '?',
    badge: t
      ? `https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`
      : ''
  };
}
