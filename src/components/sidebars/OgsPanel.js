import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import sabaki from '../../modules/sabaki.js'
import {
  updateMultiMatchmakingOption,
  updateNestedMatchmakingOption,
  updateScalarMatchmakingOption,
} from '../../modules/ogsmatchmakingoptions.js'
import OgsPanelSyncController from '../../modules/ogspanelsync.js'
import {AccountStatus, LoginForm} from './OgsPanelAccount.js'
import {
  CheckboxGroup,
  NumberField,
  RadioGroup,
  SelectField,
} from './OgsPanelControls.js'
import {
  OgsDashboardNav,
  QuickLinksCard,
  SectionDetail,
} from './OgsPanelDashboard.js'
import {OnlineGameForm} from './OgsPanelGames.js'
import {
  boardSizes,
  conditions,
  createOgsPanelLabels,
  defaultMatchmakingOptions,
  getSocketLabel,
  handicapValues,
  rules,
  speeds,
  timeSystems,
} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')
const ogsPanelLabels = createOgsPanelLabels(t)

export default class OgsPanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      username: '',
      user: null,
      busy: false,
      error: null,
      connected: false,
      socket: null,
      matchmaking: {options: defaultMatchmakingOptions},
      onlineGame: null,
      activeGames: [],
      activeSection: 'overview',
    }

    this.syncController = new OgsPanelSyncController({sabaki})

    this.handleUsernameInput = (evt) => {
      this.setState({username: evt.currentTarget.value})
    }

    this.handleSectionButtonClick = (activeSection) => {
      this.setState({activeSection})
    }

    this.handleSubmit = async (evt) => {
      evt.preventDefault()

      let username = this.state.username.trim()
      let password = this.passwordInputElement?.value || ''

      if (username === '') return

      this.setState({busy: true, error: null})

      if (this.passwordInputElement != null) {
        this.passwordInputElement.value = ''
      }

      let result

      try {
        result = await window.sabaki.ogs.login(username, password)
      } catch (err) {
        result = {ok: false, error: {message: t('Unable to connect to OGS.')}}
      }

      if (result.ok) {
        this.setState({
          username,
          user: result.user,
          socket: result.state?.socket || null,
          matchmaking: result.state?.matchmaking || this.state.matchmaking,
          onlineGame: result.state?.onlineGame || null,
          activeGames: result.state?.activeGames || [],
          connected: true,
        })
      } else {
        this.setState({error: result.error?.message || t('OGS login failed.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectButtonClick = async () => {
      sabaki.detachOgsGame()
      await window.sabaki.ogs.logout()
      this.setState({
        user: null,
        connected: false,
        error: null,
        socket: null,
        onlineGame: null,
        activeGames: [],
      })
      this.syncController.resetSession()
    }

    this.handleActiveGameButtonClick = async (gameId) => {
      this.setState({busy: true, error: null})

      try {
        if (
          this.state.onlineGame?.gameId === gameId &&
          this.state.onlineGame?.status === 'connected'
        ) {
          let loaded = await this.syncController.syncOnlineGameToBoard(
            this.state.onlineGame,
          )
          if (loaded) sabaki.setState({activeWorkspace: 'board'})
          this.setState({busy: false})
          return
        }

        let result = await window.sabaki.ogs.connectGame(gameId)
        this.syncController.resetConnectAttempt()

        if (result.ok) {
          this.setState({
            socket: result.state.socket,
            matchmaking: result.state.matchmaking,
            onlineGame: result.state.onlineGame,
            activeGames: result.state.activeGames || this.state.activeGames,
          })
          await this.syncController.syncOnlineGameToBoard(
            result.state.onlineGame,
          )
        } else {
          this.setState({
            error: result.error?.message || t('Unable to connect to game.'),
            onlineGame: result.state?.onlineGame || this.state.onlineGame,
            activeGames: result.state?.activeGames || this.state.activeGames,
          })
        }
      } catch (err) {
        this.setState({error: t('Unable to connect to game.')})
      }

      this.setState({busy: false})
    }

    this.handleDisconnectGameButtonClick = async () => {
      let gameId = this.state.onlineGame?.gameId
      if (gameId == null) return

      let result = await window.sabaki.ogs.disconnectGame(gameId)

      if (result.ok) {
        this.setState({onlineGame: result.state.onlineGame})
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
      this.setState({busy: true, error: null})

      try {
        let result = await window.sabaki.ogs.startAutomatch()

        if (result.ok) {
          this.setState({
            matchmaking: result.state.matchmaking,
            socket: result.state.socket,
          })
        } else {
          this.setState({
            error: result.error?.message || t('Unable to start automatch.'),
            matchmaking: result.state?.matchmaking || this.state.matchmaking,
            socket: result.state?.socket || this.state.socket,
          })
        }
      } catch (err) {
        this.setState({error: t('Unable to start automatch.')})
      }

      this.setState({busy: false})
    }

    this.handleCancelAutomatchButtonClick = async () => {
      this.setState({busy: true, error: null})

      try {
        let result = await window.sabaki.ogs.cancelAutomatch()

        if (result.ok) {
          this.setState({
            matchmaking: result.state.matchmaking,
            socket: result.state.socket,
          })
        } else {
          this.setState({
            error: result.error?.message || t('Unable to cancel automatch.'),
            matchmaking: result.state?.matchmaking || this.state.matchmaking,
            socket: result.state?.socket || this.state.socket,
          })
        }
      } catch (err) {
        this.setState({error: t('Unable to cancel automatch.')})
      }

      this.setState({busy: false})
    }
  }

  async updateMatchmakingOptions(options) {
    this.setState({
      matchmaking: {...this.state.matchmaking, options},
    })

    try {
      let state = await window.sabaki.ogs.setMatchmakingOptions(options)

      this.setState({
        matchmaking: state.matchmaking,
        socket: state.socket,
      })
    } catch (err) {}
  }

  async componentDidMount() {
    this.pollTimer = setInterval(() => this.refreshOgsState(), 2000)
    await this.refreshOgsState()
  }

  componentWillUnmount() {
    clearInterval(this.pollTimer)
  }

  async refreshOgsState() {
    let state = null

    try {
      state = await window.sabaki.ogs.getState()
    } catch (err) {
      return
    }

    if (state?.user != null) {
      this.setState({
        username: state.user.username || '',
        user: state.user,
        socket: state.socket,
        matchmaking: state.matchmaking,
        onlineGame: state.onlineGame,
        activeGames: state.activeGames || [],
        connected: true,
      })
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
        await window.sabaki.ogs.acknowledgeAutomatchOpen(
          state.onlineGame.gameId,
        )
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

function AutomatchForm({
  options,
  status,
  authenticated,
  busy,
  onOptionChange,
  onConditionChange,
  onMultiChange,
  onStartAutomatch,
  onCancelAutomatch,
}) {
  let searching = status === 'searching'
  let active = ['searching', 'matched'].includes(status)

  return h(
    'section',
    {class: 'ogs-matchmaking'},
    h('h3', {}, t('Play')),
    h('p', {}, t('Choose how you want to play and find an OGS opponent.')),

    h(CheckboxGroup, {
      title: t('Board size'),
      name: 'boardSizes',
      values: boardSizes,
      selected: options.boardSizes,
      format: (size) => `${size}x${size}`,
      disabled: active || busy,
      onChange: onMultiChange,
    }),

    h(CheckboxGroup, {
      title: t('Game speed'),
      name: 'speeds',
      values: speeds,
      selected: options.speeds,
      format: (speed) => ogsPanelLabels.speeds[speed] || speed,
      disabled: active || busy,
      onChange: onMultiChange,
    }),

    h(SelectField, {
      label: t('Clock'),
      name: 'timeSystem',
      value: options.timeSystem,
      values: timeSystems,
      format: (timeSystem) =>
        ogsPanelLabels.timeSystems[timeSystem] || timeSystem,
      disabled: active || busy,
      onChange: onOptionChange,
    }),

    h(NumberField, {
      label: t('Lower rank difference'),
      name: 'lowerRankDiff',
      value: options.lowerRankDiff,
      disabled: active || busy,
      onInput: onOptionChange,
    }),

    h(NumberField, {
      label: t('Upper rank difference'),
      name: 'upperRankDiff',
      value: options.upperRankDiff,
      disabled: active || busy,
      onInput: onOptionChange,
    }),

    h(ConditionValueField, {
      title: t('Rules'),
      valueLabel: t('Rule set'),
      conditionLabel: t('Preference'),
      group: 'rules',
      option: options.rules,
      values: rules,
      formatValue: (rule) => ogsPanelLabels.rules[rule] || rule,
      disabled: active || busy,
      onChange: onConditionChange,
    }),

    h(ConditionValueField, {
      title: t('Handicap games'),
      valueLabel: t('Handicap'),
      conditionLabel: t('Preference'),
      group: 'handicap',
      option: options.handicap,
      values: handicapValues,
      formatValue: (value) => ogsPanelLabels.handicap[value] || value,
      disabled: active || busy,
      onChange: onConditionChange,
    }),

    status === 'searching' &&
      h('p', {class: 'ogs-matchmaking-status'}, t('Searching for opponent…')),
    status === 'matched' &&
      h(
        'p',
        {class: 'ogs-matchmaking-status'},
        t('Match found. Opening board…'),
      ),

    searching
      ? h(
          'button',
          {
            type: 'button',
            disabled: busy,
            onClick: onCancelAutomatch,
          },
          t('Cancel search'),
        )
      : h(
          'button',
          {
            type: 'button',
            disabled: busy || !authenticated || active,
            title: !authenticated
              ? t('OGS socket must be authenticated first.')
              : t('Find an OGS opponent.'),
            onClick: onStartAutomatch,
          },
          t('Find opponent'),
        ),
  )
}

function ConditionValueField({
  title,
  group,
  option,
  values,
  valueLabel,
  conditionLabel,
  formatValue = (x) => x,
  disabled,
  onChange,
}) {
  return h(
    'fieldset',
    {},
    h('legend', {}, title),
    h(RadioGroup, {
      label: conditionLabel,
      name: `${group}.condition`,
      selected: option.condition,
      values: conditions,
      format: (condition) => ogsPanelLabels.conditions[condition] || condition,
      disabled,
      onChange,
    }),
    h(SelectField, {
      label: valueLabel,
      name: `${group}.value`,
      value: option.value,
      values,
      format: formatValue,
      disabled,
      onChange,
    }),
  )
}
