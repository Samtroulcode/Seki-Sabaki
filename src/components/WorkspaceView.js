import {h} from 'preact'

import HomeView from './HomeView.js'
import MainView from './MainView.js'
import OnlineGameView from './OnlineGameView.js'
import LibraryPanel from './LibraryPanel.js'
import TsumegoPanel from './TsumegoPanel.js'
import AnalysisPanel from './sidebars/AnalysisPanel.js'
import OgsPanel from './sidebars/OgsPanel.js'

export default function WorkspaceView(props) {
  return renderWorkspace(props)
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
      return renderWorkspaceTab(state)
    default:
      return h(MainView, state)
  }
}

function renderWorkspaceTab(state) {
  let tab = state.workspaceTabs?.find(
    (candidate) => candidate.id === state.activeWorkspaceTabId,
  )
  if (tab?.type === 'ogs') return h(OgsPanel)
  if (tab?.type === 'analysis') return h(AnalysisPanel)
  if (tab?.type === 'library') {
    return h(LibraryPanel, {request: tab.libraryRequest})
  }
  if (tab?.type === 'tsumego') {
    return h(TsumegoPanel, {request: tab.tsumegoRequest})
  }
  return h(HomeView, {...state, homeSection: 'dashboard'})
}
