import { state } from './data.js';

const fixturesByGW = new Map();
let fixturesGW = null;

export async function loadFixturesData() {
  const res = await fetch('/api/fpl/fixtures');
  const data = await res.json();

  fixturesByGW.clear();

  for (const f of data) {
    if (!f.event) continue;
    if (!fixturesByGW.has(f.event)) {
      fixturesByGW.set(f.event, []);
    }
    fixturesByGW.get(f.event).push(f);
  }

  fixturesGW = state.currentGW;
}

window.changeFixturesGW = function (delta) {
  fixturesGW = Math.max(1, Math.min(38, fixturesGW + delta));
  renderFixtures();
};

export function renderFixtures() {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  const fixtures = fixturesByGW.get(fixturesGW) || [];

  panel.innerHTML = `
    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>
    ${fixtures.map(f => `
      <div class="fixture-row">
        ${teamFullName(f.team_h)} v ${teamFullName(f.team_a)}
      </div>
    `).join('')}
  `;
}

function teamFullName(teamId) {
  const team = state.teams.find(t => t.id === teamId);
  return team ? team.name : '?';
}
