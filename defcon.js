// defcon.js - Defensive Contributions (DEFCON) data module
// Fetches and aggregates defensive_contribution stats from FPL live gameweek data

const FPL_BASE = '/api/fpl';

// In-memory cache for DEFCON data (per session)
let defconCache = {
  data: null,           // Map of player_id -> total DEFCON
  completedGWs: null,   // Array of completed GW numbers
  lastFetch: null       // Timestamp of last fetch
};

/**
 * Determines the latest completed gameweek by checking fixtures.
 * A gameweek is considered completed when all its fixtures are finished.
 * @returns {Promise<number>} Latest completed gameweek number
 */
async function getLatestCompletedGameweek() {
  try {
    const res = await fetch(`${FPL_BASE}/fixtures/`);
    if (!res.ok) {
      console.warn('Failed to fetch fixtures for DEFCON');
      return 0;
    }
    
    const fixtures = await res.json();
    if (!Array.isArray(fixtures) || fixtures.length === 0) {
      return 0;
    }

    // Group fixtures by event (gameweek) and check if all are finished
    const gwStatus = {};
    fixtures.forEach(fixture => {
      if (!fixture.event) return;
      if (!gwStatus[fixture.event]) {
        gwStatus[fixture.event] = { total: 0, finished: 0 };
      }
      gwStatus[fixture.event].total++;
      if (fixture.finished || fixture.finished_provisional) {
        gwStatus[fixture.event].finished++;
      }
    });

    // Find the highest GW where all fixtures are finished
    let latestCompleted = 0;
    for (const [gw, status] of Object.entries(gwStatus)) {
      const gwNum = parseInt(gw);
      if (status.finished === status.total && gwNum > latestCompleted) {
        latestCompleted = gwNum;
      }
    }

    return latestCompleted;
  } catch (error) {
    console.error('Error determining completed gameweek:', error);
    return 0;
  }
}

/**
 * Fetches live gameweek data for a specific gameweek.
 * @param {number} gw - Gameweek number
 * @returns {Promise<Object|null>} Live gameweek data or null on error
 */
async function fetchLiveGameweek(gw) {
  try {
    const res = await fetch(`${FPL_BASE}/event/${gw}/live/`);
    if (!res.ok) {
      console.warn(`Failed to fetch live data for GW${gw}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error(`Error fetching live GW${gw}:`, error);
    return null;
  }
}

/**
 * Calculates DEFCON points awarded from a player's explain array.
 * Awards 2 points per fixture if contributions meet threshold:
 * - DEF: 10+ contributions = 2 points
 * - MID/FWD: 12+ contributions = 2 points
 * - GK: Not eligible (returns 0)
 * @param {Object} playerData - Player data from live endpoint
 * @param {number} elementType - Player position (1=GK, 2=DEF, 3=MID, 4=FWD)
 * @returns {number} Total DEFCON points awarded across all fixtures
 */
function calculateDefconPoints(playerData, elementType) {
  if (!playerData || !playerData.explain) return 0;
  
  // GK not eligible for DEFCON points
  if (elementType === 1) return 0;
  
  // Determine threshold based on position
  const threshold = elementType === 2 ? 10 : 12; // DEF needs 10, MID/FWD need 12
  let totalPoints = 0;
  
  // explain is an array of gameweek fixtures for this player
  for (const fixture of playerData.explain) {
    if (!fixture.stats) continue;
    
    // Count contributions for this fixture
    let fixtureContributions = 0;
    for (const stat of fixture.stats) {
      if (stat.identifier === 'defensive_contribution' && typeof stat.value === 'number') {
        fixtureContributions += stat.value;
      }
    }
    
    // Award 2 points if threshold met
    if (fixtureContributions >= threshold) {
      totalPoints += 2;
    }
  }
  
  return totalPoints;
}

/**
 * Fetches and aggregates DEFCON points across all completed gameweeks.
 * Awards points for DEF (≥10 contributions), MID (≥12), and FWD (≥12) per fixture.
 * @param {Array<Object>} playerElements - Array of player elements from bootstrap-static with properties: id, element_type, etc.
 * @returns {Promise<Map<number, number>>} Map of player_id -> total DEFCON points
 */
export async function fetchDefconData(playerElements) {
  // Check cache validity (cache for 5 minutes)
  const now = Date.now();
  if (defconCache.data && defconCache.lastFetch && (now - defconCache.lastFetch) < 5 * 60 * 1000) {
    console.log('Using cached DEFCON data');
    return defconCache.data;
  }

  console.log('Fetching fresh DEFCON data...');
  
  // Create maps of eligible player IDs with their positions (DEF, MID, FWD only - not GK)
  const eligiblePlayers = new Map(); // playerId -> element_type
  playerElements.forEach(player => {
    // element_type: 1=GK, 2=DEF, 3=MID, 4=FWD
    // Include DEF, MID, and FWD (exclude GK)
    if (player.element_type === 2 || player.element_type === 3 || player.element_type === 4) {
      eligiblePlayers.set(player.id, player.element_type);
    }
  });

  // Determine completed gameweeks
  const latestCompleted = await getLatestCompletedGameweek();
  if (latestCompleted === 0) {
    console.warn('No completed gameweeks found for DEFCON');
    return new Map();
  }

  // Create array of completed gameweeks [1, 2, ..., latestCompleted]
  const completedGWs = Array.from({ length: latestCompleted }, (_, i) => i + 1);
  
  defconCache.completedGWs = completedGWs;

  // Aggregate DEFCON points across all completed gameweeks
  const defconTotals = new Map();

  // Fetch live data for each completed gameweek
  const fetchPromises = completedGWs.map(gw => fetchLiveGameweek(gw));
  const results = await Promise.all(fetchPromises);

  // Process each gameweek's data
  results.forEach((liveData, index) => {
    if (!liveData || !liveData.elements) return;
    
    const gw = completedGWs[index];
    console.log(`Processing DEFCON for GW${gw}...`);

    // liveData.elements is an array of player data
    liveData.elements.forEach(playerData => {
      const playerId = playerData.id;
      
      // Only process eligible players (DEF, MID, FWD)
      if (!eligiblePlayers.has(playerId)) return;

      const elementType = eligiblePlayers.get(playerId);
      const defconPoints = calculateDefconPoints(playerData, elementType);
      
      if (defconPoints > 0) {
        const current = defconTotals.get(playerId) || 0;
        defconTotals.set(playerId, current + defconPoints);
      }
    });
  });

  console.log(`DEFCON points aggregated for ${defconTotals.size} players across ${completedGWs.length} gameweeks`);

  // Update cache
  defconCache.data = defconTotals;
  defconCache.lastFetch = now;

  return defconTotals;
}

/**
 * Merges DEFCON points into player elements array.
 * Adds a 'defensive_contribution' field to each eligible player.
 * @param {Array} elements - Array of player elements from bootstrap-static
 * @param {Map} defconData - Map of player_id -> total DEFCON points
 */
export function mergeDefconIntoElements(elements, defconData) {
  elements.forEach(player => {
    // Set DEFCON points for DEF, MID, and FWD positions (not GK)
    if (player.element_type === 2 || player.element_type === 3 || player.element_type === 4) {
      player.defensive_contribution = defconData.get(player.id) || 0;
    } else {
      player.defensive_contribution = 0;
    }
  });
}

/**
 * Clears the DEFCON cache (useful for testing or forcing refresh).
 */
export function clearDefconCache() {
  Object.assign(defconCache, {
    data: null,
    completedGWs: null,
    lastFetch: null
  });
}
