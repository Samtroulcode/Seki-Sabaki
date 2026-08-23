import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import onlineStore from '../../modules/onlinestore.js'
import {parseSgfPreview} from '../../modules/sgfpreview.js'
import {formatBoard} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')
const previewCache = new Map()
const pendingPreviewTasks = []
const maxConcurrentPreviewLoads = 3
const maxPreviewCacheEntries = 72
const maxPendingPreviewLoads = 72
let activePreviewLoadCount = 0

export function OgsGameHistoryPanel({
  games = [],
  busy = false,
  error = null,
  authenticated = false,
  page = 1,
  hasNext = false,
  hasPrevious = false,
  compact = false,
  emptyText = t('No recent games loaded yet.'),
  onRefresh,
  onNextPage,
  onPreviousPage,
  onOpenGame,
  onAnalyzeOgs,
  onAnalyzeSeki,
  onOpenOgs,
}) {
  let currentUserId = onlineStore.getState().user?.id ?? null

  return h(
    'section',
    {class: `ogs-history ${compact ? 'compact' : ''}`},
    h(
      'div',
      {class: 'ogs-history-header'},
      h(
        'div',
        {},
        h('h3', {}, compact ? t('Recent OGS games') : t('OGS history')),
        h(
          'p',
          {},
          compact
            ? t('Your latest games, ready to review.')
            : t('Open completed OGS games as local review boards.'),
        ),
      ),
      authenticated
        ? h(
            'button',
            {type: 'button', disabled: busy, onClick: onRefresh},
            busy ? t('Loading...') : t('Refresh'),
          )
        : onOpenOgs != null &&
            h('button', {type: 'button', onClick: onOpenOgs}, t('Connect OGS')),
    ),
    error != null && h('p', {class: 'ogs-error'}, error),
    !authenticated
      ? h('p', {class: 'ogs-empty'}, t('Connect OGS to see your history.'))
      : games.length === 0
        ? h('p', {class: 'ogs-empty'}, busy ? t('Loading...') : emptyText)
        : h(
            'div',
            {class: 'ogs-history-grid'},
            games.map((game) =>
              h(OgsGameHistoryCard, {
                key: game.id,
                game,
                currentUserId,
                onOpenGame,
                onAnalyzeOgs,
                onAnalyzeSeki,
              }),
            ),
          ),
    !compact &&
      authenticated &&
      h(
        'div',
        {class: 'ogs-history-pagination'},
        h(
          'button',
          {
            type: 'button',
            disabled: busy || !hasPrevious,
            onClick: onPreviousPage,
          },
          t('Previous'),
        ),
        h('span', {}, t('Page'), ' ', String(page)),
        h(
          'button',
          {type: 'button', disabled: busy || !hasNext, onClick: onNextPage},
          t('Next'),
        ),
      ),
  )
}

// Compact vertical column of recent OGS games, used on the Home dashboard.
// Each entry is a single row: mini board, opponent, result, and review
// actions. Keeps the two distinct review workflows (OGS AI review vs local
// Seki analysis) as separate compact actions.
export function OgsGameHistoryColumn({
  games = [],
  busy = false,
  error = null,
  authenticated = false,
  emptyText = t('No recent games loaded yet.'),
  onRefresh,
  onOpenGame,
  onAnalyzeOgs,
  onAnalyzeSeki,
  onOpenOgs,
}) {
  let currentUserId = onlineStore.getState().user?.id ?? null

  return h(
    'div',
    {class: 'ogs-history-column'},
    h(
      'div',
      {class: 'ogs-history-column-toolbar'},
      authenticated
        ? h(
            'button',
            {type: 'button', disabled: busy, onClick: onRefresh},
            busy ? t('Loading...') : t('Refresh'),
          )
        : onOpenOgs != null &&
            h('button', {type: 'button', onClick: onOpenOgs}, t('Connect OGS')),
    ),
    error != null && h('p', {class: 'ogs-error'}, error),
    !authenticated
      ? h('p', {class: 'ogs-empty'}, t('Connect OGS to see your history.'))
      : games.length === 0
        ? h('p', {class: 'ogs-empty'}, busy ? t('Loading...') : emptyText)
        : h(
            'div',
            {class: 'ogs-history-column-list'},
            games.map((game) =>
              h(OgsGameHistoryColumnEntry, {
                key: game.id,
                game,
                currentUserId,
                onOpenGame,
                onAnalyzeOgs,
                onAnalyzeSeki,
              }),
            ),
          ),
  )
}

