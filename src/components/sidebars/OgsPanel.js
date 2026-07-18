import {h, Component} from 'preact'

import i18n from '../../i18n.js'

const t = i18n.context('OgsPanel')

export default class OgsPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: '',
      user: null,
      busy: false,
      error: null,
      connected: false,
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
        this.setState({username, user: result.user, connected: true})
      } else {
        this.setState({error: result.error?.message || t('OGS login failed.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectButtonClick = async () => {
      await window.sabaki.ogs.logout()
      this.setState({user: null, connected: false, error: null})
    }
  }

  async componentDidMount() {
    let user = null

    try {
      user = await window.sabaki.ogs.getSession()
    } catch (err) {
      return
    }

    if (user != null) {
      this.setState({username: user.username || '', user, connected: true})
    }
  }

  render(props, {username, user, busy, error, connected}) {
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
