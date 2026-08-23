import {h, Component} from 'preact'

import i18n from '../i18n.js'
import onlineStore from '../modules/onlinestore.js'
import {getOgsOnlineController} from '../modules/ogsonlinecontroller.js'
import sabaki from '../modules/sabaki.js'
import {LoginForm} from './sidebars/OgsPanelAccount.js'
import {formatBoard} from './sidebars/ogsPanelData.js'
import {
  defaultMatchmakingOptions,
  timePresets,
} from './sidebars/ogsPanelData.js'
import {
  getOpponent,
  getOutcomeLabel,
  getGameOutcome,
  LazyMiniGoban,
} from './sidebars/OgsGameHistory.js'

const t = i18n.context('HomeDashboard')

// Home recent game row with local preview state for correct winner resolution
class HomeOgsRecentGameRow extends Component {
  constructor(props) {
    super(props)
    this.state = {preview: null}
    this.handlePreview = (preview) => this.setState({preview})
  }

  render({game, currentUserId}, {preview}) {
    let displayGame = {...game, winnerColor: preview?.winnerColor}
    let outcome = getGameOutcome(displayGame, currentUserId)
    let opponent = getOpponent(game, currentUserId)
    let opponentName = opponent?.username || game.name || `#${game.id}`
    let outcomeLabel =
      getOutcomeLabel(displayGame, currentUserId, t) ||
      game.result ||
      t('Result unknown')
    let boardLabel = formatBoard(game.board, t)

    return h(
      'li',
      {
        key: game.id,
        class: `home-ogs-recent-item ${outcome.status}`,
      },
      h(
        'div',
        {class: 'home-ogs-recent-goban'},
        h(LazyMiniGoban, {game, onPreview: this.handlePreview}),
      ),
      h(
        'div',
        {class: 'home-ogs-recent-info'},
        h(
          'div',
          {class: 'home-ogs-recent-opponent'},
          h('strong', {}, opponentName),
          opponent?.rank != null &&
            h('span', {class: 'home-ogs-recent-rank'}, ` · ${opponent.rank}`),
        ),
        h(
          'div',
          {
            class: `home-ogs-recent-outcome ${outcome.status}`,
          },
          outcomeLabel,
        ),
        h('div', {class: 'home-ogs-recent-meta'}, h('span', {}, boardLabel)),
      ),
    )
  }
}

function getMatchmakingSummary(options, t) {
  if (!options) return t('Not configured')

  let boardSizes = Array.isArray(options.boardSizes)
    ? options.boardSizes.filter((size) => [9, 13, 19].includes(size))
    : defaultMatchmakingOptions.boardSizes
  if (boardSizes.length === 0) boardSizes = [19]

  let speed = Array.isArray(options.speeds)
    ? options.speeds[0]
    : defaultMatchmakingOptions.speeds[0]
  let system = options.timeSystem || defaultMatchmakingOptions.timeSystem

  let preset = timePresets.find((p) => p.speed === speed && p.system === system)

  let sizeLabel = boardSizes.join(' / ')
  let speedLabel = preset ? t(preset.label) : t(speed)
  let systemLabel = system === 'fischer' ? t('Fischer') : t('Byo-yomi')

  return `${sizeLabel} · ${speedLabel} · ${systemLabel}`
}

