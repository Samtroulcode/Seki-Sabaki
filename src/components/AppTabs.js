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
  }

  render({
    activeWorkspace,
    activityWorkspace,
    onlineGameId,
    representedFilename,
  }) {
    let activity = getCurrentActivity({
      activityWorkspace,
      onlineGameId,
      representedFilename,
    })

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
        h(ActivityTab, {
          activity,
          selected: activeWorkspace === activity.workspace,
          onClick: () => this.handleTabClick(activity.workspace),
        }),
      ),
    )
  }
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

function getBoardTitle(representedFilename) {
  return representedFilename == null || representedFilename === ''
    ? t('Untitled Board')
    : basename(representedFilename)
}
