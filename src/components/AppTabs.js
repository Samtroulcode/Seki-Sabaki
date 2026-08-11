import {h, Component} from 'preact'
import classNames from 'classnames'
import {basename} from 'path'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('AppTabs')

export default class AppTabs extends Component {
  constructor(props) {
    super(props)

    this.handleHomeTabClick = () => {
      sabaki.setState({activeWorkspace: 'home'})
    }

    this.handleBoardTabClick = (id) => {
      sabaki.switchBoardTab(id)
    }

    this.handleBoardTabCloseButtonClick = async (evt, id) => {
      evt.stopPropagation()
      await sabaki.closeBoardTab(id)
    }
  }

  render({activeWorkspace, boardTabs = [], activeBoardTabId}) {
    let homeSelected = activeWorkspace !== 'board'

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

function getBoardTitle(representedFilename, onlineGameId = null) {
  if (onlineGameId != null) return t('OGS game on board')

  return representedFilename == null || representedFilename === ''
    ? t('Untitled Board')
    : basename(representedFilename)
}
