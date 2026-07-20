import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import sabaki from '../../modules/sabaki.js'
import * as gametree from '../../modules/gametree.js'
import {getOgsClockView} from '../../modules/ogsclock.js'
import OgsPanelSyncController from '../../modules/ogspanelsync.js'
import onlineStore from '../../modules/onlinestore.js'

const t = i18n.context('OgsGameContextPanel')

export default class OgsGameContextPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      user: null,
      network: null,
      onlineGame: null,
      error: null,
      busy: false,
      chatBody: '',
      revision: 0,
    }
    this.syncController = new OgsPanelSyncController({sabaki})

    this.handleSabakiChange = () => {
      this.setState(({revision}) => ({revision: revision + 1}))
    }

    this.handleOnlineStoreState = (state) => {
      this.enqueueOgsState(state)
    }

    this.lastFallbackRefreshAt = 0
    this.handlingOgsState = false
    this.pendingOgsState = null

    this.handlePassButtonClick = async () => {
      let {onPass = () => {}} = this.props
      await onPass()
      await this.refreshOgsState()
    }

    this.handleResignButtonClick = async () => {
      let {onResign = () => {}} = this.props
      await onResign()
      await this.refreshOgsState()
    }

    this.handleAcceptRemovedStonesButtonClick = async () => {
      let {onAcceptRemovedStones = () => {}} = this.props
      this.setState({busy: true, error: null})

      try {
        await onAcceptRemovedStones()
      } finally {
        this.setState({busy: false})
      }

      await this.refreshOgsState()
    }

    this.handleDisconnectButtonClick = async () => {
      let {onlineGameId, onDisconnectGame = () => {}} = this.props
      if (onlineGameId == null) return

      this.setState({busy: true, error: null})

      try {
        let result = await onDisconnectGame(onlineGameId)

        if (result?.ok === false) {
          this.setState({
            error: result.error?.message || t('Unable to disconnect game.'),
          })
        }
      } catch (err) {
        this.setState({error: t('Unable to disconnect game.')})
      }

      this.setState({busy: false})
      await this.refreshOgsState()
    }

    this.handleChatInput = (evt) => {
      this.setState({chatBody: evt.currentTarget.value})
    }

    this.handleChatSubmit = async (evt) => {
      evt.preventDefault()

      let {onlineGameId} = this.props
      let body = this.state.chatBody.trim()
      if (onlineGameId == null || body === '') return

      this.setState({busy: true, error: null})

      try {
        let result = await window.sabaki.ogs.sendChat(onlineGameId, body)

        if (result?.ok === false) {
          this.setState({
            error: result.error?.message || t('Unable to send chat message.'),
          })
          this.setState({busy: false})
          return
        } else {
          this.setState({chatBody: ''})
        }
      } catch (err) {
        this.setState({error: t('Unable to send chat message.')})
        this.setState({busy: false})
        return
      }

      this.setState({busy: false})
      await this.refreshOgsState()
    }
  }

  async componentDidMount() {
    sabaki.on('change', this.handleSabakiChange)
    this.unsubscribeOnlineStore = onlineStore.subscribe(
      this.handleOnlineStoreState,
    )
    this.pollTimer = setInterval(() => this.refreshOgsStateIfDue(), 2000)
    this.clockTimer = setInterval(this.handleSabakiChange, 1000)
    await this.refreshOgsState()
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.onlineGameId !== this.props.onlineGameId) {
      this.syncController.resetConnectAttempt()
      await this.refreshOgsState()
    }
  }

  componentWillUnmount() {
    sabaki.removeListener('change', this.handleSabakiChange)
    this.unsubscribeOnlineStore?.()
    clearInterval(this.pollTimer)
    clearInterval(this.clockTimer)
  }

  async refreshOgsState() {
    try {
      let state = await onlineStore.refresh()
      if (state == null) {
        this.setState({error: t('OGS game details are unavailable.')})
      }
    } catch (err) {
      this.setState({error: t('OGS game details are unavailable.')})
      return
    }

    this.lastFallbackRefreshAt = Date.now()
  }

  async enqueueOgsState(state) {
    this.pendingOgsState = state
    if (this.handlingOgsState) return

    this.handlingOgsState = true
    try {
      while (this.pendingOgsState != null) {
        let nextState = this.pendingOgsState
        this.pendingOgsState = null
        await this.applyOgsState(nextState)
      }
    } finally {
      this.handlingOgsState = false
    }
  }

  async refreshOgsStateIfDue() {
    let now = Date.now()
    if (hasOgsStateChangeEvents() && now - this.lastFallbackRefreshAt < 60000) {
      return
    }

    this.lastFallbackRefreshAt = now
    await this.refreshOgsState()
  }

  async applyOgsState(state) {
    this.setState({
      user: state?.user || null,
      network: state?.network || null,
      onlineGame: state?.onlineGame || null,
      error: state?.onlineGame?.error || null,
    })

    let onlineGame = state?.onlineGame
    await this.syncController.handleOnlineGameError(onlineGame)

    if (onlineGame?.pendingMove === true) return

    if (onlineGame?.gameId === this.props.onlineGameId) {
      await this.syncController.syncOnlineGameToBoard(onlineGame, {
        enterStoneRemovalMode: true,
      })
    }
  }

  render({onlineGameId}, {user, network, onlineGame, error, busy, chatBody}) {
    let game = onlineGame?.gameId === onlineGameId ? onlineGame : null
    game = withOptimisticPendingMove(game)
    let playable = game?.status === 'connected' && game?.phase === 'play'
    let removingStones =
      game?.status === 'connected' &&
      (game.phase === 'stone removal' || game.clock?.stoneRemovalMode === true)
    let captures = getOgsCaptures(game)
    let pendingMove = sabaki.ogsPendingMove?.gameId === game?.gameId
    let clockView = getOgsClockView(game?.clock, game?.players, Date.now(), {
      drift: network?.drift,
      freezeActive: pendingMove,
      freezeAt: sabaki.ogsPendingMove?.submittedAt,
    })

    return h(
      'div',
      {class: 'ogs-game-context-panel'},
      h(
        'header',
        {class: 'ogs-game-context-header'},
        h('h2', {}, t('Online game')),
        h('p', {}, game?.gameName || formatGameId(onlineGameId)),
      ),

      game == null
        ? h('p', {class: 'ogs-empty'}, t('Loading OGS game details…'))
        : [
            h(PlayerCard, {
              color: 'black',
              title: t('Black'),
              player: game.players?.black,
              user,
              currentPlayerId: game.clock?.currentPlayer,
              captures: captures.black,
              clock: clockView.black,
            }),
            h(PlayerCard, {
              color: 'white',
              title: t('White'),
              player: game.players?.white,
              user,
              currentPlayerId: game.clock?.currentPlayer,
              captures: captures.white,
              clock: clockView.white,
            }),
            h(
              'dl',
              {class: 'ogs-game-context-status'},
              h('dt', {}, t('Game')),
              h('dd', {}, formatGameId(game.gameId)),
              h('dt', {}, t('Board')),
              h('dd', {}, formatBoard(game.board)),
              h('dt', {}, t('Phase')),
              h('dd', {}, game.phase || t('Unknown')),
              h('dt', {}, t('Moves')),
              h('dd', {}, String(game.moveCount || 0)),
              h('dt', {}, t('Handicap')),
              h(
                'dd',
                {},
                game.handicap == null ? t('None') : String(game.handicap),
              ),
              h('dt', {}, t('Komi')),
              h('dd', {}, game.komi == null ? t('Unknown') : String(game.komi)),
              h('dt', {}, t('Rules')),
              h('dd', {}, game.rules || t('Unknown')),
              h('dt', {}, t('Ranked')),
              h('dd', {}, formatRanked(game.ranked)),
              removingStones && h('dt', {}, t('Dead stones')),
              removingStones &&
                h('dd', {}, formatDeadStones(sabaki.state.deadStones)),
            ),
            removingStones &&
              h(
                'p',
                {class: 'ogs-stone-removal-hint'},
                t('Click stones on the board to mark dead groups.'),
              ),
            h(ChatSection, {
              chat: game.chat,
              body: chatBody,
              disabled: busy || game?.status !== 'connected',
              onInput: this.handleChatInput,
              onSubmit: this.handleChatSubmit,
            }),
          ],

      error != null && h('p', {class: 'ogs-error'}, error),

      h(
        'div',
        {class: 'ogs-game-context-actions'},
        h(
          'button',
          {
            type: 'button',
            disabled: busy || !playable,
            onClick: this.handlePassButtonClick,
          },
          t('Pass'),
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: busy || !playable,
            onClick: this.handleResignButtonClick,
          },
          t('Resign'),
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: busy || !removingStones,
            onClick: this.handleAcceptRemovedStonesButtonClick,
          },
          t('Accept dead stones'),
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: busy || onlineGameId == null,
            onClick: this.handleDisconnectButtonClick,
          },
          t('Disconnect game'),
        ),
      ),
    )
  }
}

