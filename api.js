// api.js - Team import handler
import { state, loadTeamEntry } from './data-v2.js'; // Your current filename

window.importTeam = async () => {
  const teamId = document.getElementById('importTeamId').value.trim();
  if (!teamId || isNaN(teamId)) {
    document.getElementById('sideMsg').textContent = 'Enter valid Team ID';
    return;
  }
  
  document.getElementById('sideMsg').textContent = 'Loading team...';
  
  const picks = await loadTeamEntry(teamId, state.currentGW);
  if (!picks || !picks.picks) {
    document.getElementById('sideMsg').textContent = 'Invalid team or GW';
    return;
  }
  
  // Store for pitch render
  state.activeSquad = picks.picks.map(p => state.elements[p.element]);
  console.log(`Imported team ${teamId}:`, state.activeSquad.length, 'players');
  document.getElementById('sideMsg').textContent = `Team ${teamId} loaded (${state.activeSquad.length} players)`;
  
  // TODO: renderPitch(state.activeSquad)
};