class OgsGameHistoryColumnEntry extends Component {
  constructor(props) {
    super(props)
    this.state = {preview: null}
    this.handlePreview = (preview) => this.setState({preview})
  }

  render() {
    let {game, currentUserId, onOpenGame, onAnalyzeOgs, onAnalyzeSeki} =
      this.props
    let displayGame = {...game, winnerColor: this.state.preview?.winnerColor}
    let outcome = getGameOutcome(displayGame, currentUserId)
    let opponent = getOpponent(game, currentUserId)
    let userColor = getUserColor(game, currentUserId)
    let opponentName = opponent?.username || game.name || `#${game.id}`

    return h(
      'article',
      {
        class: `ogs-history-column-entry ${outcome.status}`,
        role: 'button',
        tabIndex: 0,
        onClick: () => onOpenGame?.(game.id),
        onKeyDown: (evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault()
            onOpenGame?.(game.id)
          }
        },
      },
      h(LazyMiniGoban, {game, onPreview: this.handlePreview}),
      h(
        'div',
        {class: 'ogs-history-column-body'},
        h(
          'strong',
          {class: 'ogs-history-column-opponent', title: opponentName},
          opponentName,
          opponent?.rank != null &&
            h(
              'span',
              {class: 'ogs-history-column-rank'},
              ` · ${opponent.rank}`,
            ),
        ),
        userColor != null &&
          h(
            'span',
            {class: 'ogs-history-column-color'},
            userColor === 'B' ? t('You played Black') : t('You played White'),
          ),
        h(
          'span',
          {class: 'ogs-history-column-result'},
          resultStone(displayGame),
          getOutcomeLabel(displayGame, currentUserId, t) ||
            game.result ||
            t('Result unknown'),
        ),
        h(
          'span',
          {class: 'ogs-history-column-meta'},
          formatBoard(game.board, t),
          game.ended ? ` · ${formatEndDate(game.ended)}` : '',
        ),
        h(
          'div',
          {class: 'ogs-history-column-actions'},
          h(
            'button',
            {
              type: 'button',
              onClick: (evt) => {
                evt.stopPropagation()
                onAnalyzeOgs?.(game.id)
              },
              onKeyDown: (evt) => evt.stopPropagation(),
            },
            t('Analyze OGS'),
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: (evt) => {
                evt.stopPropagation()
                onAnalyzeSeki?.(game.id)
              },
              onKeyDown: (evt) => evt.stopPropagation(),
            },
            t('Analyze Seki'),
          ),
        ),
      ),
    )
  }
}

export function getOpponent(game, currentUserId) {
  let players = [game.black, game.white].filter(Boolean)
  if (currentUserId == null) return null
  return (
    players.find(
      (player) =>
        player.id != null && Number(player.id) !== Number(currentUserId),
    ) || null
  )
}

export function getOpponentName(game, currentUserId) {
  return getOpponent(game, currentUserId)?.username || null
}

export function getUserColor(game, currentUserId) {
  if (currentUserId == null) return null
  if (
    game.black?.id != null &&
    Number(game.black.id) === Number(currentUserId)
  ) {
    return 'B'
  }
  if (
    game.white?.id != null &&
    Number(game.white.id) === Number(currentUserId)
  ) {
    return 'W'
  }
  return null
}

