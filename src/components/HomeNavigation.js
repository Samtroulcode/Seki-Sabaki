import {h} from 'preact'
import classNames from 'classnames'

import i18n from '../i18n.js'

const t = i18n.context('HomeNavigation')

export const homeSections = [
  {id: 'dashboard', label: t('Dashboard')},
  {id: 'ogs', label: t('OGS')},
  {id: 'library', label: t('Library')},
  {id: 'analysis', label: t('Analysis')},
  {id: 'engines', label: t('Engines')},
]

export default function HomeNavigation({activeSection, onNavigate}) {
  return h(
    'nav',
    {class: 'home-sidebar', 'aria-label': t('Home sections')},
    h('div', {class: 'home-sidebar-title'}, t('Home')),
    h(
      'div',
      {class: 'home-sidebar-list'},
      homeSections.map(({id, label}) =>
        h(
          'button',
          {
            key: id,
            type: 'button',
            class: classNames({selected: activeSection === id}),
            'aria-current': activeSection === id ? 'page' : undefined,
            onClick: () => onNavigate(id),
          },
          label,
        ),
      ),
    ),
  )
}
