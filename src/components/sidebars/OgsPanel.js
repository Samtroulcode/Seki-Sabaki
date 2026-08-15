import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import {showMessageBox} from '../../modules/dialog.js'
import {selectBestReview} from '../../ogs/review-sanitize.js'
import sabaki from '../../modules/sabaki.js'
import onlineStore from '../../modules/onlinestore.js'
import {getOgsOnlineController} from '../../modules/ogsonlinecontroller.js'
import {AccountStatus, LoginForm} from './OgsPanelAccount.js'
import {OgsGameHistoryPanel} from './OgsGameHistory.js'
import {AutomatchForm} from './OgsPanelMatchmaking.js'
import {OnlineGameForm} from './OgsPanelGames.js'
import {defaultMatchmakingOptions, getSocketLabel} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')

export default class OgsPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      ...onlineStore.getState(),
    }

    this.handleUsernameInput = (evt) => {
      onlineStore.setUsername(evt.currentTarget.value)
    }

    this.handleSubmit = async (evt) => {
      evt.preventDefault()

      let username = this.state.username.trim()
      let password = this.passwordInputElement?.value || ''

      if (username === '') return

      if (this.passwordInputElement != null) {
        this.passwordInputElement.value = ''
      }

      await onlineStore.login(username, password)
    }

    this.handleDisconnectButtonClick = async () => {
      sabaki.detachOgsGame()
      await onlineStore.logout()
      getOgsOnlineController().resetSession()
    }

    this.handleActiveGameButtonClick = async (gameId) => {
      try {
        await getOgsOnlineController().openGame(gameId, this.state)
      } catch (err) {
        onlineStore.setState({error: t('Unable to connect to game.')})
      }
    }

    this.handleDisconnectGameButtonClick = async () => {
      let gameId = this.state.onlineGame?.gameId
      if (gameId == null) return

      let result = await onlineStore.disconnectGame(gameId)

      if (result.ok) {
        sabaki.detachOgsGame(gameId)
        getOgsOnlineController().resetSyncKey()
      }
    }

    this.handleRefreshHistoryButtonClick = async () => {
      await onlineStore.refreshGameHistory({
        page: this.state.gameHistoryPage || 1,
        pageSize: 12,
      })
    }

    this.handlePreviousHistoryPageButtonClick = async () => {
      await onlineStore.refreshGameHistory({
        page: Math.max(1, (this.state.gameHistoryPage || 1) - 1),
        pageSize: 12,
      })
    }

    this.handleNextHistoryPageButtonClick = async () => {
      await onlineStore.refreshGameHistory({
        page: (this.state.gameHistoryPage || 1) + 1,
        pageSize: 12,
      })
    }

    this.handleOpenHistoryGameButtonClick = async (gameId) => {
      let result = await onlineStore.downloadGameSgf(gameId)

      if (result.stale) return

      if (!result.ok) {
        onlineStore.setState({
          gameHistoryError:
            result.error?.message || t('Unable to download SGF from OGS.'),
        })
        return
      }

      let success = await sabaki.openContentInNewBoardTab(result.sgf, 'sgf', {
        gotoEnd: true,
        representedFilename: null,
      })

      if (!success) {
        onlineStore.setState({gameHistoryError: t('Unable to open OGS SGF.')})
      }
    }

    this.handleAnalyzeSekiButtonClick = async (gameId) => {
      let result = await onlineStore.downloadGameSgf(gameId)
      if (result.stale || !result.ok) return

      await sabaki.startCurrentGameSgfAnalysis({sgfContent: result.sgf})
    }

    this.handleAnalyzeOgsButtonClick = async (gameId) => {
      let result = await onlineStore.listAiReviews(gameId)
      let review = selectBestReview(result.reviews)

      if (!result.ok || review == null) {
        await showMessageBox(
          result.error?.message ||
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

      let sgf = await onlineStore.downloadGameSgf(gameId)
      if (sgf.ok) {
        await sabaki.openContentInNewBoardTab(sgf.sgf, 'sgf', {
          gotoEnd: true,
          representedFilename: null,
        })
      } else {
        await window.sabaki.ogsReviews.disconnect(review.uuid)
      }
    }

    this.handleMatchmakingOptionChange = async (options) => {
      await onlineStore.setMatchmakingOptions(options)
    }

    this.handleStartAutomatchButtonClick = async () => {
      await onlineStore.startAutomatch()
    }

    this.handleCancelAutomatchButtonClick = async () => {
      await onlineStore.cancelAutomatch()
    }

    this.handleOnlineStoreState = (state) => this.setState(state)

    this.lastFallbackRefreshAt = 0
  }

  async componentDidMount() {
    this.unsubscribeOnlineStore = onlineStore.subscribe(
      this.handleOnlineStoreState,
    )
    this.pollTimer = setInterval(() => this.refreshOgsStateIfDue(), 2000)
    await this.refreshOgsState()

    if (this.state.connected) {
      await onlineStore.refreshGameHistory({page: 1, pageSize: 12})
    }
  }

  componentWillUnmount() {
    this.unsubscribeOnlineStore?.()
    clearInterval(this.pollTimer)
  }

  async refreshOgsState() {
    try {
      await onlineStore.refresh()
    } catch (err) {
      return
    }

    this.lastFallbackRefreshAt = Date.now()
  }

  async refreshOgsStateIfDue() {
    let now = Date.now()
    if (hasOgsStateChangeEvents() && now - this.lastFallbackRefreshAt < 60000) {
      return
    }

    this.lastFallbackRefreshAt = now
    await this.refreshOgsState()
  }

  render(
    props,
    {
      username,
      user,
      busy,
      error,
      connected,
      socket,
      matchmaking,
      onlineGame,
      activeGames,
      gameHistory,
      gameHistoryPage,
      gameHistoryHasNext,
      gameHistoryHasPrevious,
      gameHistoryBusy,
      gameHistoryError,
    },
  ) {
    let matchmakingOptions = matchmaking?.options || defaultMatchmakingOptions
    let authenticated = socket?.status === 'authenticated'
    let connectedGame = onlineGame?.status === 'connected' ? onlineGame : null

    return h(
      'section',
      {id: 'ogs-dashboard', class: 'ogs-panel ogs-dashboard'},

      h(
        'div',
        {class: 'ogs-dashboard-hero', role: 'banner'},
        h(
          'div',
          {class: 'ogs-dashboard-title'},
          h('div', {class: 'ogs-panel-logo'}, 'OGS'),
          h(
            'div',
            {},
            h('p', {class: 'ogs-dashboard-kicker'}, t('Online workspace')),
            h('h2', {}, t('Online Go Server')),
            h('p', {}, t('Play, review history, and manage your account.')),
          ),
        ),
        h(
          'div',
          {class: 'ogs-dashboard-hero-actions'},
          h(
            'span',
            {
              class: `ogs-dashboard-status-pill ${authenticated ? 'online' : ''}`,
            },
            getSocketLabel(socket, t),
          ),
          connected &&
            h(
              'button',
              {type: 'button', onClick: this.handleDisconnectButtonClick},
              t('Disconnect'),
            ),
        ),
      ),

      h(
        'div',
        {class: 'ogs-dashboard-content'},
        !connected
          ? h(
              'section',
              {class: 'ogs-dashboard-card ogs-dashboard-login-card'},
              h(LoginForm, {
                username,
                busy,
                error,
                passwordRef: (el) => (this.passwordInputElement = el),
                onUsernameInput: this.handleUsernameInput,
                onSubmit: this.handleSubmit,
              }),
            )
          : h(
              'div',
              {class: 'ogs-dashboard-grid'},
              h(
                'div',
                {class: 'ogs-dashboard-main'},
                h(
                  'section',
                  {class: 'ogs-dashboard-card ogs-dashboard-primary-card'},
                  h(AutomatchForm, {
                    options: matchmakingOptions,
                    status: matchmaking?.status,
                    authenticated,
                    busy,
                    onChange: this.handleMatchmakingOptionChange,
                    onStartAutomatch: this.handleStartAutomatchButtonClick,
                    onCancelAutomatch: this.handleCancelAutomatchButtonClick,
                  }),
                ),
                h(
                  'section',
                  {class: 'ogs-dashboard-card ogs-dashboard-games-card'},
                  h(OnlineGameForm, {
                    onlineGame,
                    activeGames,
                    authenticated,
                    busy,
                    onConnectGame: this.handleActiveGameButtonClick,
                    onDisconnectGame: this.handleDisconnectGameButtonClick,
                  }),
                ),
                h(
                  'section',
                  {class: 'ogs-dashboard-card ogs-dashboard-history-card'},
                  h(OgsGameHistoryPanel, {
                    games: gameHistory,
                    busy: gameHistoryBusy,
                    error: gameHistoryError,
                    authenticated,
                    page: gameHistoryPage,
                    hasNext: gameHistoryHasNext,
                    hasPrevious: gameHistoryHasPrevious,
                    onRefresh: this.handleRefreshHistoryButtonClick,
                    onPreviousPage: this.handlePreviousHistoryPageButtonClick,
                    onNextPage: this.handleNextHistoryPageButtonClick,
                    onOpenGame: this.handleOpenHistoryGameButtonClick,
                    onAnalyzeOgs: this.handleAnalyzeOgsButtonClick,
                    onAnalyzeSeki: this.handleAnalyzeSekiButtonClick,
                  }),
                ),
              ),
              h(
                'aside',
                {class: 'ogs-dashboard-column ogs-dashboard-account'},
                h(
                  'section',
                  {class: 'ogs-dashboard-card'},
                  h(AccountStatus, {user, username, socket}),
                ),
              ),
            ),
      ),
    )
  }
}

function hasOgsStateChangeEvents() {
  return onlineStore.isUsingCurrentOgsStateChangeEvents()
}