export function getOutcomeLabel(game, currentUserId, t) {
  let userColor = getUserColor(game, currentUserId)
  let winnerColor = getWinnerColor(game)
  if (userColor == null || winnerColor == null) return null

  let won = userColor === winnerColor
  let detail = getResultDetail(game.result)
  if (detail == null) return null
  if (detail === 'resignation') {
    return won ? t('Won by resignation') : t('Lost by resignation')
  }
  if (detail === 'time') return won ? t('Won by time') : t('Lost by time')
  return won
    ? `${t('Won by')} ${detail} ${t('points')}`
    : `${t('Lost by')} ${detail} ${t('points')}`
}

export function getResultDetail(result) {
  if (typeof result !== 'string') return null
  let rest = result.trim().slice(1)
  if (rest.startsWith('+')) rest = rest.slice(1)
  if (rest === 'R') return 'resignation'
  if (rest === 'T') return 'time'
  if (rest === '') return null
  return rest
}

export function getWinnerColor(game) {
  let result = typeof game.result === 'string' ? game.result.trim()[0] : null
  if (result === 'B' || result === 'W') return result

  if (game.winnerColor === 'B' || game.winnerColor === 'W') {
    return game.winnerColor
  }

  if (game.winner != null) {
    if (Number(game.winner) === Number(game.black?.id)) return 'B'
    if (Number(game.winner) === Number(game.white?.id)) return 'W'
  }

  return null
}

export function getGameOutcome(game, currentUserId) {
  let winner = winnerLabel(game)
  if (winner == null) return {status: '', winner: null}

  let winnerId =
    game.winner ??
    (getWinnerColor(game) === 'B' ? game.black?.id : game.white?.id)
  let status = ''
  if (currentUserId != null && winnerId != null) {
    status = Number(winnerId) === Number(currentUserId) ? 'won' : 'lost'
  }

  return {status, winner}
}

function formatEndDate(ended) {
  if (typeof ended !== 'string' || ended === '') return null
  let date = new Date(ended)
  if (Number.isNaN(date.getTime())) return ended.slice(0, 10)
  return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

class OgsGameHistoryCard extends Component {
  constructor(props) {
    super(props)
    this.state = {preview: null}
    this.handlePreview = (preview) => this.setState({preview})
  }

  render() {
    let {game, currentUserId, onOpenGame, onAnalyzeOgs, onAnalyzeSeki} =
      this.props
    let displayGame = {...game, winnerColor: this.state.preview?.winnerColor}
    let outcome = getGameOutcome(displayGame, currentUserId)

    return h(
      'article',
      {
        type: 'button',
        class: `ogs-history-card ${outcome.status}`,
        role: 'button',
        tabIndex: 0,
        onClick: () => onOpenGame?.(game.id),
        onKeyDown: (evt) => {
          if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault()
            onOpenGame?.(game.id)
          }
        },
      },
      outcome.winner != null &&
        h(
          'span',
          {class: 'ogs-history-outcome'},
          outcome.status === 'won' ? '✓' : outcome.status === 'lost' ? '×' : '',
          ' ',
          outcome.winner,
        ),
      h(LazyMiniGoban, {game, onPreview: this.handlePreview}),
      h(
        'span',
        {class: 'ogs-history-card-body'},
        h('strong', {}, game.name || `#${game.id}`),
        h(
          'span',
          {class: 'ogs-history-players'},
          h(
            'span',
            {},
            h('i', {class: 'ogs-stone black'}),
            t('Black'),
            ': ',
            game.black?.username || t('Black'),
          ),
          h(
            'span',
            {},
            h('i', {class: 'ogs-stone white'}),
            t('White'),
            ': ',
            game.white?.username || t('White'),
          ),
        ),
        h(
          'span',
          {class: 'ogs-history-result'},
          resultStone(displayGame),
          game.result || t('Result unknown'),
          winnerLabel(displayGame) != null &&
            h(
              'span',
              {class: 'ogs-history-winner'},
              ` · ${winnerLabel(displayGame)}`,
            ),
        ),
        h(
          'span',
          {class: 'ogs-history-meta'},
          formatBoard(game.board, t),
          game.ended ? ` · ${game.ended.slice(0, 10)}` : '',
        ),
        h(
          'span',
          {class: 'ogs-history-actions'},
          h(
            'button',
            {
              type: 'button',
              onClick: (evt) => {
                evt.stopPropagation()
                onAnalyzeOgs?.(game.id)
              },
              onKeyDown: (evt) => evt.stopPropagation(),
            },
            t('Analyze OGS'),
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: (evt) => {
                evt.stopPropagation()
                onAnalyzeSeki?.(game.id)
              },
              onKeyDown: (evt) => evt.stopPropagation(),
            },
            t('Analyze Seki'),
          ),
        ),
      ),
    )
  }
}

