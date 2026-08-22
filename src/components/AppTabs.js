import {basename} from 'path'
import {h, Component} from 'preact'
import classNames from 'classnames'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import onlineStore from '../modules/onlinestore.js'

const t = i18n.context('AppTabs')

export default class AppTabs extends Component {
  constructor(props) {
    super(props)

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
  }

  render({
    activeWorkspace,
    boardTabs = [],
    activeBoardTabId,
    onlineGameTabs = [],
    activeOnlineGameTabId,
    activityTabOrder = [],
  }) {
    let orderedTabs = getOrderedTabs(
      activityTabOrder,
      boardTabs,
      onlineGameTabs,
    )

    return h(
      'nav',
      {id: 'apptabs', 'aria-label': t('Open activities')},
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
              onClick: () => this.handleBoardTabClick(tab.id),
              onClose: (evt) =>
                this.handleBoardTabCloseButtonClick(evt, tab.id),
            })
          }

          return h(OnlineGameTab, {
            key: tab.id,
            tab,
            selected:
              activeWorkspace === 'online-game' &&
              tab.id === activeOnlineGameTabId,
            onClick: () => this.handleOnlineGameTabClick(tab.id),
            onClose: (evt) =>
              this.handleOnlineGameTabCloseButtonClick(evt, tab.id),
          })
        }),
      ),
    )
  }
}

function getOrderedTabs(order, boardTabs, onlineGameTabs) {
  let byKey = new Map([
    ...boardTabs.map((tab) => [`board:${tab.id}`, {type: 'board', tab}]),
    ...onlineGameTabs.map((tab) => [
      `online-game:${tab.id}`,
      {type: 'online-game', tab},
    ]),
  ])
  let result = (order || []).map((key) => byKey.get(key)).filter(Boolean)
  let known = new Set(order || [])
  for (let [key, tab] of byKey) {
    if (!known.has(key)) result.push(tab)
  }
  return result
}

function BoardTab({tab, selected, onClick, onClose}) {
  let title = getBoardTitle(tab.representedFilename)
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

function getBoardTitle(representedFilename) {
  return representedFilename == null || representedFilename === ''
    ? t('Untitled Board')
    : basename(representedFilename)
}

function OnlineGameTab({tab, selected, onClick, onClose}) {
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

function getOnlineGameTitle(tab) {
  return tab.title || t('OGS #') + String(tab.onlineGameId)
}
