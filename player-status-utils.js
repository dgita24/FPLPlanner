// player-status-utils.js - Utility functions for player status and flags

/**
 * Parse suspension duration from player news text
 * @param {Object} player - Player object with news field
 * @param {number} currentGW - Current gameweek number
 * @returns {number|null} - Gameweek number when suspension ends, or null if not parseable
 */
export function getSuspensionEndGW(player, currentGW) {
  if (!player.news) return null;
  
  // Parse: "Suspended for 2 matches" or "Suspended for 2 games"
  const matchesMatch = player.news.match(/Suspended for (\d+) (?:match|matches|game|games)/i);
  if (matchesMatch) {
    const suspendedMatches = parseInt(matchesMatch[1]);
    // Suspension ends after the last suspended gameweek
    return currentGW + suspendedMatches - 1;
  }
  
  // Parse: "Unavailable until gameweek 24" or "Returns in gameweek 24"
  const gwMatch = player.news.match(/(?:until|in) gameweek (\d+)/i);
  if (gwMatch) {
    return parseInt(gwMatch[1]) - 1; // Available FROM that GW, so ends before it
  }
  
  return null; // Injury or unknown - treat as indefinite
}

/**
 * Check if a suspension has expired for a given gameweek
 * @param {Object} player - Player object with status and news
 * @param {number} gwToCheck - Gameweek to check
 * @param {number} currentGW - Current gameweek number
 * @returns {boolean} - True if suspension has expired, false otherwise
 */
export function isSuspensionExpiredForGW(player, gwToCheck, currentGW) {
  // Only applies to suspended players
  if (player.status !== 's') return false;
  
  const suspensionEndGW = getSuspensionEndGW(player, currentGW);
  
  // If we can't parse suspension end, treat as indefinite (not expired)
  if (!suspensionEndGW) return false;
  
  // Suspension has expired if viewing GW is after the suspension end GW
  return gwToCheck > suspensionEndGW;
}
