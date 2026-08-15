const {sanitizeReview, sanitizeReviewUpdate} = require('./review-sanitize.js')

const DEFAULT_AI_SERVER_URL = 'wss://ai.online-go.com'
const MAX_REVIEW_MOVES = 5000
const MAX_REVIEW_VARIATIONS = 5000

class OgsAiReviewClient {
  constructor({
    getJwtToken,
    serverUrl = 'https://online-go.com',
    webSocketImpl = globalThis.WebSocket,
    onStateChange,
  }) {
    this.getJwtToken = getJwtToken
    this.aiServerUrl = getAiServerUrl(serverUrl)
    this.WebSocketImpl = webSocketImpl
    this.onStateChange = onStateChange
    this.socket = null
    this.requestId = 0
    this.pending = new Map()
    this.state = {status: 'disconnected', reviews: {}}
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state))
  }

  emit() {
    this.onStateChange?.(this.getState())
  }

  async connectReview(input) {
    let review = sanitizeReview(input.review)
    let gameId = Number(input.gameId)
    if (
      review == null ||
      review.uuid == null ||
      !Number.isInteger(gameId) ||
      gameId <= 0
    ) {
      throw new Error('Invalid OGS AI review.')
    }

    await this.connect()
    for (let uuid of Object.keys(this.state.reviews)) {
      if (this.socket != null) this.send('ai-review-disconnect', {uuid})
    }
    this.state.reviews = {}
    this.state.reviews[review.uuid] = {
      ...review,
      gameId,
      status: 'connected',
      moves: {},
      variations: {},
      error: null,
    }
    this.send('ai-review-connect', {
      uuid: review.uuid,
      game_id: gameId,
      ai_review_id: review.id,
    })
    this.emit()
    return this.getState()
  }

  disconnectReview(uuid) {
    if (!/^[0-9a-f-]{16,80}$/i.test(uuid) || !this.state.reviews[uuid]) {
      return this.getState()
    }
    if (this.socket != null) this.send('ai-review-disconnect', {uuid})
    delete this.state.reviews[uuid]
    this.emit()
    return this.getState()
  }

  connect() {
    if (this.socket != null && this.state.status === 'connected') {
      return Promise.resolve()
    }

    let jwt = this.getJwtToken?.()
    if (typeof jwt !== 'string' || jwt === '') {
      throw new Error('OGS session is not authenticated.')
    }
    if (typeof this.WebSocketImpl !== 'function') {
      throw new Error('WebSocket is not available.')
    }

    this.state.status = 'connecting'
    this.emit()

    this.rejectPending(new Error('Replacing OGS AI WebSocket connection.'))
    this.socket?.close()
    this.socket = null

    return new Promise((resolve, reject) => {
      let socket = new this.WebSocketImpl(this.aiServerUrl)
      let settled = false
      this.socket = socket

      socket.onopen = () => {
        let id = ++this.requestId
        this.authRequestId = id
        this.pending.set(id, {resolve, reject})
        this.sendRaw([
          'authenticate',
          {jwt, client: 'Seki-Sabaki', client_version: '0.1'},
          id,
        ])
      }
      socket.onmessage = (event) => this.handleMessage(event?.data)
      socket.onerror = () => {
        if (this.socket !== socket) return
        this.rejectPending(new Error('OGS AI WebSocket connection failed.'))
        this.socket = null
        this.state = {status: 'error', reviews: {}}
        this.emit()
        if (!settled) {
          settled = true
          reject(new Error('OGS AI WebSocket connection failed.'))
        }
      }
      socket.onclose = () => {
        if (this.socket !== socket) return
        this.rejectPending(new Error('OGS AI WebSocket closed.'))
        this.socket = null
        this.state = {status: 'disconnected', reviews: {}}
        this.emit()
        if (!settled) {
          settled = true
          reject(new Error('OGS AI WebSocket closed before authentication.'))
        }
      }
    }).then(() => {
      this.state.status = 'connected'
      this.emit()
    })
  }

  handleMessage(raw) {
    if (typeof raw === 'string' && raw.length > 1024 * 1024) return
    let data
    try {
      data = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (err) {
      return
    }
    if (!Array.isArray(data)) return

    if (Number.isInteger(data[0])) {
      let pending = this.pending.get(data[0])
      if (pending == null) return
      this.pending.delete(data[0])
      if (data[2] != null)
        pending.reject(new Error('OGS AI authentication failed.'))
      else pending.resolve(data[1])
      if (data[0] === this.authRequestId && data[2] != null) {
        this.state = {status: 'error', reviews: {}}
        this.socket?.close()
      }
      return
    }

    let uuid = data[0]
    let payload = data[1]
    let review = this.state.reviews[uuid]
    if (
      typeof uuid !== 'string' ||
      !/^[0-9a-f-]{16,80}$/i.test(uuid) ||
      !Object.prototype.hasOwnProperty.call(this.state.reviews, uuid) ||
      review == null ||
      payload == null
    ) {
      return
    }

    let update = sanitizeReviewUpdate(payload)
    if (update == null) return

    for (let [key, value] of Object.entries(update)) {
      if (key === 'metadata') Object.assign(review, value || {})
      else if (key === 'error') review.error = value
      else if (
        /^move-\d+$/.test(key) &&
        (review.moves[key.slice(5)] != null ||
          Object.keys(review.moves).length < MAX_REVIEW_MOVES)
      ) {
        review.moves[key.slice(5)] = value
      } else if (
        key.startsWith('variation-') &&
        (review.variations[key.slice(10)] != null ||
          Object.keys(review.variations).length < MAX_REVIEW_VARIATIONS)
      ) {
        review.variations[key.slice(10)] = value
      }
    }
    this.emit()
  }

  send(event, payload) {
    this.sendRaw([event, payload])
  }

  sendRaw(payload) {
    if (this.socket == null)
      throw new Error('OGS AI WebSocket is disconnected.')
    this.socket.send(JSON.stringify(payload))
  }

  rejectPending(error) {
    for (let pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  dispose() {
    this.rejectPending(new Error('Disposed.'))
    this.socket?.close()
    this.socket = null
    this.state = {status: 'disconnected', reviews: {}}
    this.emit()
  }
}

function getAiServerUrl(serverUrl) {
  let normalized = String(serverUrl).replace(/\/$/, '')
  if (
    normalized === 'https://online-go.com' ||
    normalized === 'https://www.online-go.com'
  ) {
    return DEFAULT_AI_SERVER_URL
  }
  throw new Error('OGS AI reviews are unavailable for this server.')
}

module.exports = {OgsAiReviewClient}
