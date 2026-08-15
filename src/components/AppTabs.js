import {h, Component} from 'preact'
import classNames from 'classnames'
import {basename} from 'path'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import onlineStore from '../modules/onlinestore.js'

const t = i18n.context('AppTabs')

export default class AppTabs extends Component {
  constructor(props) {
    super(props)

    this.handleHomeTabClick = () => {
      sabaki.setState({activeWorkspace: 'home', homeSection: 'dashboard'})
    }

    this.handleBoardTabClick = (id) => {
      sabaki.switchBoardTab(id)
    }

    this.handleBoardTabCloseButtonClick = async (evt, id) => {
      evt.stopPropagation()
      await sabaki.closeBoardTab(id)
    }

    this.handleOnlineGameTabClick = (id) => {
      sabaki.switchOnlineGameTab(id)
    }

    this.handleOnlineGameTabCloseButtonClick = async (evt, id) => {
      evt.stopPropagation()
      let tab = sabaki.getOnlineGameTab(id)

      if (tab?.onlineGameId != null) {
        let result = await onlineStore.disconnectGame(tab.onlineGameId)
        if (result?.ok === false) return
      }

      sabaki.closeOnlineGameTab(id)
    }

    this.handleWorkspaceTabClick = (id) => sabaki.switchWorkspaceTab(id)

    this.handleWorkspaceTabCloseButtonClick = (evt, id) => {
      evt.stopPropagation()
      sabaki.closeWorkspaceTab(id)
    }
  }

  render({
    activeWorkspace,
    boardTabs = [],
    activeBoardTabId,
    onlineGameTabs = [],
    activeOnlineGameTabId,
    workspaceTabs = [],
    activeWorkspaceTabId,
    activityTabOrder = [],
  }) {
    let homeSelected = activeWorkspace === 'home'
    let orderedTabs = getOrderedTabs(
      activityTabOrder,
      boardTabs,
      onlineGameTabs,
      workspaceTabs,
    )

    return h(
      'nav',
      {id: 'apptabs', 'aria-label': t('Open activities')},
      h(
        'button',
        {
          type: 'button',
          class: classNames('app-home-tab', {
            selected: homeSelected,
          }),
          title: t('Home'),
          'aria-label': t('Home'),
          'aria-current': homeSelected ? 'page' : undefined,
          onClick: this.handleHomeTabClick,
        },
        h('span', {class: 'app-home-tab-icon', 'aria-hidden': 'true'}, '⌂'),
        h('span', {}, t('Home')),
      ),
      h('div', {class: 'app-tab-separator', 'aria-hidden': 'true'}),
      h(
        'div',
        {class: 'app-activity-tabs'},
        orderedTabs.map(({type, tab}) => {
          if (type === 'board') {
            return h(BoardTab, {
              key: tab.id,
              tab,
              selected:
                activeWorkspace === 'board' && tab.id === activeBoardTabId,
              closeable: true,
              onClick: () => this.handleBoardTabClick(tab.id),
              onClose: (evt) =>
                this.handleBoardTabCloseButtonClick(evt, tab.id),
            })
          }
          if (type === 'online-game') {
            return h(OnlineGameTab, {
              key: tab.id,
              tab,
              selected:
                activeWorkspace === 'online-game' &&
                tab.id === activeOnlineGameTabId,
              closeable: true,
              onClick: () => this.handleOnlineGameTabClick(tab.id),
              onClose: (evt) =>
                this.handleOnlineGameTabCloseButtonClick(evt, tab.id),
            })
          }
          return h(WorkspaceTab, {
            key: tab.id,
            tab,
            selected:
              activeWorkspace === 'workspace-tab' &&
              tab.id === activeWorkspaceTabId,
            onClick: () => this.handleWorkspaceTabClick(tab.id),
            onClose: (evt) =>
              this.handleWorkspaceTabCloseButtonClick(evt, tab.id),
          })
        }),
      ),
    )
  }
}

function getOrderedTabs(order, boardTabs, onlineGameTabs, workspaceTabs) {
  let byKey = new Map([
    ...boardTabs.map((tab) => [`board:${tab.id}`, {type: 'board', tab}]),
    ...onlineGameTabs.map((tab) => [
      `online-game:${tab.id}`,
      {type: 'online-game', tab},
    ]),
    ...workspaceTabs.map((tab) => [
      `workspace:${tab.id}`,
      {type: 'workspace', tab},
    ]),
  ])
  let result = (order || []).map((key) => byKey.get(key)).filter(Boolean)
  let known = new Set(order || [])
  for (let [key, tab] of byKey) {
    if (!known.has(key)) result.push(tab)
  }
  return result
}

function BoardTab({tab, selected, closeable, onClick, onClose}) {
  let title = getBoardTitle(tab.representedFilename, tab.onlineGameId)
  let meta =
    tab.onlineGameId == null ? null : t('Game #') + String(tab.onlineGameId)
  let accessibleLabel = meta == null ? title : title + ', ' + meta

  return h(
    'div',
    {class: classNames('app-board-tab', {selected})},
    h(
      'button',
      {
        type: 'button',
        class: 'app-board-tab-button',
        title,
        'aria-label': accessibleLabel,
        'aria-current': selected ? 'page' : undefined,
        onClick,
      },
      h('span', {class: 'app-activity-tab-title'}, title),
      meta != null && h('span', {class: 'app-activity-tab-meta'}, meta),
    ),
    closeable &&
      h(
        'button',
        {
          type: 'button',
          class: 'app-board-tab-close',
          title: t('Close tab'),
          'aria-label': t('Close ') + accessibleLabel,
          onClick: onClose,
        },
        '×',
      ),
  )
}

function getBoardTitle(representedFilename, onlineGameId = null) {
  return representedFilename == null || representedFilename === ''
    ? t('Untitled Board')
    : basename(representedFilename)
}

function OnlineGameTab({tab, selected, closeable, onClick, onClose}) {
  let title = getOnlineGameTitle(tab)
  let meta = t('Online game')
  let accessibleLabel = title + ', ' + meta

  return h(
    'div',
    {class: classNames('app-online-game-tab', {selected})},
    h(
      'button',
      {
        type: 'button',
        class: 'app-online-game-tab-button',
        title,
        'aria-label': accessibleLabel,
        'aria-current': selected ? 'page' : undefined,
        onClick,
      },
      h('span', {class: 'app-activity-tab-title'}, title),
      h('span', {class: 'app-activity-tab-meta'}, meta),
    ),
    closeable &&
      h(
        'button',
        {
          type: 'button',
          class: 'app-online-game-tab-close',
          title: t('Close tab'),
          'aria-label': t('Close ') + accessibleLabel,
          onClick: onClose,
        },
        '×',
      ),
  )
}

function WorkspaceTab({tab, selected, onClick, onClose}) {
  let title =
    tab.type === 'ogs'
      ? t('OGS')
      : tab.type === 'analysis'
        ? t('Analysis')
        : t('Library')

  return h(
    'div',
    {class: classNames('app-workspace-tab', `type-${tab.type}`, {selected})},
    h(
      'button',
      {
        type: 'button',
        class: 'app-workspace-tab-button',
        title,
        'aria-label': title,
        'aria-current': selected ? 'page' : undefined,
        onClick,
      },
      h('span', {class: 'app-activity-tab-title'}, title),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'app-workspace-tab-close',
        title: t('Close tab'),
        'aria-label': t('Close ') + title,
        onClick: onClose,
      },
      '×',
    ),
  )
}

function getOnlineGameTitle(tab) {
  return tab.title || t('OGS #') + String(tab.onlineGameId)
}
