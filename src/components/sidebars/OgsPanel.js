import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import sabaki from '../../modules/sabaki.js'

const t = i18n.context('OgsPanel')

const boardSizes = [9, 13, 19]
const speeds = ['blitz', 'rapid', 'live', 'correspondence']
const timeSystems = ['byoyomi', 'fischer']
const conditions = ['required', 'preferred', 'no-preference']
const rules = ['japanese', 'chinese', 'aga', 'korean', 'ing', 'nz']
const handicapValues = ['enabled', 'disabled']
const defaultMatchmakingOptions = {
  boardSizes: [19],
  speeds: ['rapid'],
  timeSystem: 'byoyomi',
  lowerRankDiff: 3,
  upperRankDiff: 3,
  rules: {condition: 'required', value: 'japanese'},
  handicap: {condition: 'preferred', value: 'enabled'},
}

export default class OgsPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: '',
      user: null,
      busy: false,
      error: null,
      connected: false,
      socket: null,
      matchmaking: {options: defaultMatchmakingOptions},
      onlineGame: null,
      activeGames: [],
      activeSection: 'overview',
    }

    this.syncedOnlineGameKey = null
    this.declinedOnlineGameId = null
    this.handledOnlineGameErrorKey = null
    this.syncingOnlineGame = false

    this.handleUsernameInput = (evt) => {
      this.setState({username: evt.currentTarget.value})
    }

    this.handleSectionButtonClick = (activeSection) => {
      this.setState({activeSection})
    }

    this.handleSubmit = async (evt) => {
      evt.preventDefault()

      let username = this.state.username.trim()
      let password = this.passwordInputElement?.value || ''

      if (username === '') return

      this.setState({busy: true, error: null})

      if (this.passwordInputElement != null) {
        this.passwordInputElement.value = ''
      }

      let result

      try {
        result = await window.sabaki.ogs.login(username, password)
      } catch (err) {
        result = {ok: false, error: {message: t('Unable to connect to OGS.')}}
      }

      if (result.ok) {
        this.setState({
          username,
          user: result.user,
          socket: result.state?.socket || null,
          matchmaking: result.state?.matchmaking || this.state.matchmaking,
          onlineGame: result.state?.onlineGame || null,
          activeGames: result.state?.activeGames || [],
          connected: true,
        })
      } else {
        this.setState({error: result.error?.message || t('OGS login failed.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectButtonClick = async () => {
      sabaki.detachOgsGame()
      await window.sabaki.ogs.logout()
      this.setState({
        user: null,
        connected: false,
        error: null,
        socket: null,
        onlineGame: null,
        activeGames: [],
      })
      this.syncedOnlineGameKey = null
      this.declinedOnlineGameId = null
      this.handledOnlineGameErrorKey = null
    }

    this.handleActiveGameButtonClick = async (gameId) => {
      this.setState({busy: true, error: null})

      try {
        if (
          this.state.onlineGame?.gameId === gameId &&
          this.state.onlineGame?.status === 'connected'
        ) {
          let loaded = await this.syncOnlineGameToBoard(this.state.onlineGame)
          if (loaded) sabaki.setState({activeWorkspace: 'board'})
          this.setState({busy: false})
          return
        }

        let result = await window.sabaki.ogs.connectGame(gameId)
        this.declinedOnlineGameId = null
        this.handledOnlineGameErrorKey = null

        if (result.ok) {
          this.setState({
            socket: result.state.socket,
            matchmaking: result.state.matchmaking,
            onlineGame: result.state.onlineGame,
            activeGames: result.state.activeGames || this.state.activeGames,
          })
          await this.syncOnlineGameToBoard(result.state.onlineGame)
        } else {
          this.setState({
            error: result.error?.message || t('Unable to connect to game.'),
            onlineGame: result.state?.onlineGame || this.state.onlineGame,
            activeGames: result.state?.activeGames || this.state.activeGames,
          })
        }
      } catch (err) {
        this.setState({error: t('Unable to connect to game.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectGameButtonClick = async () => {
      let gameId = this.state.onlineGame?.gameId
      if (gameId == null) return

      let result = await window.sabaki.ogs.disconnectGame(gameId)

      if (result.ok) {
        this.setState({onlineGame: result.state.onlineGame})
        sabaki.detachOgsGame(gameId)
        this.syncedOnlineGameKey = null
      }
    }

    this.handleMatchmakingOptionChange = async (evt) => {
      let {name, value} = evt.currentTarget

      await this.updateMatchmakingOptions({
        ...this.state.matchmaking.options,
        [name]: name.endsWith('RankDiff') ? +value : value,
      })
    }

    this.handleConditionOptionChange = async (evt) => {
      let {name, value} = evt.currentTarget
      let [group, key] = name.split('.')

      await this.updateMatchmakingOptions({
        ...this.state.matchmaking.options,
        [group]: {
          ...this.state.matchmaking.options[group],
          [key]: value,
        },
      })
    }

    this.handleMultiOptionChange = async (evt) => {
      let {name, value, checked} = evt.currentTarget
      let current = this.state.matchmaking.options[name] || []
      let parsedValue = name === 'boardSizes' ? +value : value
      let next = checked
        ? [...current, parsedValue]
        : current.filter((item) => item !== parsedValue)

      await this.updateMatchmakingOptions({
        ...this.state.matchmaking.options,
        [name]: next,
      })
    }

    this.handleLogAutomatchButtonClick = async () => {
      try {
        let state = await window.sabaki.ogs.logMockAutomatchRequest()

        this.setState({
          matchmaking: state.matchmaking,
          socket: state.socket,
        })
      } catch (err) {}
    }
  }

  async syncOnlineGameToBoard(onlineGame) {
    if (
      onlineGame?.status !== 'connected' ||
      onlineGame.board == null ||
      !Array.isArray(onlineGame.moves)
    ) {
      return false
    }

    if (onlineGame.phase === 'finished' && sabaki.state.onlineGameId == null) {
      return false
    }

    if (this.declinedOnlineGameId === onlineGame.gameId) return false
    if (this.syncingOnlineGame) return false

    let key = getOnlineGameSyncKey(onlineGame)
    if (
      key === this.syncedOnlineGameKey &&
      (sabaki.state.onlineGameId === onlineGame.gameId ||
        (onlineGame.phase === 'finished' && sabaki.state.onlineGameId == null))
    ) {
      return true
    }

    let sameGame = sabaki.state.onlineGameId === onlineGame.gameId
    let loaded = false

    this.syncingOnlineGame = true
    try {
      loaded = sameGame ? await sabaki.applyOgsGameUpdate(onlineGame) : false

      if (!loaded) {
        loaded = await sabaki.loadOgsGame(onlineGame, {
          suppressAskForSave: sameGame,
          clearHistory: !sameGame,
        })
      }
    } finally {
      this.syncingOnlineGame = false
    }

    if (loaded) this.syncedOnlineGameKey = key
    else this.declinedOnlineGameId = onlineGame.gameId

    if (loaded && onlineGame.phase === 'finished') {
      await sabaki.showOgsGameEndInfo(onlineGame)
      sabaki.detachOgsGame(onlineGame.gameId)
    }

    return loaded
  }

  async updateMatchmakingOptions(options) {
    this.setState({
      matchmaking: {...this.state.matchmaking, options},
    })

    try {
      let state = await window.sabaki.ogs.setMatchmakingOptions(options)

      this.setState({
        matchmaking: state.matchmaking,
        socket: state.socket,
      })
    } catch (err) {}
  }

  async componentDidMount() {
    this.pollTimer = setInterval(() => this.refreshOgsState(), 2000)
    await this.refreshOgsState()
  }

  componentWillUnmount() {
    clearInterval(this.pollTimer)
  }

  async refreshOgsState() {
    let state = null

    try {
      state = await window.sabaki.ogs.getState()
    } catch (err) {
      return
    }

    if (state?.user != null) {
      this.setState({
        username: state.user.username || '',
        user: state.user,
        socket: state.socket,
        matchmaking: state.matchmaking,
        onlineGame: state.onlineGame,
        activeGames: state.activeGames || [],
        connected: true,
      })
      await this.handleOnlineGameError(state.onlineGame)
    }
  }

  async handleOnlineGameError(onlineGame) {
    if (onlineGame?.status !== 'error') return

    let key = `${onlineGame.gameId}:${onlineGame.error || ''}`
    if (key === this.handledOnlineGameErrorKey) return

    if (await sabaki.handleOgsGameError(onlineGame)) {
      this.handledOnlineGameErrorKey = key
    }
  }

  render(
    props,
    {
      username,
      user,
      busy,
      error,
      connected,
      socket,
      matchmaking,
      onlineGame,
      activeGames,
      activeSection,
    },
  ) {
    let matchmakingOptions = matchmaking?.options || defaultMatchmakingOptions
    let authenticated = socket?.status === 'authenticated'
    let connectedGame = onlineGame?.status === 'connected' ? onlineGame : null

    return h(
      'section',
      {id: 'ogs-dashboard', class: 'ogs-panel ogs-dashboard'},

      h(
        'div',
        {class: 'ogs-dashboard-hero', role: 'banner'},
        h(
          'div',
          {class: 'ogs-dashboard-title'},
          h('div', {class: 'ogs-panel-logo'}, 'OGS'),
          h(
            'div',
            {},
            h('p', {class: 'ogs-dashboard-kicker'}, t('Online workspace')),
            h('h2', {}, t('Online Go Server')),
            h('p', {}, t('Play, follow games, and manage your OGS account.')),
          ),
        ),
        h(
          'div',
          {class: 'ogs-dashboard-hero-actions'},
          h(
            'span',
            {
              class: `ogs-dashboard-status-pill ${authenticated ? 'online' : ''}`,
            },
            getSocketLabel(socket),
          ),
          connected &&
            h(
              'button',
              {type: 'button', onClick: this.handleDisconnectButtonClick},
              t('Disconnect'),
            ),
        ),
      ),

      h(OgsDashboardNav, {
        activeSection,
        onSectionClick: this.handleSectionButtonClick,
      }),

      h(
        'div',
        {class: 'ogs-dashboard-content'},
        h(
          'div',
          {
            class: `ogs-dashboard-grid ${!connected ? 'logged-out' : ''}`,
          },
          h(
            'aside',
            {class: 'ogs-dashboard-column ogs-dashboard-account'},
            h(
              'section',
              {class: 'ogs-dashboard-card'},
              !connected
                ? h(LoginForm, {
                    username,
                    busy,
                    error,
                    passwordRef: (el) => (this.passwordInputElement = el),
                    onUsernameInput: this.handleUsernameInput,
                    onSubmit: this.handleSubmit,
                  })
                : h(AccountStatus, {user, username, socket}),
            ),
            h(QuickLinksCard, {connected, connectedGame}),
          ),

          connected &&
            h(
              'div',
              {class: 'ogs-dashboard-main'},
              h(
                'section',
                {class: 'ogs-dashboard-card ogs-dashboard-primary-card'},
                h(OnlineGameForm, {
                  onlineGame,
                  activeGames,
                  authenticated,
                  busy,
                  onConnectGame: this.handleActiveGameButtonClick,
                  onDisconnectGame: this.handleDisconnectGameButtonClick,
                }),
              ),
              h(SectionDetail, {activeSection, connected}),
            ),

          !connected && h(SectionDetail, {activeSection, connected}),

          connected &&
            h(
              'aside',
              {class: 'ogs-dashboard-column ogs-dashboard-secondary'},
              h(
                'section',
                {class: 'ogs-dashboard-card'},
                h(AutomatchForm, {
                  options: matchmakingOptions,
                  status: matchmaking?.status,
                  authenticated,
                  onOptionChange: this.handleMatchmakingOptionChange,
                  onConditionChange: this.handleConditionOptionChange,
                  onMultiChange: this.handleMultiOptionChange,
                  onLogAutomatch: this.handleLogAutomatchButtonClick,
                }),
              ),
            ),
        ),
      ),
    )
  }
}

function LoginForm({
  username,
  busy,
  error,
  passwordRef,
  onUsernameInput,
  onSubmit,
}) {
  return h(
    'form',
    {class: 'ogs-login-form', onSubmit},

    h('h3', {}, t('Connect account')),
    h('p', {}, t('Sign in to unlock OGS play and account features.')),

    h(
      'label',
      {},
      h('span', {}, t('Username')),
      h('input', {
        name: 'username',
        type: 'text',
        value: username,
        autocomplete: 'off',
        disabled: busy,
        onInput: onUsernameInput,
      }),
    ),

    h(
      'label',
      {},
      h('span', {}, t('Password')),
      h('input', {
        ref: passwordRef,
        name: 'password',
        type: 'password',
        autocomplete: 'off',
        disabled: busy,
      }),
    ),

    error != null && h('p', {class: 'ogs-error'}, error),

    h(
      'button',
      {type: 'submit', disabled: busy || username.trim() === ''},
      busy ? t('Connecting…') : t('Connect'),
    ),
  )
}

function AccountStatus({user, username, socket}) {
  return h(
    'div',
    {class: 'ogs-status'},

    h('h3', {}, t('Account')),
    user?.iconUrl != null &&
      h('img', {class: 'ogs-avatar', src: user.iconUrl, alt: ''}),
    h(
      'dl',
      {},
      h('dt', {}, t('Username')),
      h('dd', {class: 'ogs-status-username'}, user?.username || username),
      h('dt', {}, t('Status')),
      h('dd', {}, t('Online')),
      h('dt', {}, t('Rank')),
      h('dd', {}, user?.rank || t('Unknown')),
      h('dt', {}, t('Socket')),
      h('dd', {class: 'ogs-socket-status'}, getSocketLabel(socket)),
    ),
  )
}

function OgsDashboardNav({activeSection, onSectionClick}) {
  let sections = [
    ['overview', t('Overview')],
    ['play', t('Play')],
    ['games', t('Games')],
    ['social', t('Social')],
    ['community', t('Community')],
    ['settings', t('Settings')],
  ]

  return h(
    'nav',
    {class: 'ogs-dashboard-nav', 'aria-label': t('OGS sections')},
    sections.map(([id, label]) =>
      h(
        'button',
        {
          key: id,
          type: 'button',
          class: activeSection === id ? 'selected' : '',
          'aria-current': activeSection === id ? 'page' : null,
          onClick: () => onSectionClick(id),
        },
        label,
      ),
    ),
  )
}

function QuickLinksCard({connected, connectedGame}) {
  return h(
    'section',
    {class: 'ogs-dashboard-card ogs-dashboard-quick-links'},
    h('h3', {}, t('Quick access')),
    h(
      'dl',
      {},
      h('dt', {}, t('Session')),
      h('dd', {}, connected ? t('Ready') : t('Disconnected')),
      h('dt', {}, t('Current game')),
      h(
        'dd',
        {},
        connectedGame == null
          ? t('None')
          : connectedGame.gameName || `#${connectedGame.gameId}`,
      ),
      h('dt', {}, t('Next')),
      h(
        'dd',
        {},
        connected
          ? t('Open a game, start automatch, or browse OGS sections.')
          : t('Connect your account to continue.'),
      ),
    ),
  )
}

function SectionDetail({activeSection, connected}) {
  let details = {
    overview: {
      title: t('Dashboard overview'),
      text: connected
        ? t(
            'Your account, active games, and automatch controls stay visible here.',
          )
        : t('Connect first, then the dashboard fills with OGS activity.'),
    },
    play: {
      title: t('Play center'),
      text: t(
        'Automatch, custom challenges, and live game entry points will live here.',
      ),
    },
    games: {
      title: t('Games library'),
      text: t(
        'History, reviews, observed games, and correspondence queues will live here.',
      ),
    },
    social: {
      title: t('Social'),
      text: t(
        'Friends, direct chats, invitations, and presence will live here.',
      ),
    },
    community: {
      title: t('Community'),
      text: t(
        'Groups, ladders, tournaments, and public rooms can grow into this space.',
      ),
    },
    settings: {
      title: t('OGS settings'),
      text: t(
        'Account preferences, server settings, and debug tools will live here.',
      ),
    },
  }
  let detail = details[activeSection] || details.overview

  return h(
    'section',
    {class: 'ogs-dashboard-card ogs-dashboard-section-detail'},
    h('p', {class: 'ogs-dashboard-kicker'}, t('Section')),
    h('h3', {}, detail.title),
    h('p', {}, detail.text),
  )
}

function getOnlineGameSyncKey(onlineGame) {
  let moves = onlineGame.moves
    .map((move) => `${move.moveNumber}:${move.move}`)
    .join(',')

  return `${onlineGame.gameId}:${onlineGame.handicap || 0}:${onlineGame.phase || ''}:${moves}`
}

function AutomatchForm({
  options,
  status,
  authenticated,
  onOptionChange,
  onConditionChange,
  onMultiChange,
  onLogAutomatch,
}) {
  return h(
    'section',
    {class: 'ogs-matchmaking'},
    h('h3', {}, t('Automatch')),
    h('p', {}, t('Prepare an official OGS automatch payload.')),

    h(CheckboxGroup, {
      title: t('Board sizes'),
      name: 'boardSizes',
      values: boardSizes,
      selected: options.boardSizes,
      format: (size) => `${size}x${size}`,
      onChange: onMultiChange,
    }),

    h(CheckboxGroup, {
      title: t('Speeds'),
      name: 'speeds',
      values: speeds,
      selected: options.speeds,
      onChange: onMultiChange,
    }),

    h(SelectField, {
      label: t('Time system'),
      name: 'timeSystem',
      value: options.timeSystem,
      values: timeSystems,
      onChange: onOptionChange,
    }),

    h(NumberField, {
      label: t('Lower rank difference'),
      name: 'lowerRankDiff',
      value: options.lowerRankDiff,
      onInput: onOptionChange,
    }),

    h(NumberField, {
      label: t('Upper rank difference'),
      name: 'upperRankDiff',
      value: options.upperRankDiff,
      onInput: onOptionChange,
    }),

    h(ConditionValueField, {
      title: t('Rules'),
      group: 'rules',
      option: options.rules,
      values: rules,
      onChange: onConditionChange,
    }),

    h(ConditionValueField, {
      title: t('Handicap'),
      group: 'handicap',
      option: options.handicap,
      values: handicapValues,
      onChange: onConditionChange,
    }),

    status === 'mock-logged' &&
      h('p', {class: 'ogs-matchmaking-status'}, t('Automatch payload logged.')),

    h(
      'button',
      {
        type: 'button',
        disabled: !authenticated,
        title: !authenticated
          ? t('OGS socket must be authenticated first.')
          : t('Log the payload without sending it to OGS.'),
        onClick: onLogAutomatch,
      },
      t('Log automatch request'),
    ),
  )
}

function OnlineGameForm({
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
                h('span', {}, formatBoard(game.board)),
                h('span', {}, game.phase || t('Unknown')),
                h('span', {}, t('Move'), ' ', String(game.moveNumber || 0)),
                h('span', {}, formatPlayers(game.black, game.white)),
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: busy || !authenticated,
                  onClick: () => onConnectGame(game.id),
                },
                onlineGame?.gameId === game.id ? t('Open board') : t('View'),
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
      h('dd', {}, formatBoard(onlineGame?.board)),
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

function formatBoard(board) {
  if (board == null) return t('Unknown')
  return `${board.width}x${board.height}`
}

function formatPlayers(black, white) {
  return `${black?.username || t('Black')} vs ${white?.username || t('White')}`
}

function CheckboxGroup({
  title,
  name,
  values,
  selected,
  format = (x) => x,
  onChange,
}) {
  return h(
    'fieldset',
    {},
    h('legend', {}, title),
    values.map((value) =>
      h(
        'label',
        {class: 'ogs-inline-option'},
        h('input', {
          type: 'checkbox',
          name,
          value,
          checked: selected.includes(value),
          onChange,
        }),
        h('span', {}, format(value)),
      ),
    ),
  )
}

function SelectField({label, name, value, values, onChange}) {
  return h(
    'label',
    {},
    h('span', {}, label),
    h(
      'select',
      {name, value, onChange},
      values.map((item) => h('option', {value: item}, item)),
    ),
  )
}

function NumberField({label, name, value, onInput}) {
  return h(
    'label',
    {},
    h('span', {}, label),
    h('input', {name, type: 'number', min: 0, max: 9, value, onInput}),
  )
}

function ConditionValueField({title, group, option, values, onChange}) {
  return h(
    'fieldset',
    {},
    h('legend', {}, title),
    h(SelectField, {
      label: t('Condition'),
      name: `${group}.condition`,
      value: option.condition,
      values: conditions,
      onChange,
    }),
    h(SelectField, {
      label: t('Value'),
      name: `${group}.value`,
      value: option.value,
      values,
      onChange,
    }),
  )
}

function getSocketLabel(socket) {
  switch (socket?.status) {
    case 'authentication-sent':
      return t('Authentication sent')
    case 'authenticated':
      return t('Authenticated')
    case 'connected':
      return t('Connected')
    case 'connecting':
      return t('Connecting')
    case 'error':
      return socket.error || t('Connection error')
    default:
      return t('Disconnected')
  }
}
