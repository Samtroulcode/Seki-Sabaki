import {h} from 'preact'
import classNames from 'classnames'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('AppSidebar')

const destinations = [
  {type: 'home', label: 'Home', icon: 'home-16.svg'},
  {type: 'ogs', label: 'Online', icon: 'globe-16.svg'},
  {type: 'analysis', label: 'Analysis', icon: 'graph-16.svg'},
  {type: 'library', label: 'Library', icon: 'book-16.svg'},
  {type: 'tsumego', label: 'Tsumego', icon: 'mortar-board-16.svg'},
]

export default function AppSidebar(props) {
  let selectedDestination = getSelectedDestination(props)

  return h(
    'aside',
    {id: 'appsidebar', 'aria-label': t('Seki navigation')},
    h('div', {class: 'app-sidebar-identity', 'aria-hidden': 'true'}, 'Seki'),
    h(
      'nav',
      {class: 'app-sidebar-destinations', 'aria-label': t('Destinations')},
      destinations.map((destination) =>
        h(SidebarButton, {
          key: destination.type,
          ...destination,
          selected: selectedDestination === destination.type,
          onClick: () => openDestination(destination.type),
        }),
      ),
    ),
    h(
      'div',
      {class: 'app-sidebar-settings'},
      h(SidebarButton, {
        type: 'settings',
        label: 'Settings',
        icon: 'gear-16.svg',
        expanded: props.openDrawer === 'preferences',
        controls: 'preferences',
        onClick: () => sabaki.openDrawer('preferences'),
      }),
    ),
  )
}

function SidebarButton({
  type,
  label,
  icon,
  selected,
  expanded,
  controls,
  onClick,
}) {
  label = t(label)

  return h(
    'button',
    {
      type: 'button',
      class: classNames(
        'ui-button',
        'ui-button-ghost',
        'app-sidebar-button',
        `type-${type}`,
        {selected},
      ),
      title: label,
      'aria-current': selected ? 'page' : undefined,
      'aria-expanded': expanded == null ? undefined : expanded,
      'aria-controls': controls,
      onClick,
    },
    h('img', {
      src: `./node_modules/@primer/octicons/build/svg/${icon}`,
      alt: '',
      'aria-hidden': 'true',
    }),
    h('span', {}, label),
  )
}

function openDestination(type) {
  if (type === 'home') {
    sabaki.setState({activeWorkspace: 'home', homeSection: 'dashboard'})
  } else {
    sabaki.openWorkspaceTab(type)
  }
}

function getSelectedDestination({
  activeWorkspace,
  homeSection,
  workspaceTabs = [],
  activeWorkspaceTabId,
}) {
  if (activeWorkspace === 'home') {
    let legacyHomeType = {
      ogs: 'ogs',
      analysis: 'analysis',
      library: 'library',
      tsumego: 'tsumego',
    }[homeSection]
    return legacyHomeType || 'home'
  }

  let legacyType = {
    online: 'ogs',
    analysis: 'analysis',
    'sgf-explorer': 'library',
    tsumego: 'tsumego',
  }[activeWorkspace]
  if (legacyType != null) return legacyType

  if (activeWorkspace !== 'workspace-tab') return null
  let tab = workspaceTabs.find(
    (candidate) => candidate.id === activeWorkspaceTabId,
  )
  if (tab == null) return 'home'
  return ['ogs', 'analysis', 'library', 'tsumego'].includes(tab?.type)
    ? tab.type
    : 'home'
}
