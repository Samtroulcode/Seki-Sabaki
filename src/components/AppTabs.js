import {h, Component} from 'preact'
import classNames from 'classnames'
import {basename} from 'path'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('AppTabs')

export default class AppTabs extends Component {
  constructor(props) {
    super(props)

    this.handleTabClick = (workspace) => {
      sabaki.setState({activeWorkspace: workspace})
    }

    this.handleBoardTabClick = (id) => {
      sabaki.switchBoardTab(id)
    }

    this.handleBoardTabCloseButtonClick = async (evt, id) => {
      evt.stopPropagation()
      await sabaki.closeBoardTab(id)
    }
  }

  render({
    activeWorkspace,
    activityWorkspace,
    onlineGameId,
    representedFilename,
    boardTabs = [],
    activeBoardTabId,
  }) {
    let activity = getCurrentActivity({
      activityWorkspace,
      onlineGameId,
      representedFilename,
    })
    let showWorkspaceActivity = activity.workspace !== 'board'

    return h(
      'nav',
      {id: 'apptabs', 'aria-label': t('Open activities')},
      h(
        'button',
        {
          type: 'button',
          class: classNames('app-home-tab', {
            selected: activeWorkspace === 'home',
          }),
          title: t('Home'),
          'aria-label': t('Home'),
          'aria-current': activeWorkspace === 'home' ? 'page' : undefined,
          onClick: () => this.handleTabClick('home'),
        },
        h('span', {class: 'app-home-tab-icon', 'aria-hidden': 'true'}, '⌂'),
        h('span', {}, t('Home')),
      ),
      h('div', {class: 'app-tab-separator', 'aria-hidden': 'true'}),
      h(
        'div',
        {class: 'app-activity-tabs'},
        boardTabs.map((tab) =>
          h(BoardTab, {
            key: tab.id,
            tab,
            selected:
              activeWorkspace === 'board' && tab.id === activeBoardTabId,
            closeable: true,
            onClick: () => this.handleBoardTabClick(tab.id),
            onClose: (evt) => this.handleBoardTabCloseButtonClick(evt, tab.id),
          }),
        ),
        showWorkspaceActivity &&
          h(ActivityTab, {
            activity,
            selected: activeWorkspace === activity.workspace,
            onClick: () => this.handleTabClick(activity.workspace),
          }),
      ),
    )
  }
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

function ActivityTab({activity, selected, onClick}) {
  let accessibleLabel =
    activity.meta == null
      ? activity.title
      : activity.title + ', ' + activity.meta

  return h(
    'button',
    {
      type: 'button',
      class: classNames('app-activity-tab', {selected}),
      title: activity.title,
      'aria-label': accessibleLabel,
      'aria-current': selected ? 'page' : undefined,
      onClick,
    },
    h('span', {class: 'app-activity-tab-title'}, activity.title),
    activity.meta != null &&
      h('span', {class: 'app-activity-tab-meta'}, activity.meta),
  )
}

function getCurrentActivity({
  activityWorkspace,
  onlineGameId,
  representedFilename,
}) {
  switch (activityWorkspace) {
    case 'online':
      return {
        workspace: 'online',
        title: t('OGS Overview'),
        meta: onlineGameId == null ? null : t('Game #') + String(onlineGameId),
      }
    case 'sgf-explorer':
      return {workspace: 'sgf-explorer', title: t('Library Preview')}
    case 'analysis':
      return {workspace: 'analysis', title: t('Analysis Setup')}
    case 'board':
    case 'home':
    default:
      return {
        workspace: 'board',
        title:
          onlineGameId == null
            ? getBoardTitle(representedFilename)
            : t('OGS game on board'),
        meta: onlineGameId == null ? null : t('Game #') + String(onlineGameId),
      }
  }
}

function getBoardTitle(representedFilename, onlineGameId = null) {
  if (onlineGameId != null) return t('OGS game on board')

  return representedFilename == null || representedFilename === ''
    ? t('Untitled Board')
    : basename(representedFilename)
}
