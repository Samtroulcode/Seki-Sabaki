import {h} from 'preact'

import i18n from '../../i18n.js'
import {formatBoard} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')

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
    h(MiniGoban, {board: game.board}),
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

function MiniGoban({board}) {
  let width = board?.width || board?.height || 19
  let height = board?.height || board?.width || 19
  let lines = [0, 1, 2, 3, 4]

  return h(
    'span',
    {class: 'ogs-mini-goban', 'aria-label': formatBoard(board, t)},
    lines.map((y) =>
      lines.map((x) => h('span', {key: `${x}-${y}`, class: 'ogs-mini-point'})),
    ),
    h('span', {class: 'ogs-mini-size'}, `${width}x${height}`),
  )
}

export function getHistoryPreview(games, limit = 3) {
  return Array.isArray(games) ? games.slice(0, limit) : []
}

export {MiniGoban}
