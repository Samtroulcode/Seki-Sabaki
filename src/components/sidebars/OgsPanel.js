import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import sabaki from '../../modules/sabaki.js'
import onlineStore from '../../modules/onlinestore.js'
import {
  updateMultiMatchmakingOption,
  updateNestedMatchmakingOption,
  updateScalarMatchmakingOption,
} from '../../modules/ogsmatchmakingoptions.js'
import OgsPanelSyncController from '../../modules/ogspanelsync.js'
import {AccountStatus, LoginForm} from './OgsPanelAccount.js'
import {
  OgsDashboardNav,
  QuickLinksCard,
  SectionDetail,
} from './OgsPanelDashboard.js'
import {OnlineGameForm} from './OgsPanelGames.js'
import {AutomatchForm} from './OgsPanelMatchmaking.js'
import {defaultMatchmakingOptions, getSocketLabel} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')

export default class OgsPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      ...onlineStore.getState(),
      activeSection: 'overview',
    }

    this.syncController = new OgsPanelSyncController({sabaki})

    this.handleUsernameInput = (evt) => {
      onlineStore.setUsername(evt.currentTarget.value)
    }

    this.handleSectionButtonClick = (activeSection) => {
      this.setState({activeSection})
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
      this.syncController.resetSession()
    }

    this.handleActiveGameButtonClick = async (gameId) => {
      onlineStore.setState({busy: true, error: null})

      try {
        if (
          this.state.onlineGame?.gameId === gameId &&
          this.state.onlineGame?.status === 'connected'
        ) {
          let loaded = await this.syncController.syncOnlineGameToBoard(
            this.state.onlineGame,
          )
          if (loaded) sabaki.setState({activeWorkspace: 'board'})
          return
        }

        let result = await onlineStore.connectGame(gameId, {manageBusy: false})
        this.syncController.resetConnectAttempt()

        if (result.ok) {
          await this.syncController.syncOnlineGameToBoard(
            result.state.onlineGame,
          )
        }
      } catch (err) {
        onlineStore.setState({error: t('Unable to connect to game.')})
      } finally {
        onlineStore.setState({busy: false})
      }
    }

    this.handleDisconnectGameButtonClick = async () => {
      let gameId = this.state.onlineGame?.gameId
      if (gameId == null) return

      let result = await onlineStore.disconnectGame(gameId)

      if (result.ok) {
        sabaki.detachOgsGame(gameId)
        this.syncController.resetSyncKey()
      }
    }

    this.handleMatchmakingOptionChange = async (evt) => {
      let {name, value} = evt.currentTarget

      await this.updateMatchmakingOptions(
        updateScalarMatchmakingOption(
          this.state.matchmaking.options,
          name,
          value,
        ),
      )
    }

    this.handleConditionOptionChange = async (evt) => {
      let {name, value} = evt.currentTarget

      await this.updateMatchmakingOptions(
        updateNestedMatchmakingOption(
          this.state.matchmaking.options,
          name,
          value,
        ),
      )
    }

    this.handleMultiOptionChange = async (evt) => {
      let {name, value, checked} = evt.currentTarget

      await this.updateMatchmakingOptions(
        updateMultiMatchmakingOption(
          this.state.matchmaking.options,
          name,
          value,
          checked,
        ),
      )
    }

    this.handleStartAutomatchButtonClick = async () => {
      await onlineStore.startAutomatch()
    }

    this.handleCancelAutomatchButtonClick = async () => {
      await onlineStore.cancelAutomatch()
    }
  }

  async updateMatchmakingOptions(options) {
    await onlineStore.setMatchmakingOptions(options)
  }

  async componentDidMount() {
    this.unsubscribeOnlineStore = onlineStore.subscribe((state) => {
      this.setState(state)
    })
    this.pollTimer = setInterval(() => this.refreshOgsState(), 2000)
    await this.refreshOgsState()
  }

  componentWillUnmount() {
    this.unsubscribeOnlineStore?.()
    clearInterval(this.pollTimer)
  }

  async refreshOgsState() {
    let state = null

    try {
      state = await onlineStore.refresh()
    } catch (err) {
      return
    }

    if (state?.user != null) {
      await this.syncController.handleOnlineGameError(state.onlineGame)

      if (
        state.matchmaking?.status === 'matched' &&
        state.matchmaking?.matchedGameId === state.onlineGame?.gameId &&
        state.onlineGame?.status === 'connected'
      ) {
        if (this.syncController.syncingOnlineGame) return

        let opened = await this.syncController.syncOnlineGameToBoard(
          state.onlineGame,
        )
        if (!opened)
          this.syncController.declinedOnlineGameId = state.onlineGame.gameId
        await onlineStore.acknowledgeAutomatchOpen(state.onlineGame.gameId)
      }
    }
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
      activeSection,
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
            h('p', {}, t('Play, follow games, and manage your OGS account.')),
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

      h(OgsDashboardNav, {
        activeSection,
        disabled: !connected,
        onSectionClick: this.handleSectionButtonClick,
      }),

      h(
        'div',
        {class: 'ogs-dashboard-content'},
        h(
          'div',
          {
            class: `ogs-dashboard-grid ${!connected ? 'logged-out' : ''}`,
          },
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
                'aside',
                {class: 'ogs-dashboard-column ogs-dashboard-account'},
                h(
                  'section',
                  {class: 'ogs-dashboard-card'},
                  h(AccountStatus, {user, username, socket}),
                ),
                h(QuickLinksCard, {connected, connectedGame}),
              ),

          connected &&
            h(
              'div',
              {class: 'ogs-dashboard-main'},
              h(
                'section',
                {class: 'ogs-dashboard-card ogs-dashboard-primary-card'},
                h(OnlineGameForm, {
                  onlineGame,
                  activeGames,
                  authenticated,
                  busy,
                  onConnectGame: this.handleActiveGameButtonClick,
                  onDisconnectGame: this.handleDisconnectGameButtonClick,
                }),
              ),
              h(SectionDetail, {activeSection, connected}),
            ),

          connected &&
            h(
              'aside',
              {class: 'ogs-dashboard-column ogs-dashboard-secondary'},
              h(
                'section',
                {class: 'ogs-dashboard-card'},
                h(AutomatchForm, {
                  options: matchmakingOptions,
                  status: matchmaking?.status,
                  authenticated,
                  busy,
                  onOptionChange: this.handleMatchmakingOptionChange,
                  onConditionChange: this.handleConditionOptionChange,
                  onMultiChange: this.handleMultiOptionChange,
                  onStartAutomatch: this.handleStartAutomatchButtonClick,
                  onCancelAutomatch: this.handleCancelAutomatchButtonClick,
                }),
              ),
            ),
        ),
      ),
    )
  }
}
