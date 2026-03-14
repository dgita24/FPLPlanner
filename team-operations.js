// team-operations.js

function swapWithinTeam(team, aId, bId) {
    const aIndex = team.bench.findIndex(player => player.id === aId);
    const bIndex = team.bench.findIndex(player => player.id === bId);

    // Check if both players are on the bench
    if (aIndex !== -1 && bIndex !== -1) {
        [team.bench[aIndex], team.bench[bIndex]] = [team.bench[bIndex], team.bench[aIndex]];
    }
    // Keep starting <-> starting blocked, do nothing
}

function substitutePlayer(playerId, currentPendingSwap, team) {
    const sideNow = currentPendingSwap.side;

    if (sideNow === currentPendingSwap.side) {
        if (sideNow === 'bench') {
            // Attempt bench <-> bench swap
            swapWithinTeam(team, currentPendingSwap.id, playerId);
            // Ensure GK rule is maintained (already checked by isGK mismatch guard)
            // Apply swap from gw..38 without validateStartingXI
            // Clear captain/viceCaptain only if someone moved to bench
            // since bench <-> bench doesn't change bench membership so no captain/VC changes
            clearPendingSwap();
            updateUI();
        } else if (sideNow === 'starting') {
            // Keep existing message for starting > starting swaps
            return 'Cannot swap starting players.';
        }
    }
}

// For cross-side swaps, keep existing validateStartingXI logic
function validateCrossSideSwap(team, playerId, currentPendingSwap) {
    // Existing logic...
}
