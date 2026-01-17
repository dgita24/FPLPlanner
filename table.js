// table.js - Player table render/filter

import { state, loadFixtures } from './data.js';
import { shouldShowPlayerFlag } from './player-status-utils.js';

let tableSort = {
  key: null,      // 'price' | 'points' | 'goals_scored' | 'assists' | 'clean_sheets' | 'bonus' | 'transfers_in_event' | 'transfers_out_event' | 'selected_by_percent'
  dir: 'asc'      // 'asc' | 'desc'
};

const posNames = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Team badge URL template
const TEAM_BADGE_URL_TEMPLATE = 'https://resources.premierleague.com/premierleague/badges/70/t{code}.png';

// Current stat selection - single column
let currentStatView = 'points'; // 'points' | 'goals_scored' | 'assists' | 'clean_sheets' | 'bonus' | 'transfers_in_event' | 'transfers_out_event' | 'selected_by_percent'

// Stat column configuration - single filterable column
const statConfig = {
  points: { key: 'total_points', label: 'Pts', tooltip: 'Total Points' },
  goals_scored: { key: 'goals_scored', label: 'G', tooltip: 'Goals' },
  assists: { key: 'assists', label: 'A', tooltip: 'Assists' },
  clean_sheets: { key: 'clean_sheets', label: 'CS', tooltip: 'Clean Sheets' },
  bonus: { key: 'bonus', label: 'Bns', tooltip: 'Bonus Points' },
  transfers_in_event: { key: 'transfers_in_event', label: 'TI', tooltip: 'Transfers In (GW)' },
  transfers_out_event: { key: 'transfers_out_event', label: 'TO', tooltip: 'Transfers Out (GW)' },
  selected_by_percent: { key: 'selected_by_percent', label: 'Own%', tooltip: 'Ownership %' }
};

// Selected players (changed from single to multi-select)
window.selectedPlayerIds = window.selectedPlayerIds ?? [];