export default class HomeOgsCard extends Component {
  constructor(props) {
    super(props)

    this.state = {
      ...onlineStore.getState(),
      lastConnectedUserId: null,
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

    this.handleStartAutomatch = async () => {
      await onlineStore.startAutomatch()
    }

    this.handleCancelAutomatch = async () => {
      await onlineStore.cancelAutomatch()
    }

    this.handleOpenActiveGame = async () => {
      let {activeGames} = this.state
      if (activeGames.length === 1) {
        let gameId = activeGames[0].gameId
        await getOgsOnlineController().openGame(gameId)
      } else {
        sabaki.openWorkspaceTab('ogs')
      }
    }

    this.handleViewHistory = () => {
      sabaki.openWorkspaceTab('ogs')
    }

    this.handleOnlineStoreState = (state) => {
      this.setState(state)
    }
  }

  componentDidMount() {
    this.unsubscribeOnlineStore = onlineStore.subscribe(
      this.handleOnlineStoreState,
    )
    this.refreshConnectedSectionsIfNeeded()
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.connected && !this.state.connected) {
      this.setState({lastConnectedUserId: null})
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
  }

  async refreshConnectedSectionsIfNeeded() {
    let state = onlineStore.getState()
    let userId = state.user?.id ?? null

    if (!state.connected || userId == null) {
      this.setState({lastConnectedUserId: null})
      return
    }

    if (this.state.lastConnectedUserId === userId) return
    this.setState({lastConnectedUserId: userId})

    await onlineStore.refreshGameHistory({page: 1, pageSize: 12})
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
      activeGames,
      playerProfile,
      playerProfileBusy,
      playerProfileError,
    },
  ) {
    let matchmakingOptions = matchmaking?.options || defaultMatchmakingOptions
    let authenticated = socket?.status === 'authenticated'
    let matchmakingStatus = matchmaking?.status
    let searching = matchmakingStatus === 'searching'
    let matched = matchmakingStatus === 'matched'
    let activeCount = Array.isArray(activeGames) ? activeGames.length : 0
    let recentGames = Array.isArray(gameHistory) ? gameHistory.slice(0, 2) : []
    let currentUserId = user?.id ?? null

    return h(
      'section',
      {class: 'home-ogs-card'},
      h(
        'header',
        {class: 'home-ogs-header'},
        h('h3', {}, t('OGS')),
        h(
          'span',
          {
            class: `home-ogs-status ${connected ? 'online' : 'offline'}`,
          },
          connected ? t('Online') : t('Offline'),
        ),
      ),

      !connected
        ? h(
            'div',
            {class: 'home-ogs-body home-ogs-disconnected'},
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
            {class: 'home-ogs-body'},
            h(
              'div',
              {class: 'home-ogs-profile'},
              user?.iconUrl != null &&
                h('img', {
                  class: 'home-ogs-avatar',
                  src: user.iconUrl,
                  alt: '',
                }),
              user?.iconUrl == null &&
                h(
                  'div',
                  {class: 'home-ogs-avatar home-ogs-avatar-fallback'},
                  'OGS',
                ),
              h(
                'div',
                {class: 'home-ogs-profile-info'},
                h('strong', {}, user?.username || username),
                h(
                  'div',
                  {class: 'home-ogs-profile-meta'},
                  (playerProfile?.rank ?? user?.rank) != null &&
                    h('span', {}, playerProfile?.rank ?? user?.rank),
                  (() => {
                    let rating = playerProfile?.rating
                    if (typeof rating === 'number' && Number.isFinite(rating)) {
                      return h(
                        'span',
                        {},
                        '·',
                        t('Rating'),
                        ' ',
                        Math.round(rating),
                      )
                    }
                    return null
                  })(),
                  playerProfile?.country != null &&
                    h('span', {}, '·', playerProfile.country.toUpperCase()),
                ),
              ),
            ),

            h(
              'div',
              {class: 'home-ogs-sections'},
              h(
                'section',
                {class: 'home-ogs-section home-ogs-quickmatch'},
                h('h4', {}, t('Quick match')),
                h(
                  'p',
                  {class: 'home-ogs-quickmatch-summary'},
                  getMatchmakingSummary(matchmakingOptions, t),
                ),
                searching
                  ? h(
                      'div',
                      {class: 'home-ogs-quickmatch-searching'},
                      h('span', {class: 'home-ogs-spinner'}),
                      h('span', {}, t('Finding opponent…')),
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'ui-button ui-button-ghost',
                          onClick: this.handleCancelAutomatch,
                          disabled: busy,
                        },
                        t('Cancel'),
                      ),
                    )
                  : matched
                    ? h(
                        'p',
                        {class: 'home-ogs-quickmatch-matched'},
                        t('Match found — opening game…'),
                      )
                    : h(
                        'button',
                        {
                          type: 'button',
                          class: 'ui-button ui-button-primary',
                          onClick: this.handleStartAutomatch,
                          disabled: busy || !authenticated,
                          title: !authenticated
                            ? t('OGS socket must be authenticated first.')
                            : t('Find an OGS opponent.'),
                        },
                        t('Find a game'),
                      ),
              ),

              h(
                'section',
                {class: 'home-ogs-section home-ogs-active'},
                h('h4', {}, t('Active games')),
                h(
                  'div',
                  {class: 'home-ogs-active-count'},
                  activeCount === 0
                    ? t('None')
                    : activeCount === 1
                      ? t('1 game')
                      : `${activeCount} ${t('games')}`,
                ),
                activeCount === 1
                  ? h(
                      'button',
                      {
                        type: 'button',
                        class: 'ui-button ui-button-primary',
                        onClick: this.handleOpenActiveGame,
                        disabled: busy,
                      },
                      t('Resume game'),
                    )
                  : activeCount > 1
                    ? h(
                        'button',
                        {
                          type: 'button',
                          class: 'ui-button ui-button-secondary',
                          onClick: this.handleViewHistory,
                          disabled: busy,
                        },
                        t('View games'),
                      )
                    : null,
              ),

              h(
                'section',
                {class: 'home-ogs-section home-ogs-recent'},
                h(
                  'div',
                  {class: 'home-ogs-recent-header'},
                  h('h4', {}, t('Recent games')),
                  recentGames.length > 0 &&
                    h(
                      'button',
                      {
                        type: 'button',
                        class: 'ui-button ui-button-ghost',
                        onClick: this.handleViewHistory,
                        disabled: busy,
                      },
                      t('View history'),
                    ),
                ),
                recentGames.length === 0
                  ? h(
                      'p',
                      {class: 'home-ogs-empty'},
                      playerProfileBusy ? t('Loading…') : t('No recent games.'),
                    )
                  : h(
                      'ul',
                      {class: 'home-ogs-recent-list'},
                      recentGames.map((game) =>
                        h(HomeOgsRecentGameRow, {
                          key: game.id,
                          game,
                          currentUserId,
                        }),
                      ),
                    ),
              ),
            ),
          ),
    )
  }
}
