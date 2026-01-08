// ui.js - UI interactions
import { state, loadTeamEntry } from './data.js';

// Sidebar toggle
window.toggleSidebarMenu = function() {
  document.getElementById('sidebar').classList.toggle('open');
};

// Import team from FPL
window.importTeam = async function() {
  const teamId = document.getElementById('importTeamId').value.trim();
  if (!teamId) {
    showMessage('Enter Team ID', 'error');
    return;
  }
  
  showMessage('Loading team...', 'info');
  const data = await loadTeamEntry(teamId, state.currentGW);
  
  if (!data || !data.picks) {
    showMessage('Failed to load team', 'error');
    return;
  }
  
  console.log(`Imported team ${teamId}: ${data.picks.length} players`);
  renderPitch(data.picks);
  showMessage(`Team imported! ${data.picks.length} players`, 'success');
};

// Render pitch from picks
function renderPitch(picks) {
  const starting = picks.filter(p => p.position <= 11).sort((a,b) => a.position - b.position);
  const bench = picks.filter(p => p.position > 11).sort((a,b) => a.position - b.position);
  
  // Group starting XI by position
  const gk = starting.filter(p => getPlayer(p.element).element_type === 1);
  const def = starting.filter(p => getPlayer(p.element).element_type === 2);
  const mid = starting.filter(p => getPlayer(p.element).element_type === 3);
  const fwd = starting.filter(p => getPlayer(p.element).element_type === 4);
  
  const pitch = document.getElementById('pitch');
  pitch.innerHTML = `
    <div class="formation-line">${fwd.map(p => playerCard(p)).join('')}</div>
    <div class="formation-line">${mid.map(p => playerCard(p)).join('')}</div>
    <div class="formation-line">${def.map(p => playerCard(p)).join('')}</div>
    <div class="formation-line">${gk.map(p => playerCard(p)).join('')}</div>
  `;
  
  const benchSlots = document.getElementById('benchSlots');
  benchSlots.innerHTML = bench.map(p => playerCard(p)).join('');
}

// Get player data
function getPlayer(id) {
  return state.elements.find(p => p.id === id);
}

// Player card HTML
function playerCard(pick) {
  const p = getPlayer(pick.element);
  const team = state.teams.find(t => t.id === p.team);
  return `
    <div class="player-card">
      <img src="https://resources.premierleague.com/premierleague/badges/t${team.code}.png" 
           class="badge" alt="${team.short_name}">
      <div class="name">${p.web_name}</div>
      <div class="info">
        <span>£${(p.now_cost / 10).toFixed(1)}m</span>
        <span>${team.short_name}</span>
      </div>
    </div>
  `;
}

// Message toast
function showMessage(text, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.className = `message msg-${type}`;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 3000);
}
