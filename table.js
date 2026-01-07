// table.js - Player table render/filter
import { state } from './data.js';

const posMap = { GK: 1, DEF: 2, MID: 3, FWD: 4 };
const posNames = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export function renderTable() {
  const tbody = document.getElementById('tableBody');
  const search = document.getElementById('searchName').value.toLowerCase();
  const posFilter = document.getElementById('filterPos').value;
  const teamFilter = document.getElementById('filterTeam').value;
  const maxPrice = parseFloat(document.getElementById('filterPrice').value) || Infinity;

  const filtered = state.elements.filter(player => {
    const matchesSearch = player.web_name.toLowerCase().includes(search);
    const matchesPos = !posFilter || posNames[player.element_type] === posFilter;
    const matchesTeam = !teamFilter || player.team == teamFilter;
    const matchesPrice = player.now_cost / 10 <= maxPrice;
    return matchesSearch && matchesPos && matchesTeam && matchesPrice;
  });

  tbody.innerHTML = filtered.map(player => {
    const teamName = state.teams.find(t => t.id === player.team)?.short_name || '';
    return `
      <tr onclick="selectPlayer(${player.id})">
        <td><input type="radio" name="selected" value="${player.id}"></td>
        <td>${player.web_name}</td>
        <td>${teamName}</td>
        <td>${posNames[player.element_type]}</td>
        <td>${(player.now_cost / 10).toFixed(1)}</td>
        <td>H A H</td>
      </tr>
    `;
  }).join('');

  console.log(`Rendered ${filtered.length} players`);
}

export function populateFilters() {
  const teamSelect = document.getElementById('filterTeam');
  teamSelect.innerHTML = '<option value="">All Teams</option>' + 
    state.teams.map(t => `<option value="${t.id}">${t.short_name}</option>`).join('');
}

window.selectPlayer = (id) => {
  console.log('Selected player ID:', id);
  document.querySelectorAll('tr').forEach(tr => tr.classList.remove('selected'));
  event.target.closest('tr').classList.add('selected');
};

window.renderTable = renderTable;
window.populateFilters = populateFilters;

