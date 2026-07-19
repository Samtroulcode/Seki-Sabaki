import {h} from 'preact'

import i18n from '../../i18n.js'

const t = i18n.context('OgsPanel')

export function OgsDashboardNav({activeSection, disabled, onSectionClick}) {
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
          disabled,
          'aria-current': activeSection === id ? 'page' : null,
          onClick: disabled ? null : () => onSectionClick(id),
        },
        label,
      ),
    ),
  )
}

export function QuickLinksCard({connected, connectedGame}) {
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

export function SectionDetail({activeSection, connected}) {
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
