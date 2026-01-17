import { state } from './data.js';

const fixturesByGW = new Map();
let fixturesGW = null;

export async function loadFixturesData() {
  try {
    const res = await fetch('/api/fpl/fixtures');
    
    if (!res.ok) {
      console.error(`Failed to load fixtures: HTTP ${res.status}`);
      renderFixturesError(`Unable to load fixtures (HTTP ${res.status})`);
      return;
    }

    const data = await res.json();

    fixturesByGW.clear();

    for (const f of data) {
      if (!f.event) continue;
      if (!fixturesByGW.has(f.event)) {
        fixturesByGW.set(f.event, []);
      }
      fixturesByGW.get(f.event).push(f);
    }

    // Default to showing next gameweek's fixtures for planning
    const events = state.bootstrap?.events || [];
    const next = events.find(e => e.is_next)?.id;
    const current = events.find(e => e.is_current)?.id;
    fixturesGW = next || current || state.currentGW;
    renderFixtures();
  } catch (error) {
    console.error('Error loading fixtures:', error);
    renderFixturesError('Unable to load fixtures. Please check your connection.');
  }
}

window.changeFixturesGW = function (delta) {
  fixturesGW = Math.max(1, Math.min(38, fixturesGW + delta));
  renderFixtures();
};

export function renderFixtures() {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  const fixtures = fixturesByGW.get(fixturesGW) || [];

  const groups = groupByDate(fixtures);
  const hasFixtures = Object.keys(groups).length > 0;

  panel.innerHTML = `
    <div class="fixtures-header">
      <button onclick="changeFixturesGW(-1)">←</button>
      <strong>GW ${fixturesGW}</strong>
      <button onclick="changeFixturesGW(1)">→</button>
    </div>

    ${hasFixtures 
      ? Object.entries(groups)
          .map(([date, games]) => `
            <div class="fixture-date-banner">${date}</div>
            ${games.map(renderFixtureRow).join('')}
          `)
          .join('')
      : '<div style="text-align: center; padding: 20px; opacity: 0.7;">No fixtures available for this gameweek</div>'
    }
  `;
}

function renderFixturesError(message) {
  const panel = document.getElementById('fixturesPanel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="fixtures-header">
      <strong>Fixtures</strong>
    </div>
    <div style="text-align: center; padding: 20px; color: #ff6b6b;">
      ${message}
    </div>
  `;
}

function renderFixtureRow(f) {
  const home = getTeam(f.team_h);
  const away = getTeam(f.team_a);

  let centreDisplay;

  if (f.finished && f.team_h_score !== null && f.team_a_score !== null) {
    centreDisplay = `${f.team_h_score}–${f.team_a_score}`;
  } else {
    centreDisplay = f.kickoff_time
      ? new Date(f.kickoff_time).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';
  }

  return `
    <div class="fixture-row">
      <div class="team home">
        <span class="team-name">${home.name}</span>
        <img class="team-badge" src="${home.badge}" />
      </div>

      <div class="ko">${centreDisplay}</div>

      <div class="team away">
        <img class="team-badge" src="${away.badge}" />
        <span class="team-name">${away.name}</span>
      </div>
    </div>
  `;
}

function groupByDate(fixtures) {
  const groups = {};
  for (const f of fixtures) {
    if (!f.kickoff_time) continue;

    const d = new Date(f.kickoff_time);
    const label = d.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    groups[label] ??= [];
    groups[label].push(f);
  }
  return groups;
}

function getTeam(teamId) {
  const t = state.teams.find(team => team.id === teamId);
  return {
    name: t ? t.name : '?',
    badge: t
      ? `https://resources.premierleague.com/premierleague/badges/70/t${t.code}.png`
      : ''
  };
}
