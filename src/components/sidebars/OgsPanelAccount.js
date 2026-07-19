import {h} from 'preact'

import i18n from '../../i18n.js'
import {getSocketLabel} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')

export function LoginForm({
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

export function AccountStatus({user, username, socket}) {
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
      h('dd', {class: 'ogs-socket-status'}, getSocketLabel(socket, t)),
    ),
  )
}