function PlayerCard({
  color,
  title,
  player,
  user,
  currentPlayerId,
  captures = 0,
  clock,
}) {
  let isCurrentUser = user?.id != null && player?.id === Number(user.id)
  let rank = player?.rank || (isCurrentUser ? user.rank : null)
  let iconUrl = player?.iconUrl || (isCurrentUser ? user.iconUrl : null)
  let active = currentPlayerId != null && currentPlayerId === player?.id

  return h(
    'section',
    {class: `ogs-game-context-player ${color} ${active ? 'active' : ''}`},
    iconUrl == null
      ? h('div', {class: 'ogs-game-context-avatar'}, getInitial(player))
      : h('img', {class: 'ogs-game-context-avatar', src: iconUrl, alt: ''}),
    h(
      'div',
      {class: 'ogs-game-context-player-info'},
      h('h3', {}, title),
      h('strong', {}, player?.username || t('Unknown')),
      h('span', {}, rank || t('Rank unavailable')),
      h(
        'span',
        {
          class: 'ogs-game-context-captures',
          title: t('Captures'),
        },
        t('Captures'),
        ': ',
        String(captures),
      ),
      h(PlayerClock, {clock}),
    ),
    active && h('span', {class: 'ogs-game-context-turn'}, t('To move')),
  )
}

