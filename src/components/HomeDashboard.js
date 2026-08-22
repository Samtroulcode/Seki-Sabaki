import {basename} from 'path'
import {h, Component} from 'preact'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import HomeTsumegoCard from './HomeTsumegoCard.js'

const t = i18n.context('HomeDashboard')

export default class HomeDashboard extends Component {
  constructor(props) {
    super(props)

    let configuredSizeInfo = String(sabaki.getEmptyGameTree().root.data.SZ?.[0])
    let configuredDimensions = configuredSizeInfo.split(':').map(Number)
    if (configuredDimensions.length === 1) {
      configuredDimensions = [configuredDimensions[0], configuredDimensions[0]]
    }
    if (configuredDimensions.some((size) => !Number.isFinite(size))) {
      configuredDimensions = [19, 19]
    }

    this.state = {
      selectedBoardSize:
        configuredDimensions[0] === configuredDimensions[1] &&
        [9, 13, 19].includes(configuredDimensions[0])
          ? configuredDimensions[0]
          : null,
    }

    this.handleNewGameButtonClick = async () => {
      await sabaki.createNewBoardTab({
        boardSize: this.state.selectedBoardSize,
      })
    }

    this.handleBrowseLibrary = () => {
      sabaki.openWorkspaceTab('library', {libraryRequest: null})
    }
  }

  handleResume(target) {
    if (target?.type === 'online-game') {
      sabaki.switchOnlineGameTab(target.tab.id)
    } else if (target?.type === 'board') {
      sabaki.switchBoardTab(target.tab.id)
    }
  }

  render({
    boardTabs = [],
    activeBoardTabId,
    onlineGameTabs = [],
    activeOnlineGameTabId,
  }) {
    let resumeTarget = getResumeTarget({
      boardTabs,
      activeBoardTabId,
      onlineGameTabs,
      activeOnlineGameTabId,
    })
    let selectedBoardSize = this.state.selectedBoardSize

    return h(
      'div',
      {class: 'home-dashboard'},
      h(
        'header',
        {class: 'home-identity'},
        h('h1', {}, t('Seki')),
        h('p', {}, t('Your Go workspace')),
      ),
      h(
        'div',
        {class: 'home-layout'},
        h(
          'div',
          {class: 'home-main-column'},
          resumeTarget != null &&
            h(
              'section',
              {class: 'home-work-section home-continue-section'},
              h('h2', {}, t('Continue')),
              h(
                'div',
                {class: 'home-resume-surface'},
                h(
                  'div',
                  {class: 'home-resume-details'},
                  h('strong', {}, resumeTarget.title),
                  resumeTarget.meta != null && h('span', {}, resumeTarget.meta),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'ui-button ui-button-primary',
                    onClick: () => this.handleResume(resumeTarget),
                  },
                  resumeTarget.type === 'online-game'
                    ? t('Continue game')
                    : t('Continue board'),
                ),
              ),
            ),
          h(
            'section',
            {class: 'home-work-section home-start-section'},
            h('h2', {}, t('Start')),
            h(
              'div',
              {class: 'home-start-surface'},
              h(
                'div',
                {class: 'home-start-actions'},
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'ui-button ui-button-primary home-action-button',
                    onClick: this.handleNewGameButtonClick,
                  },
                  t('New board'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'ui-button ui-button-secondary home-action-button',
                    onClick: this.handleBrowseLibrary,
                  },
                  t('Browse Library'),
                ),
              ),
              h(
                'div',
                {
                  class: 'home-size-options',
                  role: 'group',
                  'aria-label': t('Board size'),
                },
                h('span', {class: 'home-control-label'}, t('Board size')),
                [9, 13, 19].map((size) =>
                  h(
                    'button',
                    {
                      key: size,
                      type: 'button',
                      class: 'ui-button ui-button-ghost home-size-button',
                      'aria-pressed': selectedBoardSize === size,
                      onClick: () => this.setState({selectedBoardSize: size}),
                    },
                    `${size}x${size}`,
                  ),
                ),
              ),
            ),
          ),
        ),
        h(
          'aside',
          {class: 'home-study-column'},
          h(
            'section',
            {class: 'home-work-section home-study-section'},
            h('h2', {}, t('Study')),
            h(HomeTsumegoCard),
          ),
        ),
      ),
    )
  }
}

function getResumeTarget({
  boardTabs,
  activeBoardTabId,
  onlineGameTabs,
  activeOnlineGameTabId,
}) {
  let onlineTab =
    onlineGameTabs.find((tab) => tab.id === activeOnlineGameTabId) ||
    onlineGameTabs[0]
  if (onlineTab != null) {
    return {
      type: 'online-game',
      tab: onlineTab,
      title: onlineTab.title || t('Online game'),
      meta:
        onlineTab.onlineGameId == null
          ? null
          : t('Game #') + String(onlineTab.onlineGameId),
    }
  }

  let boardTab =
    boardTabs.find((tab) => tab.id === activeBoardTabId) || boardTabs[0]
  if (boardTab != null) {
    return {
      type: 'board',
      tab: boardTab,
      title:
        boardTab.representedFilename == null ||
        boardTab.representedFilename === ''
          ? t('Untitled Board')
          : basename(boardTab.representedFilename),
      meta: t('Local board'),
    }
  }

  return null
}
