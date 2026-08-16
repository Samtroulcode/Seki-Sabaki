import {h, Component} from 'preact'
import i18n from '../i18n.js'
import onlineStore from '../modules/onlinestore.js'
import {defaultMatchmakingOptions} from './sidebars/ogsPanelData.js'
import HomeBoardPreview from './HomeBoardPreview.js'
import {LoginForm} from './sidebars/OgsPanelAccount.js'

const t = i18n.context('HomeDashboard')

const boardSizes = [9, 13, 19]
const clockModes = [
  {id: 'fischer', label: 'Fischer'},
  {id: 'byoyomi', label: 'Byo-yomi'},
]

const timePresets = {
  9: {
    fischer: [
      ['9-fischer-30', '30s + 5s', 'blitz'],
      ['9-fischer-2m', '2m + 7s', 'rapid'],
      ['9-fischer-3m', '3m + 10s', 'live'],
    ],
    byoyomi: [
      ['9-byoyomi-30', '30s + 5x10s', 'blitz'],
      ['9-byoyomi-2m', '2m + 5x30s', 'rapid'],
      ['9-byoyomi-5m', '5m + 5x30s', 'live'],
    ],
  },
  13: {
    fischer: [
      ['13-fischer-30', '30s + 5s', 'blitz'],
      ['13-fischer-3m', '3m + 7s', 'rapid'],
      ['13-fischer-5m', '5m + 10s', 'live'],
    ],
    byoyomi: [
      ['13-byoyomi-30', '30s + 5x10s', 'blitz'],
      ['13-byoyomi-3m', '3m + 5x30s', 'rapid'],
      ['13-byoyomi-10m', '10m + 5x30s', 'live'],
    ],
  },
  19: {
    fischer: [
      ['19-fischer-30', '30s + 5s', 'blitz'],
      ['19-fischer-5m', '5m + 7s', 'rapid'],
      ['19-fischer-10m', '10m + 10s', 'live'],
    ],
    byoyomi: [
      ['19-byoyomi-30', '30s + 5x10s', 'blitz'],
      ['19-byoyomi-5m', '5m + 5x30s', 'rapid'],
      ['19-byoyomi-20m', '20m + 5x30s', 'live'],
    ],
  },
}

export default class HomeOnlinePanel extends Component {
  constructor(props) {
    super(props)

    this.state = {
      boardSize: 19,
      clockMode: 'byoyomi',
      presetId: timePresets[19].byoyomi[1][0],
    }

    this.handleUsernameInput = (evt) => {
      onlineStore.setUsername(evt.currentTarget.value)
    }

    this.handleSubmit = async (evt) => {
      evt.preventDefault()
      let username = onlineStore.getState().username.trim()
      let password = this.passwordInputElement?.value || ''
      if (username === '') return
      if (this.passwordInputElement != null)
        this.passwordInputElement.value = ''
      await onlineStore.login(username, password)
    }

    this.handleBoardSizeChange = (boardSize) => {
      let presets = timePresets[boardSize][this.state.clockMode]
      this.setState({boardSize, presetId: presets[1][0]})
    }

    this.handleClockModeChange = (clockMode) => {
      let presets = timePresets[this.state.boardSize][clockMode]
      this.setState({clockMode, presetId: presets[1][0]})
    }

    this.handleStartClick = async () => {
      let preset = getSelectedPreset(this.state)

      let currentOptions =
        onlineStore.getState().matchmaking?.options || defaultMatchmakingOptions
      let result = await onlineStore.setMatchmakingOptions({
        ...currentOptions,
        boardSizes: [this.state.boardSize],
        speeds: [preset[2]],
        timeSystem: this.state.clockMode,
      })
      if (result == null) return

      await onlineStore.startAutomatch()
    }
  }

