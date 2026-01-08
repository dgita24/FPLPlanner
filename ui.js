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
  showMessage(`Team imported! ${data.picks.length} players`, 'success');
  
  // TODO: Render pitch
};

// Message toast
function showMessage(text, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.className = `message msg-${type}`;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 3000);
}