// Helper function to escape HTML attributes
function escapeHtml(text) {
  const map = {
    '"': '&quot;',
    "'": '&#39;',
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;'
  };
  return String(text).replace(/["'<>&]/g, m => map[m]);
}

// Helper function to get team badge URL
function getTeamBadgeUrl(teamCode) {
  return teamCode ? TEAM_BADGE_URL_TEMPLATE.replace('{code}', teamCode) : '';
}

// Helper function to format stat values
function formatStatValue(value, statKey) {
  if (value === null || value === undefined) {
    return '-';
  }
  if (statKey === 'selected_by_percent') {
    const numVal = parseFloat(value);
    return isNaN(numVal) ? '-' : numVal.toFixed(1) + '%';
  }
  return String(value);
}

// Cache sort icons for performance
let sortIcons = null;
function getSortIcons() {
  if (!sortIcons) {
    sortIcons = {
      price: document.getElementById('sortPriceIcon')
    };
  }
  return sortIcons;
}

/* ------------------------- FIXTURES (TABLE) -------------------------- */
// Cache fixtures per GW so typing in filters doesn't spam requests.
const fixturesByGW = new Map(); // gw -> fixtures[]
let fixturesLoadToken = 0;

function kickoffTimeValue(fx) {
  // kickoff_time is ISO string or null; null should sort last.
  if (!fx?.kickoff_time) return Number.POSITIVE_INFINITY;
  const t = Date.parse(fx.kickoff_time);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

// Pre-compiled regex for efficient character replacement in search
// Build a single regex pattern from all character mappings
const searchCharMap = {
  'ø': 'o', 'Ø': 'O',
  'å': 'a', 'Å': 'A',
  'æ': 'ae', 'Æ': 'AE',
  'é': 'e', 'É': 'E',
  'è': 'e', 'È': 'E',
  'ê': 'e', 'Ê': 'E',
  'ë': 'e', 'Ë': 'E',
  'á': 'a', 'Á': 'A',
  'à': 'a', 'À': 'A',
  'â': 'a', 'Â': 'A',
  'ä': 'a', 'Ä': 'A',
  'ã': 'a', 'Ã': 'A',
  'í': 'i', 'Í': 'I',
  'ì': 'i', 'Ì': 'I',
  'î': 'i', 'Î': 'I',
  'ï': 'i', 'Ï': 'I',
  'ó': 'o', 'Ó': 'O',
  'ò': 'o', 'Ò': 'O',
  'ô': 'o', 'Ô': 'O',
  'ö': 'o', 'Ö': 'O',
  'õ': 'o', 'Õ': 'O',
  'ú': 'u', 'Ú': 'U',
  'ù': 'u', 'Ù': 'U',
  'û': 'u', 'Û': 'U',
  'ü': 'u', 'Ü': 'U',
  'ý': 'y', 'Ý': 'Y',
  'ÿ': 'y', 'Ÿ': 'Y',
  'ñ': 'n', 'Ñ': 'N',
  'ç': 'c', 'Ç': 'C',
  'ß': 'ss',
  'ð': 'd', 'Ð': 'D',
  'þ': 'th', 'Þ': 'TH'
};

// Pre-compile regex pattern for performance (used on every keystroke)
const searchCharPattern = new RegExp('[' + Object.keys(searchCharMap).join('') + ']', 'g');

/**
 * Normalizes a string for search matching, handling both ASCII and non-ASCII characters.
 * Enables searching "Odegaard" to find "Ødegaard", "Haaland" to find "Haaland", etc.
 * 
 * @param {string} s - The string to normalize
 * @returns {string} - Normalized lowercase string with diacritics removed
 */
function foldForSearch(s) {
  let str = (s || '').toString();
  
  // Replace common non-ASCII characters using pre-compiled regex
  str = str.replace(searchCharPattern, (match) => searchCharMap[match] || match);
  
  // Then normalize and remove any remaining combining diacritics
  str = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  
  return str.toLowerCase().trim();
}

function bestFixtureForTeamInGW(teamId, fixtures) {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return null;
  const matches = fixtures.filter((f) => f && (f.team_h === teamId || f.team_a === teamId));
  if (matches.length === 0) return null;
  matches.sort((a, b) => kickoffTimeValue(a) - kickoffTimeValue(b));
  return matches[0]; // If DGW, pick the earliest kickoff
}

function getTeamShortName(teamId) {
  const t = state.teams.find((x) => x.id === teamId);
  return t ? (t.short_name || t.shortname || t.name) : '';
}

function formatOpponent(teamId, fixture) {
  if (!fixture) return '--';
  const isHome = fixture.team_h === teamId;
  const oppId = isHome ? fixture.team_a : fixture.team_h;
  const opp = getTeamShortName(oppId) || '???';
  return `${opp} (${isHome ? 'H' : 'A'})`;
}

function getNextFixturesForTeam(teamId, startGW, count = 4) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const gw = startGW + i;
    if (!fixturesByGW.has(gw)) {
      out.push('--');
      continue;
    }
    const list = fixturesByGW.get(gw);
    const fx = bestFixtureForTeamInGW(teamId, list);
    out.push(formatOpponent(teamId, fx));
  }
  return out;
}

function ensureFixturesForTable() {
  const token = ++fixturesLoadToken;
  const start = state.viewingGW;
  const needed = [start, start + 1, start + 2, start + 3]; // Next 4
  const missing = needed.filter((gw) => !fixturesByGW.has(gw));
  if (missing.length === 0) return;

  Promise.all(
    missing.map((gw) =>
      loadFixtures(gw)
        .then((fx) => fixturesByGW.set(gw, Array.isArray(fx) ? fx : []))
        .catch(() => fixturesByGW.set(gw, []))
    )
  ).then(() => {
    if (token !== fixturesLoadToken) return;
    renderTable(); // Re-render once fixtures arrive
  });
}

/* ------------------------- TABLE RENDER -------------------------- */

export function renderTable() {
  ensureFixturesForTable();

  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  // Initialize stat columns on first render
  if (isFirstRender) {
    initializeStatColumns();
    populateTeamFilter();
    isFirstRender = false;
  }

  const search = foldForSearch(document.getElementById('searchName')?.value || '');
  const posFilter = document.getElementById('filterPos')?.value || '';
  const teamFilter = document.getElementById('filterTeam')?.value || '';

  let filtered = state.elements.filter((player) => {
    const matchesSearch = foldForSearch(player.web_name || '').includes(search);
    const matchesPos = !posFilter || posNames[player.element_type] === posFilter;
    const matchesTeam = !teamFilter || String(player.team) === teamFilter;
    return matchesSearch && matchesPos && matchesTeam;
  });

  // -------- SORTING --------
  if (tableSort.key) {
    const dir = tableSort.dir === 'asc' ? 1 : -1;

    filtered = filtered.slice().sort((a, b) => {
      if (tableSort.key === 'price') {
        return dir * ((a.now_cost / 10) - (b.now_cost / 10));
      }

      // Handle stat columns
      const parseStatValue = (val) => {
        if (val == null) return 0;
        const num = parseFloat(val);
        return isNaN(num) ? 0 : num;
      };
      const aVal = parseStatValue(a[tableSort.key]);
      const bVal = parseStatValue(b[tableSort.key]);
      return dir * (aVal - bVal);
    });
  }

  // Get current stat column configuration
  const statCol = statConfig[currentStatView] || statConfig.points;

  // -------- RENDER --------
  tbody.innerHTML = filtered
    .map((player) => {
      const checked = window.selectedPlayerIds.includes(player.id) ? 'checked' : '';

      // Status flag for table - using circular badge similar to captain badges
      let statusFlagHtml = '';
      
      // Pass events array for date-based suspension parsing
      const events = state.bootstrap?.events || [];
      if (shouldShowPlayerFlag(player, state.viewingGW, state.currentGW, events)) {
        const isDoubtful = player.status === 'd';
        
        // For red flags (suspended/injured/unavailable): show "0"
        // For yellow flags (doubtful): show chance of playing percentage
        let badgeText = '0';
        let badgeClass = 'red';
        
        if (isDoubtful) {
          badgeClass = 'yellow';
          // Use chance_of_playing_this_round for the viewing gameweek
          const chanceOfPlaying = state.viewingGW === state.currentGW 
            ? player.chance_of_playing_this_round 
            : state.viewingGW === state.currentGW + 1 
              ? player.chance_of_playing_next_round 
              : null;
          
          // Show 25, 50, or 75 based on chance_of_playing
          if (chanceOfPlaying !== null && chanceOfPlaying !== undefined) {
            if (chanceOfPlaying <= 25) badgeText = '25';
            else if (chanceOfPlaying <= 50) badgeText = '50';
            else if (chanceOfPlaying <= 75) badgeText = '75';
            else badgeText = '75'; // Default for any value > 75 but < 100
          } else {
            badgeText = '50'; // Default if no chance_of_playing data
          }
        }
        
        const flagTitle = player.news || (isDoubtful ? 'Doubtful' : 'Unavailable');
        statusFlagHtml = `<span class="table-status-flag-badge ${badgeClass}" title="${flagTitle}">${badgeText}</span>`;
      }

      // Get stat value for the single filterable column
      const statValue = formatStatValue(player[statCol.key], statCol.key);

      // Get team badge for club column
      const team = state.teams.find(t => t.id === player.team);
      const teamCode = team ? team.code : '';
      const teamName = team ? team.name : 'Unknown';
      const teamNameEscaped = escapeHtml(teamName);
      const playerNameEscaped = escapeHtml(player.web_name);
      const badgeUrl = getTeamBadgeUrl(teamCode);
      
      // Only render badge img if URL is available
      const badgeHtml = badgeUrl 
        ? `<img class="club-badge" src="${badgeUrl}" alt="${teamNameEscaped}" title="${teamNameEscaped}" />`
        : '';

      return `
        <tr onclick="selectPlayer(event, ${player.id})" data-player-id="${player.id}" class="${checked ? 'selected' : ''}">
          <td class="info-cell">
            <button class="info-btn" onclick="showPlayerInfo(event, ${player.id})" title="View player stats">i</button>
          </td>
          <td class="club-cell">${badgeHtml}</td>
          <td class="status-cell">${statusFlagHtml}</td>
          <td class="name-cell">${playerNameEscaped}</td>
          <td>${posNames[player.element_type]}</td>
          <td>${(player.now_cost / 10).toFixed(1)}</td>
          <td class="stat-col-cell">${statValue}</td>
        </tr>
      `;
    })
    .join('');

  // Update sort icons after rendering
  updateSortIcons();
}

export function populateFilters() {
  // Filters are now populated dynamically in renderTable
}

function populateTeamFilter() {
  const teamSelect = document.getElementById('filterTeam');
  if (!teamSelect || !state.teams) return;

  // Sort teams alphabetically by name
  const sortedTeams = [...state.teams].sort((a, b) => 
    (a.name || '').localeCompare(b.name || '')
  );

  // Clear existing options except the first "All Clubs"
  teamSelect.innerHTML = '<option value="">All Clubs</option>';

  // Add team options
  sortedTeams.forEach(team => {
    const option = document.createElement('option');
    option.value = String(team.id);
    option.textContent = team.name;
    teamSelect.appendChild(option);
  });
}

window.selectPlayer = function (ev, id) {
  if (ev) ev.stopPropagation();
  
  // Single selection only - replace previous selection
  const previouslySelected = window.selectedPlayerIds.length > 0 ? window.selectedPlayerIds[0] : null;
  
  // If clicking the same player, deselect
  if (previouslySelected === id) {
    window.selectedPlayerIds = [];
  } else {
    window.selectedPlayerIds = [id];
  }

  // Update all row styling
  const allRows = document.querySelectorAll('#tableBody tr[data-player-id]');
  allRows.forEach(row => {
    const rowId = parseInt(row.getAttribute('data-player-id'));
    if (rowId === id && window.selectedPlayerIds.includes(id)) {
      row.classList.add('selected');
    } else {
      row.classList.remove('selected');
    }
  });
};

// Expose for inline handlers
window.renderTable = renderTable;
window.populateFilters = populateFilters;

window.sortTable = function (key) {
  if (tableSort.key === key) {
    // Toggle direction
    tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    tableSort.key = key;
    // Default to descending (highest first) for numeric columns
    tableSort.dir = 'desc';
  }

  updateSortIcons();
  renderTable();
};

// Set default sort to points (descending) - called after team import
export function setDefaultSort() {
  tableSort.key = 'total_points';
  tableSort.dir = 'desc'; // Descending so highest points first
  updateSortIcons();
  renderTable();
}

function updateSortIcons() {
  const icons = getSortIcons();

  // Default: show neutral arrows for all sortable columns
  Object.values(icons).forEach(icon => {
    if (icon) icon.textContent = '⇅';
  });

  // Set active icon for sorted column
  if (tableSort.key && icons[tableSort.key]) {
    const arrow = tableSort.dir === 'asc' ? '▲' : '▼';
    icons[tableSort.key].textContent = arrow;
  }
}

// Update stat columns based on dropdown selection
window.updateStatColumns = function () {
  initializeStatColumns();
  // Re-render table with new columns
  renderTable();
};

// Show player info modal
window.showPlayerInfo = function (ev, playerId) {
  if (ev) {
    ev.stopPropagation();
    ev.preventDefault();
  }
  
  const player = state.elements.find(p => p.id === playerId);
  if (!player) return;
  
  const team = state.teams.find(t => t.id === player.team);
  const teamName = team ? team.name : 'Unknown';
  const teamCode = team ? team.code : '';
  const teamNameEscaped = escapeHtml(teamName);
  const playerNameEscaped = escapeHtml(player.web_name);
  const newsEscaped = player.news ? escapeHtml(player.news) : '';
  
  // Create modal if it doesn't exist
  let modal = document.getElementById('playerInfoModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'playerInfoModal';
    modal.className = 'player-info-modal';
    document.body.appendChild(modal);
  }
  
  // Build stats grid
  const statsHtml = `
    <div class="player-info-stats">
      <div class="player-stat-item">
        <div class="player-stat-label">Total Points</div>
        <div class="player-stat-value">${player.total_points || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Price</div>
        <div class="player-stat-value">£${(player.now_cost / 10).toFixed(1)}m</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Form</div>
        <div class="player-stat-value">${player.form || '0'}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Goals Scored</div>
        <div class="player-stat-value">${player.goals_scored || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Assists</div>
        <div class="player-stat-value">${player.assists || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Clean Sheets</div>
        <div class="player-stat-value">${player.clean_sheets || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Bonus Points</div>
        <div class="player-stat-value">${player.bonus || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Minutes Played</div>
        <div class="player-stat-value">${player.minutes || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Goals Conceded</div>
        <div class="player-stat-value">${player.goals_conceded || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Yellow Cards</div>
        <div class="player-stat-value">${player.yellow_cards || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Red Cards</div>
        <div class="player-stat-value">${player.red_cards || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Saves</div>
        <div class="player-stat-value">${player.saves || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Penalties Saved</div>
        <div class="player-stat-value">${player.penalties_saved || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Penalties Missed</div>
        <div class="player-stat-value">${player.penalties_missed || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Owned By</div>
        <div class="player-stat-value">${parseFloat(player.selected_by_percent || 0).toFixed(1)}%</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Transfers In (GW)</div>
        <div class="player-stat-value">${player.transfers_in_event || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">Transfers Out (GW)</div>
        <div class="player-stat-value">${player.transfers_out_event || 0}</div>
      </div>
      <div class="player-stat-item">
        <div class="player-stat-label">ICT Index</div>
        <div class="player-stat-value">${parseFloat(player.ict_index || 0).toFixed(1)}</div>
      </div>
    </div>
  `;
  
  const statusInfo = player.news ? `
    <div class="player-info-section">
      <h3>Status</h3>
      <p style="color: rgba(255, 255, 255, 0.9); line-height: 1.6;">${newsEscaped}</p>
    </div>
  ` : '';
  
  modal.innerHTML = `
    <div class="player-info-content">
      <button class="player-info-close" onclick="closePlayerInfo()">×</button>
      
      <div class="player-info-header">
        <img src="${getTeamBadgeUrl(teamCode)}" 
             class="player-info-badge" alt="${teamNameEscaped}">
        <div class="player-info-title">
          <h2>${playerNameEscaped}</h2>
          <p>${teamNameEscaped} • ${posNames[player.element_type]}</p>
        </div>
      </div>
      
      ${statusInfo}
      
      <div class="player-info-section">
        <h3>Season Statistics</h3>
        ${statsHtml}
      </div>
    </div>
  `;
  
  modal.classList.add('open');
};

window.closePlayerInfo = function () {
  const modal = document.getElementById('playerInfoModal');
  if (modal) {
    modal.classList.remove('open');
  }
};

// Initialize stat columns after table headers are rendered
function initializeStatColumns() {
  const statSelect = document.getElementById('statSelect');
  if (!statSelect) return;
  
  currentStatView = statSelect.value || 'points';
  
  // Update table header with safe HTML escaping for single filterable column
  const statCol = statConfig[currentStatView] || statConfig.points;
  const colHeader = document.getElementById('statColHeader');
  
  if (colHeader) {
    const escapedKey = escapeHtml(statCol.key);
    const escapedLabel = escapeHtml(statCol.label);
    const escapedTooltip = escapeHtml(statCol.tooltip);
    colHeader.innerHTML = `<span onclick="sortTable('${escapedKey}')" class="th-sortable" style="cursor: pointer;" title="${escapedTooltip}">${escapedLabel} <span id="sortStatIcon">⇅</span></span>`;
  }
}

// Call initialization on first render
let isFirstRender = true;

