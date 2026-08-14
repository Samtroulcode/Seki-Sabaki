import {h} from 'preact'

import i18n from '../../i18n.js'
import {formatBoard, formatPlayers} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')

export function OnlineGameForm({
  onlineGame,
  activeGames = [],
  authenticated,
  busy,
  onConnectGame,
  onDisconnectGame,
}) {
  let gameStatus = onlineGame?.status || 'idle'
  let hasGame = onlineGame?.gameId != null

  return h(
    'section',
    {class: 'ogs-online-game'},
    h('h3', {}, t('Active games')),
    h('p', {}, t('Games reported by OGS for this account.')),
    activeGames.length === 0
      ? h('p', {class: 'ogs-empty'}, t('No active games reported yet.'))
      : h(
          'ul',
          {class: 'ogs-active-games'},
          activeGames.map((game) =>
            h(
              'li',
              {key: game.id},
              h(
                'div',
                {class: 'ogs-active-game-summary'},
                h('strong', {}, game.name || `#${game.id}`),
                h('span', {}, formatBoard(game.board, t)),
                h('span', {}, game.phase || t('Unknown')),
                h('span', {}, t('Move'), ' ', String(game.moveNumber || 0)),
                h('span', {}, formatPlayers(game.black, game.white, t)),
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: busy || !authenticated,
                  onClick: () => onConnectGame(game.id),
                },
                onlineGame?.gameId === game.id ? t('Open game') : t('View'),
              ),
            ),
          ),
        ),
    h(
      'dl',
      {class: 'ogs-game-status'},
      h('dt', {}, t('Status')),
      h('dd', {}, gameStatus),
      h('dt', {}, t('Game')),
      h('dd', {}, hasGame ? String(onlineGame.gameId) : t('None')),
      h('dt', {}, t('Name')),
      h('dd', {}, onlineGame?.gameName || t('Unknown')),
      h('dt', {}, t('Board')),
      h('dd', {}, formatBoard(onlineGame?.board, t)),
      h('dt', {}, t('Phase')),
      h('dd', {}, onlineGame?.phase || t('Unknown')),
      h('dt', {}, t('Moves')),
      h('dd', {}, String(onlineGame?.moveCount || 0)),
    ),
    onlineGame?.error != null && h('p', {class: 'ogs-error'}, onlineGame.error),
    onlineGame?.players != null &&
      h(
        'p',
        {class: 'ogs-game-players'},
        t('Black'),
        ': ',
        onlineGame.players.black?.username || t('Unknown'),
        ' — ',
        t('White'),
        ': ',
        onlineGame.players.white?.username || t('Unknown'),
      ),
    onlineGame?.chat?.length > 0 &&
      h(
        'ol',
        {class: 'ogs-game-chat'},
        onlineGame.chat
          .slice(-5)
          .map((line) =>
            h(
              'li',
              {},
              h('strong', {}, line.username || t('OGS')),
              ': ',
              line.body,
            ),
          ),
      ),
    hasGame &&
      h(
        'button',
        {type: 'button', onClick: onDisconnectGame},
        t('Disconnect game'),
      ),
  )
}
