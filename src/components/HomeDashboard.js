import {h, Component} from 'preact'
import i18n from '../i18n.js'
import {showMessageBox} from '../modules/dialog.js'
import {selectBestReview} from '../ogs/review-sanitize.js'
import sabaki from '../modules/sabaki.js'
import onlineStore from '../modules/onlinestore.js'
import HomeBoardPreview from './HomeBoardPreview.js'
import HomeOnlinePanel from './HomeOnlinePanel.js'
import {
  getHistoryPreview,
  OgsGameHistoryPanel,
} from './sidebars/OgsGameHistory.js'

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
      ...onlineStore.getState(),
      configuredBoardDimensions: configuredDimensions,
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

    this.handleBoardSizeChange = (selectedBoardSize) => {
      this.setState({selectedBoardSize})
    }

    this.handleOpenFileButtonClick = async () => {
      await sabaki.openFileInNewBoardTab()
    }

    this.handleOnlineStoreState = (state) => this.setState(state)

    this.handleOgsButtonClick = () => {
      this.props.onNavigate('ogs')
    }

    this.handleOgsHistoryButtonClick = () => {
      sabaki.setState({activeWorkspace: 'home', homeSection: 'ogs'})
    }

    this.handleOgsHistoryRefresh = async () => {
      await onlineStore.refreshGameHistory({page: 1, pageSize: 3})
    }

    this.handleOgsHistoryGameClick = async (gameId) => {
      let result = await this.downloadOgsGame(gameId)

      if (result == null) return

      let success = await sabaki.openContentInNewBoardTab(result.sgf, 'sgf', {
        gotoEnd: true,
        representedFilename: null,
      })

      if (!success) {
        onlineStore.setState({gameHistoryError: t('Unable to open OGS SGF.')})
      }
    }

    this.handleAnalyzeSeki = async (gameId) => {
      let result = await this.downloadOgsGame(gameId)
      if (result == null) return

      await sabaki.startCurrentGameSgfAnalysis({sgfContent: result.sgf})
    }

    this.handleAnalyzeOgs = async (gameId) => {
      let result = await onlineStore.listAiReviews(gameId)
      if (!result.ok) {
        await showMessageBox(
          result.error?.message || t('Unable to load OGS AI reviews.'),
          'warning',
        )
        return
      }

      let review = selectBestReview(result.reviews)

      if (review == null) {
        await showMessageBox(
          t('No OGS AI review is available for this game.'),
          'info',
        )
        return
      }

      let connection = await window.sabaki.ogsReviews.connect(gameId, review)
      if (!connection?.ok) {
        await showMessageBox(
          connection?.error?.message ||
            t('Unable to connect to OGS AI review.'),
          'warning',
        )
        return
      }

      let sgf = await this.downloadOgsGame(gameId)
      if (sgf == null) {
        await window.sabaki.ogsReviews.disconnect(review.uuid)
        return
      }

      let success = await sabaki.openContentInNewBoardTab(sgf.sgf, 'sgf', {
        gotoEnd: true,
        representedFilename: null,
      })
      if (!success) await window.sabaki.ogsReviews.disconnect(review.uuid)
    }

    this.downloadOgsGame = async (gameId) => {
      let result = await onlineStore.downloadGameSgf(gameId)

      if (result.stale) return null

      if (!result.ok) {
        onlineStore.setState({
          gameHistoryError:
            result.error?.message || t('Unable to download SGF from OGS.'),
        })
        return null
      }

      return result
    }
  }

  componentDidMount() {
    this.mounted = true
    this.unsubscribeOnlineStore = onlineStore.subscribe(
      this.handleOnlineStoreState,
    )
    this.refreshOgsHistoryPreviewIfNeeded()
  }

  componentDidUpdate() {
    this.refreshOgsHistoryPreviewIfNeeded()
  }

  componentWillUnmount() {
    this.mounted = false
    this.unsubscribeOnlineStore?.()
  }

  async refreshOgsHistoryPreviewIfNeeded() {
    let state = onlineStore.getState()
    let userId = state.user?.id ?? null

    if (userId == null) this.ogsHistoryPreviewUserId = null

    if (
      !this.mounted ||
      userId == null ||
      state.gameHistory.length > 0 ||
      state.gameHistoryBusy ||
      this.ogsHistoryPreviewUserId === userId
    ) {
      return
    }

    this.ogsHistoryPreviewUserId = userId
    await onlineStore.refreshGameHistory({page: 1, pageSize: 3})
  }

  render({onlineGameId, boardTabs = [], onNavigate}) {
    let hasOnlineGame = onlineGameId != null
    let hasBoardTabs = boardTabs.length > 0
    let onlineState = this.state
    let ogsAuthenticated = onlineState.socket?.status === 'authenticated'
    let ogsHistoryPreview = getHistoryPreview(onlineState.gameHistory, 3)
    let selectedBoardSize = this.state.selectedBoardSize
    let previewDimensions = selectedBoardSize
      ? [selectedBoardSize, selectedBoardSize]
      : this.state.configuredBoardDimensions

    return h(
      'div',
      {class: 'home-dashboard'},
      h(
        'div',
        {class: 'home-hero'},
        h('p', {class: 'home-kicker'}, t('Seki Sabaki')),
        h('h1', {}, t('Your Go workspace')),
        h('p', {}, t('Choose a board and start playing.')),
      ),
      h(
        'div',
        {class: 'home-layout'},
        h(HomeNavigation, {
          onNavigate,
          onOpenFile: this.handleOpenFileButtonClick,
        }),
        h(
          'div',
          {class: 'home-main-content'},
          h(
            'div',
            {class: 'home-primary-grid'},
            h(
              'section',
              {class: 'home-create-board'},
              h('h2', {}, t('New board')),
              h(
                'div',
                {class: 'home-board-preview'},
                h(
                  'div',
                  {class: 'home-board-preview-goban', 'aria-hidden': 'true'},
                  h(HomeBoardPreview, {
                    width: previewDimensions[0],
                    height: previewDimensions[1],
                  }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'home-create-board-button',
                    onClick: this.handleNewGameButtonClick,
                  },
                  h('strong', {}, t('New board')),
                  h('span', {}, t('Start a fresh game')),
                ),
              ),
              h(
                'div',
                {
                  class: 'home-board-sizes',
                  role: 'group',
                  'aria-label': t('Board size'),
                },
                [9, 13, 19].map((size) =>
                  h(
                    'button',
                    {
                      key: size,
                      type: 'button',
                      class: selectedBoardSize === size ? 'selected' : '',
                      'aria-pressed': selectedBoardSize === size,
                      onClick: () => this.handleBoardSizeChange(size),
                    },
                    `${size}x${size}`,
                  ),
                ),
              ),
            ),
            h(HomeOnlinePanel),
          ),
          (hasOnlineGame || hasBoardTabs) &&
            h(
              'button',
              {
                type: 'button',
                class: 'home-continue-link',
                onClick: () => sabaki.setState({activeWorkspace: 'board'}),
              },
              hasOnlineGame
                ? t('Continue game #') + String(onlineGameId)
                : t('Resume current board'),
            ),
          h(
            'section',
            {class: 'home-section home-recent-games'},
            h(
              'div',
              {class: 'home-section-heading'},
              h('h2', {}, t('Recent OGS games')),
              h('p', {}, t('Your latest games, ready to review.')),
            ),
            h(
              'article',
              {class: 'home-card home-ogs-history-card'},
              h(OgsGameHistoryPanel, {
                games: ogsHistoryPreview,
                busy: onlineState.gameHistoryBusy,
                error: onlineState.gameHistoryError,
                authenticated: ogsAuthenticated,
                compact: true,
                emptyText: t('No recent OGS games loaded yet.'),
                onRefresh: this.handleOgsHistoryRefresh,
                onOpenGame: this.handleOgsHistoryGameClick,
                onAnalyzeOgs: this.handleAnalyzeOgs,
                onAnalyzeSeki: this.handleAnalyzeSeki,
                onOpenOgs: this.handleOgsButtonClick,
              }),
              ogsAuthenticated &&
                h(
                  'button',
                  {type: 'button', onClick: this.handleOgsHistoryButtonClick},
                  t('View all OGS history'),
                ),
            ),
          ),
        ),
      ),
    )
  }
}

function HomeNavigation({onNavigate, onOpenFile}) {
  return h(
    'nav',
    {class: 'home-navbar', 'aria-label': t('Home navigation')},
    h(HomeNavButton, {
      label: t('Open SGF'),
      icon: 'file-16.svg',
      onClick: onOpenFile,
    }),
    h(HomeNavButton, {
      label: t('Analyze'),
      icon: 'graph-16.svg',
      onClick: () => onNavigate('analysis'),
    }),
    h(HomeNavButton, {
      label: t('Online play'),
      icon: 'globe-16.svg',
      onClick: () => onNavigate('ogs'),
    }),
    h(HomeNavButton, {
      label: t('Library'),
      icon: 'book-16.svg',
      onClick: () => onNavigate('library'),
    }),
  )
}

function HomeNavButton({label, icon, onClick}) {
  return h(
    'button',
    {type: 'button', class: 'home-nav-button', onClick},
    h('img', {
      src: `./node_modules/@primer/octicons/build/svg/${icon}`,
      alt: '',
      'aria-hidden': 'true',
    }),
    h('span', {}, label),
  )
}
