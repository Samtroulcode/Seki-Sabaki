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
  onOpenOgs,
}) {
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
              h(OgsGameHistoryCard, {key: game.id, game, onOpenGame}),
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

function OgsGameHistoryCard({game, onOpenGame}) {
  return h(
    'button',
    {
      type: 'button',
      class: 'ogs-history-card',
      onClick: () => onOpenGame?.(game.id),
    },
    h(LazyMiniGoban, {game}),
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
        game.result || t('Result unknown'),
      ),
      h(
        'span',
        {class: 'ogs-history-meta'},
        formatBoard(game.board, t),
        game.ended ? ` · ${game.ended.slice(0, 10)}` : '',
      ),
    ),
  )
}

class LazyMiniGoban extends Component {
  constructor(props) {
    super(props)

    this.state = getCachedPreviewState(getPreviewCacheKey(props.game?.id))
  }

  componentDidMount() {
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
      }

      return
    }

    let promise = enqueuePreviewLoad(() => loadSgfPreview(cacheKey, gameId))
    setPreviewCacheEntry(cacheKey, {status: 'loading', promise})
    this.setState({status: 'loading', preview: null})

    let preview = await promise
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