function PlayerClock({clock}) {
  if (clock == null || clock.label === '—') return null

  return h(
    'span',
    {
      class: `ogs-game-context-clock ${clock.active ? 'active' : ''}`,
      title: t('Clock'),
    },
    t('Clock'),
    ': ',
    h('strong', {}, clock.label),
    clock.detail != null && [' · ', clock.detail],
  )
}

function getOgsCaptures(game) {
  if (game?.gameId == null || sabaki.state.onlineGameId !== game.gameId) {
    return {black: 0, white: 0}
  }

  let tree = sabaki.state.gameTrees[sabaki.state.gameIndex]
  let [lineEnd] = sabaki.getOgsLineNodes(tree).slice(-1)
  let board = gametree.getBoard(tree, lineEnd.id)

  return {
    black: board.getCaptures(1),
    white: board.getCaptures(-1),
  }
}

function ChatSection({chat = [], body = '', disabled, onInput, onSubmit}) {
  return h(
    'section',
    {class: 'ogs-game-context-chat'},
    h('h3', {}, t('Chat')),
    chat.length === 0
      ? h('p', {class: 'ogs-empty'}, t('No chat messages yet.'))
      : h(
          'ol',
          {'aria-label': t('OGS chat')},
          chat
            .slice(-8)
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
    h(
      'form',
      {class: 'ogs-game-context-chat-form', onSubmit},
      h('input', {
        type: 'text',
        name: 'ogsChatMessage',
        value: body,
        maxlength: 1000,
        placeholder: t('Send a message…'),
        disabled,
        onInput,
      }),
      h(
        'button',
        {
          type: 'submit',
          disabled: disabled || body.trim() === '',
        },
        t('Send'),
      ),
    ),
  )
}

function formatGameId(gameId) {
  return gameId == null ? t('Unknown game') : `#${gameId}`
}

function formatBoard(board) {
  if (board == null) return t('Unknown')
  return `${board.width}x${board.height}`
}

function formatRanked(ranked) {
  if (ranked == null) return t('Unknown')
  return ranked ? t('Ranked') : t('Unranked')
}

function formatDeadStones(deadStones = []) {
  return t((p) => `${p.count} marked`, {count: deadStones.length})
}

function getInitial(player) {
  return (player?.username || '?').slice(0, 1).toUpperCase()
}

function hasOgsStateChangeEvents() {
  return onlineStore.isUsingCurrentOgsStateChangeEvents()
}

function withOptimisticPendingMove(game) {
  let pendingMove = sabaki.ogsPendingMove

  if (game == null || pendingMove?.gameId !== game.gameId) return game

  return {
    ...game,
    pendingMove: true,
    moveCount: Math.max(game.moveCount || 0, pendingMove.moveNumber),
  }
}