function resultStone(game) {
  let color = getWinnerColor(game)
  if (color !== 'B' && color !== 'W') return null

  return h('i', {class: `ogs-stone ${color === 'B' ? 'black' : 'white'}`})
}

function winnerLabel(game) {
  let color = getWinnerColor(game)
  if (color === 'B') return t('Black')
  if (color === 'W') return t('White')
  return null
}

class LazyMiniGoban extends Component {
  constructor(props) {
    super(props)

    this.state = getCachedPreviewState(getPreviewCacheKey(props.game?.id))
  }

  componentDidMount() {
    if (this.state.preview != null) this.props.onPreview?.(this.state.preview)
    this.loadPreview()
  }

  componentDidUpdate(previousProps) {
    if (previousProps.game?.id === this.props.game?.id) return

    this.setState(
      getCachedPreviewState(getPreviewCacheKey(this.props.game?.id)),
      () => {
        this.loadPreview()
      },
    )
  }

  componentWillUnmount() {
    this.disposed = true
  }

  async loadPreview() {
    let gameId = this.props.game?.id
    if (gameId == null) return
    let cacheKey = getPreviewCacheKey(gameId)

    let cached = getPreviewCacheEntry(cacheKey)
    if (cached != null) {
      if (cached.status === 'loading') {
        this.setState({status: 'loading', preview: null})
        let preview = await cached.promise
        if (!this.disposed && this.props.game?.id === gameId) {
          this.setState(getCachedPreviewState(cacheKey, preview))
        }
      } else {
        this.props.onPreview?.(cached.preview)
      }

      return
    }

    let promise = enqueuePreviewLoad(() => loadSgfPreview(cacheKey, gameId))
    setPreviewCacheEntry(cacheKey, {status: 'loading', promise})
    this.setState({status: 'loading', preview: null})

    let preview = await promise
    this.props.onPreview?.(preview)
    if (!this.disposed && this.props.game?.id === gameId) {
      this.setState(getCachedPreviewState(cacheKey, preview))
    }
  }

  render({game}, {preview, status}) {
    return h(MiniGoban, {board: game.board, preview, status})
  }
}

async function loadSgfPreview(cacheKey, gameId) {
  let result = await onlineStore.downloadGameSgf(gameId, {recordError: false})

  if (result.stale) {
    previewCache.delete(cacheKey)
    return null
  }

  if (!result.ok) {
    setPreviewCacheEntry(cacheKey, {status: 'error', preview: null})
    return null
  }

  let preview = parseSgfPreview(result.sgf)
  setPreviewCacheEntry(cacheKey, {
    status: preview == null ? 'error' : 'ready',
    preview,
  })

  return preview
}

function getCachedPreviewState(cacheKey, resolvedPreview) {
  if (resolvedPreview !== undefined) {
    return {
      status: resolvedPreview == null ? 'error' : 'ready',
      preview: resolvedPreview,
    }
  }

  let cached = getPreviewCacheEntry(cacheKey)
  if (cached == null || cached.status === 'loading') {
    return {status: cached?.status || 'idle', preview: null}
  }

  return {status: cached.status, preview: cached.preview}
}

