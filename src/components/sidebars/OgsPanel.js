import {h, Component} from 'preact'

import i18n from '../../i18n.js'

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
      gameIdInput: '',
    }

    this.handleUsernameInput = (evt) => {
      this.setState({username: evt.currentTarget.value})
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
          connected: true,
        })
      } else {
        this.setState({error: result.error?.message || t('OGS login failed.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectButtonClick = async () => {
      await window.sabaki.ogs.logout()
      this.setState({
        user: null,
        connected: false,
        error: null,
        socket: null,
        onlineGame: null,
      })
    }

    this.handleGameIdInput = (evt) => {
      this.setState({gameIdInput: evt.currentTarget.value})
    }

    this.handleConnectGameSubmit = async (evt) => {
      evt.preventDefault()

      let gameId = this.state.gameIdInput
      if ((gameId || '').trim() === '') return

      this.setState({busy: true, error: null})

      try {
        let result = await window.sabaki.ogs.connectGame(gameId)

        if (result.ok) {
          this.setState({
            socket: result.state.socket,
            matchmaking: result.state.matchmaking,
            onlineGame: result.state.onlineGame,
          })
        } else {
          this.setState({
            error: result.error?.message || t('Unable to connect to game.'),
            onlineGame: result.state?.onlineGame || this.state.onlineGame,
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
        connected: true,
      })
    }
  }

  render(
    props,
    {username, user, busy, error, connected, socket, matchmaking, onlineGame},
  ) {
    let matchmakingOptions = matchmaking?.options || defaultMatchmakingOptions
    let authenticated = socket?.status === 'authenticated'

    return h(
      'div',
      {class: 'ogs-panel'},

      h(
        'div',
        {class: 'ogs-panel-branding'},
        h('div', {class: 'ogs-panel-logo'}, 'OGS'),
        h('h2', {}, t('Online Go Server Beta')),
        h('p', {}, t('Connect to beta.online-go.com.')),
      ),

      !connected
        ? h(
            'form',
            {class: 'ogs-login-form', onSubmit: this.handleSubmit},

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
                onInput: this.handleUsernameInput,
              }),
            ),

            h(
              'label',
              {},
              h('span', {}, t('Password')),
              h('input', {
                ref: (el) => (this.passwordInputElement = el),
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
        : h(
            'div',
            {class: 'ogs-status'},

            h('h3', {}, t('Connected')),
            user?.iconUrl != null &&
              h('img', {class: 'ogs-avatar', src: user.iconUrl, alt: ''}),
            h(
              'dl',
              {},
              h('dt', {}, t('Username')),
              h(
                'dd',
                {class: 'ogs-status-username'},
                user?.username || username,
              ),
              h('dt', {}, t('Status')),
              h('dd', {}, t('Online')),
              h('dt', {}, t('Rank')),
              h('dd', {}, user?.rank || t('Unknown')),
              h('dt', {}, t('Socket')),
              h('dd', {class: 'ogs-socket-status'}, getSocketLabel(socket)),
            ),
            h(AutomatchForm, {
              options: matchmakingOptions,
              status: matchmaking?.status,
              authenticated,
              onOptionChange: this.handleMatchmakingOptionChange,
              onConditionChange: this.handleConditionOptionChange,
              onMultiChange: this.handleMultiOptionChange,
              onLogAutomatch: this.handleLogAutomatchButtonClick,
            }),
            h(OnlineGameForm, {
              onlineGame,
              authenticated,
              busy,
              gameIdInput: this.state.gameIdInput || '',
              onGameIdInput: this.handleGameIdInput,
              onConnectGame: this.handleConnectGameSubmit,
              onDisconnectGame: this.handleDisconnectGameButtonClick,
            }),
            h(
              'button',
              {type: 'button', onClick: this.handleDisconnectButtonClick},
              t('Disconnect'),
            ),
          ),
    )
  }
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
  authenticated,
  busy,
  gameIdInput,
  onGameIdInput,
  onConnectGame,
  onDisconnectGame,
}) {
  let gameStatus = onlineGame?.status || 'idle'
  let hasGame = onlineGame?.gameId != null

  return h(
    'section',
    {class: 'ogs-online-game'},
    h('h3', {}, t('Game connection')),
    h('p', {}, t('Connect to an existing OGS game in read-only mode for now.')),
    h(
      'form',
      {class: 'ogs-game-connect-form', onSubmit: onConnectGame},
      h(
        'label',
        {},
        h('span', {}, t('Game ID')),
        h('input', {
          name: 'gameId',
          type: 'text',
          inputmode: 'numeric',
          pattern: '[0-9]*',
          value: gameIdInput,
          disabled: busy || !authenticated,
          onInput: onGameIdInput,
        }),
      ),
      h(
        'button',
        {
          type: 'submit',
          disabled: busy || !authenticated || gameIdInput.trim() === '',
        },
        t('Connect game'),
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
