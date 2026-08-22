import {h} from 'preact'

import HomeView from './HomeView.js'
import MainView from './MainView.js'
import OnlineGameView from './OnlineGameView.js'
import LibraryPanel from './LibraryPanel.js'
import TsumegoPanel from './TsumegoPanel.js'
import AnalysisPanel from './sidebars/AnalysisPanel.js'
import OgsPanel from './sidebars/OgsPanel.js'

export default function WorkspaceView(props) {
  let visibleDestinationType = getVisibleDestinationType(props)
  let activeDestinationTab = props.workspaceTabs?.find((tab) =>
    props.activeWorkspace === 'workspace-tab'
      ? tab.id === props.activeWorkspaceTabId && isDestinationType(tab.type)
      : tab.type === visibleDestinationType,
  )
  let destinationActive = activeDestinationTab != null

  return h(
    'section',
    {class: 'workspace-view-stack'},
    !destinationActive &&
      h('div', {class: 'workspace-view-surface'}, renderWorkspace(props)),
    (props.workspaceTabs || [])
      .filter((tab) => isDestinationType(tab.type))
      .map((tab) => {
        let active = destinationActive && tab.id === activeDestinationTab.id
        return h(
          'div',
          {
            key: tab.id,
            class: 'workspace-view-destination',
            hidden: !active,
            'aria-hidden': !active ? 'true' : undefined,
          },
          renderWorkspaceTab(tab),
        )
      }),
  )
}

function getVisibleDestinationType({activeWorkspace, homeSection}) {
  if (activeWorkspace === 'home') {
    return ['ogs', 'analysis', 'library', 'tsumego'].includes(homeSection)
      ? homeSection
      : null
  }

  return {
    online: 'ogs',
    analysis: 'analysis',
    'sgf-explorer': 'library',
    tsumego: 'tsumego',
  }[activeWorkspace]
}

function isDestinationType(type) {
  return ['ogs', 'analysis', 'library', 'tsumego'].includes(type)
}

function renderWorkspaceTab(tab) {
  if (tab.type === 'ogs') return h(OgsPanel)
  if (tab.type === 'analysis') return h(AnalysisPanel)
  if (tab.type === 'library') {
    return h(LibraryPanel, {request: tab.libraryRequest})
  }
  if (tab.type === 'tsumego') {
    return h(TsumegoPanel, {request: tab.tsumegoRequest})
  }
  return null
}

function renderWorkspace(state) {
  switch (state.activeWorkspace) {
    case 'home':
      return h(HomeView, state)
    case 'online':
      return h(HomeView, {...state, homeSection: 'ogs'})
    case 'sgf-explorer':
      return h(HomeView, {...state, homeSection: 'library'})
    case 'analysis':
      return h(HomeView, {...state, homeSection: 'analysis'})
    case 'tsumego':
      return h(HomeView, {...state, homeSection: 'tsumego'})
    case 'board':
      return h(MainView, state)
    case 'online-game':
      return h(OnlineGameView, state)
    case 'workspace-tab':
      return h(HomeView, {...state, homeSection: 'dashboard'})
    default:
      return h(MainView, state)
  }
}
