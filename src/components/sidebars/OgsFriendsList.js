import {h} from 'preact'

import i18n from '../../i18n.js'

const t = i18n.context('OgsPanel')

export function OgsFriendsPanel({
  friends = [],
  busy = false,
  error = null,
  connected = false,
  onRefresh,
}) {
  return h(
    'section',
    {class: 'ogs-friends'},
    h(
      'div',
      {class: 'ogs-friends-header'},
      h(
        'div',
        {},
        h('h3', {}, t('Friends')),
        h('p', {}, t('See who is online and jump into a game together.')),
      ),
      connected &&
        h(
          'button',
          {type: 'button', disabled: busy, onClick: onRefresh},
          busy ? t('Loading...') : t('Refresh'),
        ),
    ),
    error != null && h('p', {class: 'ogs-error'}, error),
    !connected
      ? h('p', {class: 'ogs-empty'}, t('Connect OGS to see your friends.'))
      : friends.length === 0
        ? h(
            'p',
            {class: 'ogs-empty'},
            busy ? t('Loading...') : t('No OGS friends yet.'),
          )
        : h(
            'ul',
            {class: 'ogs-friends-list'},
            friends.map((friend) => h(OgsFriendRow, {key: friend.id, friend})),
          ),
  )
}

function OgsFriendRow({friend}) {
  let presenceClass =
    friend.online === true
      ? 'online'
      : friend.online === false
        ? 'offline'
        : 'unknown'

  return h(
    'li',
    {class: 'ogs-friend-row'},
    h(
      'span',
      {class: 'ogs-friend-avatar'},
      friend.iconUrl != null
        ? h('img', {src: friend.iconUrl, alt: ''})
        : getInitial(friend.username),
      h('span', {
        class: `ogs-friend-presence ${presenceClass}`,
        title:
          friend.online === true
            ? t('Online')
            : friend.online === false
              ? t('Offline')
              : t('Unknown'),
      }),
    ),
    h(
      'span',
      {class: 'ogs-friend-info'},
      h('strong', {}, friend.username || t('Unknown')),
      friend.rank != null && h('span', {class: 'ogs-friend-rank'}, friend.rank),
    ),
  )
}

function getInitial(username) {
  if (typeof username !== 'string' || username.trim() === '') return '?'

  return username.trim()[0].toUpperCase()
}
