// table.js - Player table render/filter

import { state, loadFixtures } from './data.js';

let tableSort = {
  key: null,      // 'price' | 'points' | 'goals_scored' | 'assists' | 'clean_sheets' | 'saves' | 'bonus' | 'transfers_in_event' | 'transfers_out_event' | 'selected_by_percent'
  dir: 'asc'      // 'asc' | 'desc'
};

const posNames = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Stat column keys
const STAT_KEYS = ['goals_scored', 'assists', 'clean_sheets', 'saves', 'bonus', 'transfers_in_event', 'transfers_out_event', 'selected_by_percent'];

// Selected players (changed from single to multi-select)
window.selectedPlayerIds = window.selectedPlayerIds ?? [];

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
      price: document.getElementById('sortPriceIcon'),
      points: document.getElementById('sortPointsIcon'),
      goals_scored: document.getElementById('sortGoalsIcon'),
      assists: document.getElementById('sortAssistsIcon'),
      clean_sheets: document.getElementById('sortCleanSheetsIcon'),
      saves: document.getElementById('sortSavesIcon'),
      bonus: document.getElementById('sortBonusIcon'),
      transfers_in_event: document.getElementById('sortTransfersInIcon'),
      transfers_out_event: document.getElementById('sortTransfersOutIcon'),
      selected_by_percent: document.getElementById('sortSelectedByIcon')
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

function foldForSearch(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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

  const search = foldForSearch(document.getElementById('searchName')?.value || '');
  const posFilter = document.getElementById('filterPos')?.value || '';
  const teamFilter = document.getElementById('filterTeam')?.value || '';
  const maxPrice = parseFloat(document.getElementById('filterPrice')?.value);
  const max = Number.isFinite(maxPrice) ? maxPrice : Infinity;

  let filtered = state.elements.filter((player) => {
    const matchesSearch = foldForSearch(player.web_name || '').includes(search);
    const matchesPos = !posFilter || posNames[player.element_type] === posFilter;
    const matchesTeam = !teamFilter || String(player.team) === String(teamFilter);
    const matchesPrice = (player.now_cost / 10) <= max;
    return matchesSearch && matchesPos && matchesTeam && matchesPrice;
  });

  // -------- SORTING --------
  if (tableSort.key) {
    const dir = tableSort.dir === 'asc' ? 1 : -1;

    filtered = filtered.slice().sort((a, b) => {
      if (tableSort.key === 'price') {
        return dir * ((a.now_cost / 10) - (b.now_cost / 10));
      }

      if (tableSort.key === 'points') {
        return dir * (a.total_points - b.total_points);
      }

      // Handle all stat columns
      if (STAT_KEYS.includes(tableSort.key)) {
        const parseStatValue = (val) => {
          if (val == null) return 0;
          const num = parseFloat(val);
          return isNaN(num) ? 0 : num;
        };
        const aVal = parseStatValue(a[tableSort.key]);
        const bVal = parseStatValue(b[tableSort.key]);
        return dir * (aVal - bVal);
      }

      return 0;
    });
  }

  // -------- RENDER --------
  tbody.innerHTML = filtered
    .map((player) => {
      const teamName =
        state.teams.find((t) => t.id === player.team)?.short_name || '';
      const checked = window.selectedPlayerIds.includes(player.id) ? 'checked' : '';

      const next4 = getNextFixturesForTeam(player.team, state.viewingGW, 4);
      const next4Html = next4.map((x) => `<span class="fx">${x}</span>`).join(' ');

      // Status flag for table - using flag emoji
      let statusFlagHtml = '';
      if (player.status && player.status !== 'a') {
        const isDoubtful = player.status === 'd';
        const flagEmoji = isDoubtful ? '🟨' : '🟥'; // Yellow square for doubtful, red square for injured/suspended
        const flagTitle = player.news || (isDoubtful ? 'Doubtful' : 'Unavailable');
        statusFlagHtml = `<span class="table-status-flag" title="${flagTitle}">${flagEmoji}</span>`;
      }

      return `
        <tr onclick="selectPlayer(event, ${player.id})" class="${checked ? 'selected' : ''}">
          <td><input type="checkbox" name="selectedPlayer" value="${player.id}" ${checked}></td>
          <td class="status-cell">${statusFlagHtml}</td>
          <td class="name-cell">${player.web_name}</td>
          <td>${teamName}</td>
          <td>${posNames[player.element_type]}</td>
          <td>${(player.now_cost / 10).toFixed(1)}</td>
          <td>${player.total_points}</td>
          <td class="stat-col-cell">${formatStatValue(player.goals_scored, 'goals_scored')}</td>
          <td class="stat-col-cell">${formatStatValue(player.assists, 'assists')}</td>
          <td class="stat-col-cell">${formatStatValue(player.clean_sheets, 'clean_sheets')}</td>
          <td class="stat-col-cell">${formatStatValue(player.saves, 'saves')}</td>
          <td class="stat-col-cell">${formatStatValue(player.bonus, 'bonus')}</td>
          <td class="stat-col-cell">${formatStatValue(player.transfers_in_event, 'transfers_in_event')}</td>
          <td class="stat-col-cell">${formatStatValue(player.transfers_out_event, 'transfers_out_event')}</td>
          <td class="stat-col-cell">${formatStatValue(player.selected_by_percent, 'selected_by_percent')}</td>
          <td class="fixtures-cell">${next4Html}</td>
        </tr>
      `;
    })
    .join('');

  // Update sort icons after rendering
  updateSortIcons();
}

export function populateFilters() {
  const teamSelect = document.getElementById('filterTeam');
  if (!teamSelect) return;

  teamSelect.innerHTML =
    `<option value="">All Teams</option>` +
    state.teams
      .map((t) => `<option value="${t.id}">${t.short_name}</option>`)
      .join('');
}

window.selectPlayer = function (ev, id) {
  if (ev) ev.stopPropagation();
  
  // Toggle selection
  const index = window.selectedPlayerIds.indexOf(id);
  if (index > -1) {
    window.selectedPlayerIds.splice(index, 1);
  } else {
    window.selectedPlayerIds.push(id);
  }

  // Update row styling
  const row = ev?.target?.closest('tr');
  if (row) {
    if (window.selectedPlayerIds.includes(id)) {
      row.classList.add('selected');
    } else {
      row.classList.remove('selected');
    }
  }

  // Update checkbox
  const checkbox = row?.querySelector('input[type="checkbox"]');
  if (checkbox) {
    checkbox.checked = window.selectedPlayerIds.includes(id);
  }
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
    tableSort.dir = 'asc';
  }

  updateSortIcons();
  renderTable();
};

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

