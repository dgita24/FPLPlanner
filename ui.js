window.toggleSidebarMenu = () => {
  document.getElementById('sidebar').classList.toggle('open');
};

window.importTeam = async () => {
  const teamId = document.getElementById('importTeamId').value;
  if (!teamId) return showMessage('Enter Team ID', 'error');
  const picks = await importTeamData(teamId, state.currentGW);
  if (picks) {
    console.log(`Imported team ${teamId}: ${picks.length} players`);
    showMessage('Team imported!', 'success');
  }
};