  render() {
    let {boardSize, clockMode, presetId} = this.state
    let onlineState = onlineStore.getState()
    let automatchActive = ['searching', 'matched'].includes(
      onlineState.matchmaking?.status,
    )
    let authenticated = onlineState.socket?.status === 'authenticated'
    let presets = timePresets[boardSize][clockMode]
    let selectedPreset = presets.find((preset) => preset[0] === presetId)

    if (!authenticated) {
      return h(
        'section',
        {class: 'home-online-panel'},
        h(LoginForm, {
          username: onlineState.username,
          busy: onlineState.busy,
          error: onlineState.error,
          passwordRef: (el) => (this.passwordInputElement = el),
          onUsernameInput: this.handleUsernameInput,
          onSubmit: this.handleSubmit,
        }),
      )
    }

    return h(
      'section',
      {class: 'home-online-panel'},
      h(
        'div',
        {class: 'home-online-heading'},
        h(
          'div',
          {class: 'home-online-account'},
          onlineState.user?.iconUrl != null
            ? h('img', {
                class: 'ogs-avatar home-online-avatar',
                src: onlineState.user.iconUrl,
                alt: '',
              })
            : h(
                'span',
                {class: 'ogs-avatar home-online-avatar-fallback'},
                getInitial(onlineState.user?.username || onlineState.username),
              ),
          h(
            'div',
            {},
            h(
              'strong',
              {class: 'home-online-username'},
              onlineState.user?.username || onlineState.username,
            ),
            onlineState.user?.rank != null &&
              h('span', {class: 'home-online-rank'}, onlineState.user.rank),
          ),
        ),
        h('h2', {}, t('Play online')),
        h('p', {}, t('Find an OGS opponent with a ready-to-play clock.')),
      ),
      h(
        'div',
        {class: 'home-online-content'},
        h('span', {class: 'home-online-label'}, t('Board size')),
        h(
          'div',
          {
            class: 'home-online-sizes',
            role: 'group',
            'aria-label': t('Board size'),
          },
          boardSizes.map((size) =>
            h(
              'button',
              {
                key: size,
                type: 'button',
                class: boardSize === size ? 'selected' : '',
                'aria-pressed': boardSize === size,
                onClick: () => this.handleBoardSizeChange(size),
              },
              `${size}x${size}`,
            ),
          ),
        ),
        h(
          'div',
          {class: 'home-online-preview', 'aria-hidden': 'true'},
          h(HomeBoardPreview, {width: boardSize}),
        ),
        h(
          'div',
          {class: 'home-online-settings'},
          h('span', {class: 'home-online-label'}, t('Clock')),
          h(
            'div',
            {
              class: 'home-online-modes',
              role: 'group',
              'aria-label': t('Clock'),
            },
            clockModes.map((mode) =>
              h(
                'button',
                {
                  key: mode.id,
                  type: 'button',
                  class: clockMode === mode.id ? 'selected' : '',
                  'aria-pressed': clockMode === mode.id,
                  onClick: () => this.handleClockModeChange(mode.id),
                },
                t(mode.label),
              ),
            ),
          ),
          h('span', {class: 'home-online-label'}, t('Time setting')),
          h(
            'div',
            {class: 'home-online-presets'},
            presets.map((preset) =>
              h(
                'button',
                {
                  key: preset[0],
                  type: 'button',
                  class: selectedPreset?.[0] === preset[0] ? 'selected' : '',
                  'aria-pressed': selectedPreset?.[0] === preset[0],
                  onClick: () => this.setState({presetId: preset[0]}),
                },
                preset[1],
              ),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'home-online-start',
              disabled: automatchActive || !authenticated,
              onClick: this.handleStartClick,
            },
            authenticated ? t('Find opponent') : t('Connect to OGS first'),
          ),
        ),
      ),
    )
  }
}

function getSelectedPreset({boardSize, clockMode, presetId}) {
  return (
    timePresets[boardSize][clockMode].find(
      (preset) => preset[0] === presetId,
    ) || timePresets[boardSize][clockMode][0]
  )
}

function getInitial(username) {
  if (typeof username !== 'string' || username.trim() === '') return '?'

  return username.trim()[0].toUpperCase()
}
