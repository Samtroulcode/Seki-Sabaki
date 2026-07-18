import {h, Component} from 'preact'

import i18n from '../../i18n.js'

const t = i18n.context('OgsPanel')

const defaultMatchmakingOptions = {
  boardSize: 19,
  speed: 'rapid',
  rankDiff: 3,
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
          connected: true,
        })
      } else {
        this.setState({error: result.error?.message || t('OGS login failed.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectButtonClick = async () => {
      await window.sabaki.ogs.logout()
      this.setState({user: null, connected: false, error: null, socket: null})
    }

    this.handleMatchmakingOptionChange = async (evt) => {
      let {name, value} = evt.currentTarget
      let nextOptions = {
        ...this.state.matchmaking.options,
        [name]: name === 'boardSize' || name === 'rankDiff' ? +value : value,
      }

      this.setState({
        matchmaking: {...this.state.matchmaking, options: nextOptions},
      })

      try {
        let state = await window.sabaki.ogs.setMatchmakingOptions(nextOptions)

        this.setState({
          matchmaking: state.matchmaking,
          socket: state.socket,
        })
      } catch (err) {}
    }
  }

  async componentDidMount() {
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
        connected: true,
      })
    }
  }

  render(props, {username, user, busy, error, connected, socket, matchmaking}) {
    let matchmakingOptions = matchmaking?.options || defaultMatchmakingOptions

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
            h(
              'section',
              {class: 'ogs-matchmaking'},
              h('h3', {}, t('Matchmaking')),
              h(
                'label',
                {},
                h('span', {}, t('Board size')),
                h(
                  'select',
                  {
                    name: 'boardSize',
                    value: matchmakingOptions.boardSize,
                    onChange: this.handleMatchmakingOptionChange,
                  },
                  [9, 13, 19].map((size) =>
                    h('option', {value: size}, `${size}x${size}`),
                  ),
                ),
              ),
              h(
                'label',
                {},
                h('span', {}, t('Speed')),
                h(
                  'select',
                  {
                    name: 'speed',
                    value: matchmakingOptions.speed,
                    onChange: this.handleMatchmakingOptionChange,
                  },
                  ['blitz', 'rapid', 'live'].map((speed) =>
                    h('option', {value: speed}, speed),
                  ),
                ),
              ),
              h(
                'label',
                {},
                h('span', {}, t('Rank range')),
                h('input', {
                  name: 'rankDiff',
                  type: 'number',
                  min: 0,
                  max: 9,
                  value: matchmakingOptions.rankDiff,
                  onInput: this.handleMatchmakingOptionChange,
                }),
              ),
              h('p', {}, t('Rules: Japanese. Time system: Byo-yomi.')),
              h(
                'button',
                {
                  type: 'button',
                  disabled: true,
                  title: t('Automatch search will be wired in the next slice.'),
                },
                t('Find match'),
              ),
            ),
            h(
              'button',
              {type: 'button', onClick: this.handleDisconnectButtonClick},
              t('Disconnect'),
            ),
          ),
    )
  }
}

function getSocketLabel(socket) {
  switch (socket?.status) {
    case 'authentication-sent':
      return t('Authentication sent')
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
