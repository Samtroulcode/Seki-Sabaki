import {h, Component} from 'preact'

import i18n from '../../i18n.js'

const t = i18n.context('OgsPanel')

export default class OgsPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: '',
      connected: false,
    }

    this.handleUsernameInput = (evt) => {
      this.setState({username: evt.currentTarget.value})
    }

    this.handleSubmit = (evt) => {
      evt.preventDefault()

      let username = this.state.username.trim()

      if (username === '') return

      if (this.passwordInputElement != null) {
        this.passwordInputElement.value = ''
      }

      this.setState({username, connected: true})
    }

    this.handleDisconnectButtonClick = () => {
      this.setState({connected: false})
    }
  }

  render(props, {username, connected}) {
    return h(
      'div',
      {class: 'ogs-panel'},

      h(
        'div',
        {class: 'ogs-panel-branding'},
        h('div', {class: 'ogs-panel-logo'}, 'OGS'),
        h('h2', {}, t('Online Go Server')),
        h('p', {}, t('Mock connection panel — no network request is made.')),
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
                onInput: this.handleUsernameInput,
              }),
            ),

            h(
              'label',
              {},
              h('span', {}, t('Mock password — ignored')),
              h('input', {
                ref: (el) => (this.passwordInputElement = el),
                name: 'password',
                type: 'password',
                autocomplete: 'off',
                placeholder: t('Do not use your OGS password'),
              }),
            ),

            h(
              'button',
              {type: 'submit', disabled: username.trim() === ''},
              t('Connect'),
            ),
          )
        : h(
            'div',
            {class: 'ogs-status'},

            h('h3', {}, t('Connected')),
            h(
              'dl',
              {},
              h('dt', {}, t('Username')),
              h('dd', {class: 'ogs-status-username'}, username),
              h('dt', {}, t('Status')),
              h('dd', {}, t('Online')),
              h('dt', {}, t('Rank')),
              h('dd', {}, '12k'),
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
