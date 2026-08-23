import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import {showMessageBox} from '../../modules/dialog.js'
import {selectBestReview} from '../../ogs/review-sanitize.js'
import sabaki from '../../modules/sabaki.js'
import onlineStore from '../../modules/onlinestore.js'
import {getOgsOnlineController} from '../../modules/ogsonlinecontroller.js'
import {AccountStatus, LoginForm, PlayerStatsCard} from './OgsPanelAccount.js'
import {OgsGameHistoryPanel} from './OgsGameHistory.js'
import {OgsFriendsPanel} from './OgsFriendsList.js'
import {AutomatchForm} from './OgsPanelMatchmaking.js'
import {defaultMatchmakingOptions, getSocketLabel} from './ogsPanelData.js'
import {analyzeOgsGame, analyzeSekiGame} from './ogsAnalysisActions.js'

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
      await analyzeSekiGame(gameId)
    }

    this.handleAnalyzeOgsButtonClick = async (gameId) => {
      await analyzeOgsGame(gameId, {t})
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

    this.handleRefreshFriendsButtonClick = async () => {
      await onlineStore.refreshFriends()
    }

    this.handleRefreshPlayerProfileButtonClick = async () => {
      await onlineStore.refreshPlayerProfile()
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
    this.refreshConnectedSectionsIfNeeded()
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.connected && !this.state.connected) {
      this.lastConnectedUserId = null
      return
    }

    if (
      (!prevState.connected && this.state.connected) ||
      prevState.user?.id !== this.state.user?.id
    ) {
      this.refreshConnectedSectionsIfNeeded()
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

  async refreshConnectedSectionsIfNeeded() {
    let state = onlineStore.getState()
    let userId = state.user?.id ?? null

    if (!state.connected || userId == null) {
      this.lastConnectedUserId = null
      return
    }

    if (this.lastConnectedUserId === userId) return
    this.lastConnectedUserId = userId

    await onlineStore.refreshGameHistory({page: 1, pageSize: 12})
    await onlineStore.refreshFriends()
    await onlineStore.refreshPlayerProfile()
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
      gameHistory,
      gameHistoryPage,
      gameHistoryHasNext,
      gameHistoryHasPrevious,
      gameHistoryBusy,
      gameHistoryError,
      friends,
      friendsBusy,
      friendsError,
      playerProfile,
      playerProfileBusy,
      playerProfileError,
    },
  ) {
    let matchmakingOptions = matchmaking?.options || defaultMatchmakingOptions
    let authenticated = socket?.status === 'authenticated'

    return h(
      'section',
      {id: 'ogs-dashboard', class: 'ogs-panel ogs-dashboard'},

      h(
        'div',
        {class: 'ogs-dashboard-hero', role: 'banner'},
        h(
          'div',
          {class: 'ogs-dashboard-title'},
          connected && user?.iconUrl != null
            ? h('img', {
                class: 'ogs-panel-logo ogs-panel-logo-avatar',
                src: user.iconUrl,
                alt: '',
              })
            : h('div', {class: 'ogs-panel-logo'}, 'OGS'),
          h(
            'div',
            {},
            h('p', {class: 'ogs-dashboard-kicker'}, t('Online workspace')),
            h(
              'h2',
              {},
              connected && user?.username
                ? t(`Welcome back, ${user.username}`)
                : t('Online Go Server'),
            ),
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
                h(
                  'section',
                  {class: 'ogs-dashboard-card'},
                  h(PlayerStatsCard, {
                    profile: playerProfile,
                    busy: playerProfileBusy,
                    error: playerProfileError,
                    onRefresh: this.handleRefreshPlayerProfileButtonClick,
                  }),
                ),
                h(
                  'section',
                  {class: 'ogs-dashboard-card ogs-dashboard-friends-card'},
                  h(OgsFriendsPanel, {
                    friends,
                    busy: friendsBusy,
                    error: friendsError,
                    connected,
                    onRefresh: this.handleRefreshFriendsButtonClick,
                  }),
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
