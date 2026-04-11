// Party mode state machine
// SETUP -> TURN_READY -> PLAYING -> TURN_OVER -> (next or round end) -> PODIUM

const PARTY_COLORS = ['#ee4444', '#44aaff', '#44dd44', '#ffaa44'];
const PARTY_COLOR_NAMES = ['RED', 'BLUE', 'GREEN', 'ORANGE'];
const TOTAL_ROUNDS = 3;

let partyState = null;

export function isPartyMode() { return partyState !== null && partyState.phase !== 'SETUP'; }
export function getPartyState() { return partyState; }

export function initParty(playerNames) {
  partyState = {
    phase: 'TURN_READY',
    players: playerNames.map((name, i) => ({
      name,
      color: PARTY_COLORS[i],
      colorName: PARTY_COLOR_NAMES[i],
      scores: [],
      waves: [],
    })),
    currentPlayer: 0,
    currentRound: 0,
    totalRounds: TOTAL_ROUNDS,
  };
  return partyState;
}

export function getCurrentPlayerName() {
  if (!partyState) return '';
  return partyState.players[partyState.currentPlayer].name;
}

export function getCurrentPlayerColor() {
  if (!partyState) return '#ee4444';
  return partyState.players[partyState.currentPlayer].color;
}

export function startTurn() {
  if (!partyState) return;
  partyState.phase = 'PLAYING';
}

export function endTurn(wave, score) {
  if (!partyState) return;
  const p = partyState.players[partyState.currentPlayer];
  p.scores.push(score);
  p.waves.push(wave);

  partyState.currentPlayer++;

  if (partyState.currentPlayer >= partyState.players.length) {
    partyState.currentPlayer = 0;
    partyState.currentRound++;
    if (partyState.currentRound >= partyState.totalRounds) {
      partyState.phase = 'PODIUM';
      return;
    }
  }

  partyState.phase = 'TURN_READY';
}

export function getPartyHUD() {
  if (!partyState) return null;
  const p = partyState.players[partyState.currentPlayer];
  return {
    round: partyState.currentRound + 1,
    totalRounds: partyState.totalRounds,
    playerName: p.name,
    playerColor: p.color,
  };
}

export function getResults() {
  if (!partyState) return [];
  return partyState.players
    .map(p => ({
      name: p.name,
      color: p.color,
      colorName: p.colorName,
      bestScore: Math.max(0, ...p.scores),
      totalScore: p.scores.reduce((a, b) => a + b, 0),
      bestWave: Math.max(0, ...p.waves),
      scores: [...p.scores],
      waves: [...p.waves],
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

export function resetParty() {
  partyState = null;
}
