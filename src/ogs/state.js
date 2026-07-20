const {DEFAULT_MATCHMAKING_OPTIONS} = require('./matchmaking.js')

function getInitialSocketState() {
  return {
    status: 'disconnected',
    authenticated: false,
    error: null,
  }
}

function getInitialMatchmakingState() {
  return {
    status: 'idle',
    options: DEFAULT_MATCHMAKING_OPTIONS,
    payload: null,
    matchedGameId: null,
    error: null,
  }
}

function getInitialOnlineGameState() {
  return {
    status: 'idle',
    gameId: null,
    error: null,
    gameName: null,
    board: null,
    handicap: null,
    komi: null,
    rules: null,
    ranked: null,
    timeControl: null,
    timePerMove: null,
    phase: null,
    outcome: null,
    winner: null,
    players: null,
    moves: [],
    moveCount: 0,
    lastMove: null,
    pendingMove: false,
    clock: null,
    latencies: {},
    removedStones: '',
    removedStonesAccepted: [],
    chat: [],
  }
}

function getInitialNetworkState() {
  return {
    latency: null,
    drift: null,
    updatedAt: null,
  }
}

function getInitialActiveGamesState() {
  return []
}

function cloneOnlineGameState(state) {
  return {
    ...state,
    board: state.board == null ? null : {...state.board},
    handicap: state.handicap,
    komi: state.komi,
    rules: state.rules,
    ranked: state.ranked,
    timeControl: state.timeControl == null ? null : {...state.timeControl},
    timePerMove: state.timePerMove,
    outcome: state.outcome,
    winner: state.winner,
    players:
      state.players == null
        ? null
        : {
            black:
              state.players.black == null ? null : {...state.players.black},
            white:
              state.players.white == null ? null : {...state.players.white},
          },
    clock: cloneClockState(state.clock),
    latencies: {...(state.latencies || {})},
    removedStones: state.removedStones,
    removedStonesAccepted: [...state.removedStonesAccepted],
    moves: state.moves.map((move) => ({...move})),
    chat: state.chat.map((line) => ({...line})),
  }
}

function cloneClockState(clock) {
  if (clock == null) return null

  return {
    ...clock,
    blackTime: clock.blackTime == null ? null : {...clock.blackTime},
    whiteTime: clock.whiteTime == null ? null : {...clock.whiteTime},
    pause: clock.pause == null ? null : {...clock.pause},
  }
}

function cloneActiveGameState(game) {
  return {
    ...game,
    board: game.board == null ? null : {...game.board},
    timeControl: game.timeControl == null ? null : {...game.timeControl},
    black: game.black == null ? null : {...game.black},
    white: game.white == null ? null : {...game.white},
  }
}

module.exports = {
  getInitialSocketState,
  getInitialMatchmakingState,
  getInitialOnlineGameState,
  getInitialActiveGamesState,
  getInitialNetworkState,
  cloneOnlineGameState,
  cloneClockState,
  cloneActiveGameState,
}
