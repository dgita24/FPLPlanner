// table.js - Player table render/filter

import { state, loadFixtures } from './data.js';

let tableSort = {
  key: null,      // 'price' | 'pos'
  dir: 'asc'      // 'asc' | 'desc'
};

const posNames = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Selected players (changed from single to multi-select)
window.selectedPlayerIds = window.selectedPlayerIds ?? [];

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

function getNextFixturesForTeam(teamId, startGW, count = 3) {
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
  const needed = [start, start + 1, start + 2]; // Next 3
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

      if (tableSort.key === 'pos') {
        // GK(1) → DEF(2) → MID(3) → FWD(4)
        return dir * (a.element_type - b.element_type);
      }

      if (tableSort.key === 'points') {
        return dir * (a.total_points - b.total_points);
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

      const next3 = getNextFixturesForTeam(player.team, state.viewingGW, 3);
      const next3Html = next3.map((x) => `<span class="fx">${x}</span>`).join(' ');

      // Status flag for table
      let statusFlagHtml = '';
      if (player.status && player.status !== 'a') {
        const isDoubtful = player.status === 'd';
        const flagColor = isDoubtful ? '#ffeb3b' : '#f44336';
        const flagTitle = player.news || (isDoubtful ? 'Doubtful' : 'Unavailable');
        statusFlagHtml = `<div class="table-status-flag" style="border-bottom-color: ${flagColor};" title="${flagTitle}"></div>`;
      }

      return `
        <tr onclick="selectPlayer(event, ${player.id})" class="${checked ? 'selected' : ''}">
          <td><input type="checkbox" name="selectedPlayer" value="${player.id}" ${checked}></td>
          <td style="text-align:center; position:relative;">${statusFlagHtml}</td>
          <td>${player.web_name}</td>
          <td>${teamName}</td>
          <td>${posNames[player.element_type]}</td>
          <td>${(player.now_cost / 10).toFixed(1)}</td>
          <td>${player.total_points}</td>
          <td style="text-align:center; white-space:nowrap;">${next3Html}</td>
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
  // Clear all icons and show default state
  const posIcon = document.getElementById('sortPosIcon');
  const priceIcon = document.getElementById('sortPriceIcon');
  const pointsIcon = document.getElementById('sortPointsIcon');

  // Default: show neutral arrows for all sortable columns
  if (posIcon) posIcon.textContent = '⇅';
  if (priceIcon) priceIcon.textContent = '⇅';
  if (pointsIcon) pointsIcon.textContent = '⇅';

  // Set active icon for sorted column
  if (tableSort.key) {
    const arrow = tableSort.dir === 'asc' ? '▲' : '▼';
    if (tableSort.key === 'pos' && posIcon) posIcon.textContent = arrow;
    if (tableSort.key === 'price' && priceIcon) priceIcon.textContent = arrow;
    if (tableSort.key === 'points' && pointsIcon) pointsIcon.textContent = arrow;
  }
}

