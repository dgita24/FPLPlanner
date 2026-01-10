// table.js - Player table render/filter
import { state } from './data.js';

const posNames = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// Selected player (shared with ui.js)
window.selectedPlayerId = window.selectedPlayerId ?? null;

export function renderTable() {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const search = (document.getElementById('searchName')?.value || '').toLowerCase();
  const posFilter = document.getElementById('filterPos')?.value || '';
  const teamFilter = document.getElementById('filterTeam')?.value || '';
  const maxPrice = parseFloat(document.getElementById('filterPrice')?.value);
  const max = Number.isFinite(maxPrice) ? maxPrice : Infinity;

  const filtered = state.elements.filter(player => {
    const matchesSearch = (player.web_name || '').toLowerCase().includes(search);
    const matchesPos = !posFilter || posNames[player.element_type] === posFilter;
    const matchesTeam = !teamFilter || String(player.team) === String(teamFilter);
    const matchesPrice = (player.now_cost / 10) <= max;
    return matchesSearch && matchesPos && matchesTeam && matchesPrice;
  });

  tbody.innerHTML = filtered.map(player => {
    const teamName = state.teams.find(t => t.id === player.team)?.short_name || '';
    const checked = (window.selectedPlayerId === player.id) ? 'checked' : '';
    return `
      <tr onclick="selectPlayer(event, ${player.id})">
        <td><input type="radio" name="selected" value="${player.id}" ${checked} /></td>
        <td>${player.web_name}</td>
        <td>${teamName}</td>
        <td>${posNames[player.element_type]}</td>
        <td>${(player.now_cost / 10).toFixed(1)}</td>
        <td>H A H</td>
      </tr>
    `;
  }).join('');
}

export function populateFilters() {
  const teamSelect = document.getElementById('filterTeam');
  if (!teamSelect) return;

  teamSelect.innerHTML = '<option value="">All Teams</option>' +
    state.teams.map(t => `<option value="${t.id}">${t.short_name}</option>`).join('');
}

window.selectPlayer = function (ev, id) {
  if (ev) ev.stopPropagation();
  window.selectedPlayerId = id;

  document.querySelectorAll('#tableBody tr').forEach(tr => tr.classList.remove('selected'));
  const row = ev?.target?.closest('tr');
  if (row) row.classList.add('selected');

  // keep radio UI in sync
  const input = row?.querySelector('input[type="radio"]');
  if (input) input.checked = true;
};

// expose for inline handlers
window.renderTable = renderTable;
window.populateFilters = populateFilters;