function getPreviewCacheKey(gameId) {
  let userId = onlineStore.getState().user?.id ?? 'anonymous'

  return `${userId}:${gameId}`
}

function setPreviewCacheEntry(cacheKey, entry) {
  previewCache.delete(cacheKey)
  previewCache.set(cacheKey, entry)

  while (previewCache.size > maxPreviewCacheEntries) {
    previewCache.delete(previewCache.keys().next().value)
  }
}

function getPreviewCacheEntry(cacheKey) {
  let entry = previewCache.get(cacheKey)
  if (entry == null) return null

  previewCache.delete(cacheKey)
  previewCache.set(cacheKey, entry)

  return entry
}

function enqueuePreviewLoad(task) {
  return new Promise((resolve) => {
    while (pendingPreviewTasks.length >= maxPendingPreviewLoads) {
      pendingPreviewTasks.shift()?.resolve(null)
    }

    pendingPreviewTasks.push({task, resolve})
    runNextPreviewLoad()
  })
}

async function runNextPreviewLoad() {
  if (
    activePreviewLoadCount >= maxConcurrentPreviewLoads ||
    pendingPreviewTasks.length === 0
  ) {
    return
  }

  let {task, resolve} = pendingPreviewTasks.shift()
  activePreviewLoadCount++

  try {
    resolve(await task())
  } finally {
    activePreviewLoadCount--
    runNextPreviewLoad()
  }
}

function MiniGoban({board, preview = null, status = 'idle'}) {
  let width = preview?.width || board?.width || board?.height || 19
  let height = preview?.height || board?.height || board?.width || 19
  let signMap = preview?.signMap || []
  let stones = []

  for (let y = 0; y < signMap.length; y++) {
    for (let x = 0; x < signMap[y].length; x++) {
      let sign = signMap[y][x]
      if (sign === 0) continue

      stones.push({x, y, sign})
    }
  }

  let hasPreview = preview != null
  let currentVertex = preview?.currentVertex
  let hasCurrentVertex =
    currentVertex != null &&
    currentVertex[0] >= 0 &&
    currentVertex[0] < width &&
    currentVertex[1] >= 0 &&
    currentVertex[1] < height

  return h(
    'span',
    {
      class: ['ogs-mini-goban', hasPreview ? 'has-preview' : null]
        .filter(Boolean)
        .join(' '),
      'aria-label': formatBoard({width, height}, t),
      style: {
        backgroundSize: `${100 / Math.max(1, width - 1)}% ${100 / Math.max(1, height - 1)}%`,
      },
    },
    hasPreview &&
      stones.map((stone) =>
        h('span', {
          key: `${stone.x}-${stone.y}`,
          class: `ogs-mini-stone ${stone.sign > 0 ? 'black' : 'white'}`,
          style: {
            left: `${getMiniGobanPointPercent(stone.x, width)}%`,
            top: `${getMiniGobanPointPercent(stone.y, height)}%`,
          },
        }),
      ),
    !hasPreview &&
      h(
        'span',
        {class: 'ogs-mini-placeholder'},
        status === 'error' ? t('Preview unavailable') : t('Loading preview'),
      ),
    hasCurrentVertex &&
      h('span', {
        class: 'ogs-mini-current-vertex',
        style: {
          left: `${getMiniGobanPointPercent(currentVertex[0], width)}%`,
          top: `${getMiniGobanPointPercent(currentVertex[1], height)}%`,
        },
      }),
    h('span', {class: 'ogs-mini-size'}, `${width}x${height}`),
  )
}

function getMiniGobanPointPercent(index, size) {
  if (size <= 1) return 50

  return (index / (size - 1)) * 100
}

export function clearOgsGameHistoryPreviewCache() {
  previewCache.clear()
}

export function getHistoryPreview(games, limit = 3) {
  return Array.isArray(games) ? games.slice(0, limit) : []
}

export {MiniGoban, LazyMiniGoban}
