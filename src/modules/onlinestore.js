import i18n from '../i18n.js'
import {defaultMatchmakingOptions} from '../components/sidebars/ogsPanelData.js'

const t = i18n.context('OgsPanel')

export function createInitialOnlineState() {
  return {
    username: '',
    user: null,
    busy: false,
    error: null,
    connected: false,
    socket: null,
    network: null,
    matchmaking: {options: defaultMatchmakingOptions},
    onlineGame: null,
    activeGames: [],
  }
}

export class OnlineStore {
  constructor({ogs = () => window.sabaki.ogs} = {}) {
    this.ogs = ogs
    this.state = createInitialOnlineState()
    this.listeners = new Set()
  }

  getState() {
    return cloneOnlineState(this.state)
  }

  setState(change) {
    this.state = {...this.state, ...change}
    this.emitChange()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emitChange() {
    for (let listener of this.listeners) listener(this.getState())
  }

  setUsername(username) {
    this.setState({username})
  }

  async refresh() {
    let state = null

    try {
      state = await this.ogs().getState()
    } catch (err) {
      return null
    }

    if (state?.user != null) this.applyPublicState(state)

    return state
  }

  async login(username, password) {
    this.setState({busy: true, error: null})

    let result

    try {
      result = await this.ogs().login(username, password)
    } catch (err) {
      result = {ok: false, error: {message: t('Unable to connect to OGS.')}}
    }

    if (result.ok) {
      this.applyPublicState(result.state, {
        username,
        user: result.user,
        connected: true,
      })
    } else {
      this.setState({error: result.error?.message || t('OGS login failed.')})
    }

    this.setState({busy: false})
    return result
  }

  async logout() {
    await this.ogs().logout()
    this.setState({
      user: null,
      connected: false,
      error: null,
      socket: null,
      network: null,
      onlineGame: null,
      activeGames: [],
    })
  }

  async connectGame(gameId, {manageBusy = true} = {}) {
    if (manageBusy) this.setState({busy: true, error: null})

    let result

    try {
      result = await this.ogs().connectGame(gameId)

      if (result.ok) {
        this.applyCommandState(result.state)
      } else {
        this.setState({
          error: result.error?.message || t('Unable to connect to game.'),
          onlineGame: result.state?.onlineGame || this.state.onlineGame,
          activeGames: result.state?.activeGames || this.state.activeGames,
        })
      }
    } catch (err) {
      result = {ok: false, error: {message: t('Unable to connect to game.')}}
      this.setState({error: result.error.message})
    }

    if (manageBusy) this.setState({busy: false})
    return result
  }

  async disconnectGame(gameId) {
    let result = await this.ogs().disconnectGame(gameId)

    if (result.ok) {
      this.setState({onlineGame: result.state.onlineGame})
    }

    return result
  }

  async setMatchmakingOptions(options) {
    this.setState({matchmaking: {...this.state.matchmaking, options}})

    try {
      let state = await this.ogs().setMatchmakingOptions(options)
      this.setState({matchmaking: state.matchmaking, socket: state.socket})
      return state
    } catch (err) {
      return null
    }
  }

  async startAutomatch() {
    return await this.updateAutomatch(
      () => this.ogs().startAutomatch(),
      t('Unable to start automatch.'),
    )
  }

  async cancelAutomatch() {
    return await this.updateAutomatch(
      () => this.ogs().cancelAutomatch(),
      t('Unable to cancel automatch.'),
    )
  }

  async acknowledgeAutomatchOpen(gameId) {
    return await this.ogs().acknowledgeAutomatchOpen(gameId)
  }

  async updateAutomatch(action, fallbackMessage) {
    this.setState({busy: true, error: null})

    let result

    try {
      result = await action()

      if (result.ok) {
        this.setState({
          matchmaking: result.state.matchmaking,
          socket: result.state.socket,
        })
      } else {
        this.setState({
          error: result.error?.message || fallbackMessage,
          matchmaking: result.state?.matchmaking || this.state.matchmaking,
          socket: result.state?.socket || this.state.socket,
        })
      }
    } catch (err) {
      result = {ok: false, error: {message: fallbackMessage}}
      this.setState({error: fallbackMessage})
    }

    this.setState({busy: false})
    return result
  }

  applyPublicState(state, extra = {}) {
    this.setState({
      username: state?.user?.username || this.state.username,
      user: state?.user || null,
      socket: state?.socket || null,
      network: state?.network || null,
      matchmaking: state?.matchmaking || this.state.matchmaking,
      onlineGame: state?.onlineGame || null,
      activeGames: state?.activeGames || [],
      connected: true,
      ...extra,
    })
  }

  applyCommandState(state) {
    this.setState({
      socket: state.socket,
      network: state.network || this.state.network,
      matchmaking: state.matchmaking,
      onlineGame: state.onlineGame,
      activeGames: state.activeGames || this.state.activeGames,
    })
  }
}

function cloneOnlineState(state) {
  return {
    ...state,
    user: cloneObject(state.user),
    socket: cloneObject(state.socket),
    network: cloneObject(state.network),
    matchmaking: cloneMatchmaking(state.matchmaking),
    onlineGame: cloneObject(state.onlineGame),
    activeGames: Array.isArray(state.activeGames)
      ? state.activeGames.map(cloneObject)
      : [],
  }
}

function cloneMatchmaking(matchmaking) {
  return cloneObject(matchmaking)
}

function cloneObject(value) {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneObject)

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneObject(child)]),
  )
}

export default new OnlineStore()
