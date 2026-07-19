import {h, Component} from 'preact'

import i18n from '../../i18n.js'

const t = i18n.context('OgsGameContextPanel')

export default class OgsGameContextPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      user: null,
      onlineGame: null,
      error: null,
      busy: false,
    }

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
  }

  async componentDidMount() {
    await this.refreshOgsState()
    this.pollTimer = setInterval(() => this.refreshOgsState(), 2000)
  }

  async componentDidUpdate(prevProps) {
    if (prevProps.onlineGameId !== this.props.onlineGameId) {
      await this.refreshOgsState()
    }
  }

  componentWillUnmount() {
    clearInterval(this.pollTimer)
  }

  async refreshOgsState() {
    let state

    try {
      state = await window.sabaki.ogs.getState()
    } catch (err) {
      this.setState({error: t('OGS game details are unavailable.')})
      return
    }

    this.setState({
      user: state?.user || null,
      onlineGame: state?.onlineGame || null,
      error: state?.onlineGame?.error || null,
    })
  }

  render({onlineGameId}, {user, onlineGame, error, busy}) {
    let game = onlineGame?.gameId === onlineGameId ? onlineGame : null
    let playable = game?.status === 'connected' && game?.phase === 'play'

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
            }),
            h(PlayerCard, {
              color: 'white',
              title: t('White'),
              player: game.players?.white,
              user,
              currentPlayerId: game.clock?.currentPlayer,
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
            ),
            h(ChatSection, {chat: game.chat}),
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
            disabled: busy || onlineGameId == null,
            onClick: this.handleDisconnectButtonClick,
          },
          t('Disconnect game'),
        ),
      ),
    )
  }
}

function PlayerCard({color, title, player, user, currentPlayerId}) {
  let isCurrentUser = user?.id != null && player?.id === Number(user.id)
  let rank = isCurrentUser ? user.rank : null
  let iconUrl = isCurrentUser ? user.iconUrl : null
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
    ),
    active && h('span', {class: 'ogs-game-context-turn'}, t('To move')),
  )
}

function ChatSection({chat = []}) {
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
  )
}

function formatGameId(gameId) {
  return gameId == null ? t('Unknown game') : `#${gameId}`
}

function formatBoard(board) {
  if (board == null) return t('Unknown')
  return `${board.width}x${board.height}`
}

function getInitial(player) {
  return (player?.username || '?').slice(0, 1).toUpperCase()
}
