const {sanitizeGameId} = require('./sanitize.js')
const {sanitizeReviewList} = require('./review-sanitize.js')

const maxReviewResults = 20
const maxReviewResponseBytes = 512 * 1024

function createOgsReviewApi({serverUrl, fetch}) {
  return {
    async listReviews(gameId) {
      let id = sanitizeGameId(gameId)
      let url = `${serverUrl.replace(/\/$/, '')}/api/v1/games/${id}/ai_reviews`
      let response = await fetch(url, {
        headers: {'User-Agent': 'Seki-Sabaki/0.1', Accept: 'application/json'},
        redirect: 'error',
      })

      if (!response.ok) {
        throw new Error(`OGS AI reviews request failed (${response.status}).`)
      }

      let contentLength = Number(response.headers?.get?.('content-length'))
      if (
        Number.isFinite(contentLength) &&
        contentLength > maxReviewResponseBytes
      ) {
        throw new Error('OGS AI reviews response is too large.')
      }

      let body = await readLimitedBody(response)
      if (Buffer.byteLength(body, 'utf8') > maxReviewResponseBytes) {
        throw new Error('OGS AI reviews response is too large.')
      }

      return sanitizeReviewList(JSON.parse(body), maxReviewResults)
    },
  }
}

async function readLimitedBody(response) {
  if (response.body?.getReader == null) {
    let contentLength = Number(response.headers?.get?.('content-length'))
    if (!Number.isFinite(contentLength)) {
      throw new Error('OGS AI reviews response size is unknown.')
    }
    return await response.text()
  }

  let reader = response.body.getReader()
  let chunks = []
  let total = 0

  while (true) {
    let {done, value} = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxReviewResponseBytes) {
      await reader.cancel()
      throw new Error('OGS AI reviews response is too large.')
    }
    chunks.push(value)
  }

  let bytes = new Uint8Array(total)
  let offset = 0
  for (let chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(bytes)
}

module.exports = {createOgsReviewApi}
