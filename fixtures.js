import { state } from './data.js';

const fixturesByGW = new Map();
let fixturesGW = null;

/* -------------------------------
   Load fixtures from FPL API
-------------------------------- */
export async function loadFixturesData() {
  const res = await fetch('/api/fpl/fixtures');
  const data = await res.json();

  fixturesByGW.clear();

  for (const f of data) {
    if (!f.event || !f.kickoff_time) continue;

    if (!fixturesByGW.has(f.event)) {
      fixturesByGW.set(f.event, []);
    }
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

  // Group by calendar date
  const grouped = {};
  for (const f of fixtures) {
    const dateKey = f.kickoff_time.slice(0, 10);
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(f);
  }

  const dates = Object.keys(grouped).sort();

  panel.innerHTML = `
    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>

    ${dates.map(dateKey => renderDateBlock(dateKey, grouped[dateKey])).join('')}
  `;
}

/* -------------------------------
   Render a date block
-------------------------------- */
function renderDateBlock(dateKey, fixtures) {
  const date = new Date(dateKey + 'T00:00:00Z');
  const dateLabel = date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `
    <div class="fixture-date">${dateLabel}</div>
    ${fixtures
      .sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time))
      .map(renderFixtureRow)
      .join('')}
  `;
}

/* -------------------------------
   Render one fixture row
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
      <div class="fixture-team home">
        <span>${home.name}</span>
        <img src="${home.badge}" alt="${home.name}">
      </div>

      <div class="fixture-time">${ko}</div>

      <div class="fixture-team away">
        <img src="${away.badge}" alt="${away.name}">
        <span>${away.name}</span>
      </div>
    </div>
  `;
}

/* -------------------------------
   Team lookup helper
-------------------------------- */
function getTeam(id) {
  const team = state.teams.find(t => t.id === id);
  return {
    name: team?.name ?? '?',
    badge: team?.badge ?? '',
  };
}
