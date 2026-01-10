import { state } from './data.js';

const fixturesByGW = new Map();
let fixturesGW = null;

/* -------------------------------
   Load fixtures
-------------------------------- */
export async function loadFixturesData() {
  const res = await fetch('/api/fpl/fixtures');
  const data = await res.json();

  fixturesByGW.clear();

  for (const f of data) {
    if (!f.event || !f.kickoff_time) continue;
    if (!fixturesByGW.has(f.event)) fixturesByGW.set(f.event, []);
    fixturesByGW.get(f.event).push(f);
  }

  fixturesGW = state.viewingGW ?? state.currentGW;
}

/* -------------------------------
   GW navigation
-------------------------------- */
window.changeFixturesGW = function (delta) {
  fixturesGW = Math.max(1, Math.min(38, fixturesGW + delta));
  renderFixtures();
};

/* -------------------------------
   Render fixtures panel
-------------------------------- */
export function renderFixtures() {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  const fixtures = fixturesByGW.get(fixturesGW) || [];

  const byDate = {};
  for (const f of fixtures) {
    const d = f.kickoff_time.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(f);
  }

  panel.innerHTML = `
    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>

    ${Object.keys(byDate)
      .sort()
      .map(d => renderDateBlock(d, byDate[d]))
      .join('')}
  `;
}

/* -------------------------------
   Date block
-------------------------------- */
function renderDateBlock(dateKey, fixtures) {
  const date = new Date(dateKey + 'T00:00:00Z');
  const label = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `
    <div class="fixture-date">${label}</div>
    ${fixtures
      .sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time))
      .map(renderFixtureRow)
      .join('')}
  `;
}

/* -------------------------------
   Single fixture row
-------------------------------- */
function renderFixtureRow(f) {
  const home = getTeam(f.team_h);
  const away = getTeam(f.team_a);

  const ko = new Date(f.kickoff_time).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return `
    <div class="fixture-row">
      <span class="team-name home">${home.name}</span>
      <img class="team-badge" src="${home.badge}" alt="${home.name}">
      <span class="fixture-time">${ko}</span>
      <img class="team-badge" src="${away.badge}" alt="${away.name}">
      <span class="team-name away">${away.name}</span>
    </div>
  `;
}

/* -------------------------------
   Team lookup
-------------------------------- */
function getTeam(id) {
  const t = state.teams.find(team => team.id === id);
  return {
    name: t?.name ?? '?',
    badge: t?.badge ?? '',
  };
}
