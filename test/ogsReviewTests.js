import assert from 'assert'
import GameTree from '@sabaki/immutable-gametree'

import {createOgsReviewApi} from '../src/ogs/review-api.js'
import {sanitizeReviewList} from '../src/ogs/review-sanitize.js'
import {getOgsReviewAnalysis} from '../src/modules/ogsreviewanalysis.js'
import {mergeOgsReviewIntoGameTree} from '../src/modules/ogsreviewconverter.js'
import {OgsAiReviewClient} from '../src/ogs/ai-review-client.js'

describe('OGS AI reviews', () => {
  it('lists sanitized reviews through the game endpoint', async () => {
    let requestedUrl = null
    let api = createOgsReviewApi({
      serverUrl: 'https://online-go.com/',
      fetch: async (url) => {
        requestedUrl = url
        return {
          ok: true,
          headers: {get: () => '300'},
          async text() {
            return JSON.stringify({
              results: [
                {
                  id: 4,
                  uuid: '01234567-89ab-cdef-0123-456789abcdef',
                  type: 'full',
                  engine: 'katago',
                  strength: 42,
                  visits: 1000,
                  auth: 'secret',
                },
                {id: 'invalid'},
              ],
            })
          },
        }
      },
    })

    let reviews = await api.listReviews(752)

    assert.strictEqual(
      requestedUrl,
      'https://online-go.com/api/v1/games/752/ai_reviews',
    )
    assert.deepStrictEqual(reviews, [
      {
        id: 4,
        uuid: '01234567-89ab-cdef-0123-456789abcdef',
        type: 'full',
        engine: 'katago',
        engineVersion: null,
        network: null,
        networkSize: null,
        strength: 42,
        playouts: null,
        visits: 1000,
        date: null,
        winRate: null,
        status: null,
      },
    ])
  })

  it('converts OGS review moves to the Sabaki overlay contract', () => {
    let tree = {
      root: {id: 'root'},
      getSequence: () => [{id: 'root'}, {id: 'move'}],
    }
    let analysis = getOgsReviewAnalysis(
      {
        reviews: {
          uuid: {
            moves: {
              1: {
                win_rate: 0.62,
                score: -1.5,
                branches: [
                  {
                    visits: 120,
                    win_rate: 0.7,
                    score: 2.25,
                    moves: [
                      {x: 3, y: 4},
                      {x: 5, y: 6},
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      tree,
      'move',
    )

    assert.strictEqual(analysis.sign, 1)
    assert.strictEqual(analysis.winrate, 62)
    assert.strictEqual(analysis.scoreLead, -1.5)
    assert.deepStrictEqual(analysis.variations[0], {
      vertex: [3, 4],
      visits: 120,
      winrate: 70,
      scoreLead: 2.25,
      moves: [
        [3, 4],
        [5, 6],
      ],
    })
  })

  it('merges OGS review values and branches into a game tree', () => {
    let tree = createReviewTestTree()

    let enriched = mergeOgsReviewIntoGameTree(tree, {
      moves: {
        1: {
          winRate: 0.62,
          score: 3.5,
          branches: [
            {
              winRate: 0.7,
              score: 4.2,
              visits: 120,
              moves: [
                {x: 2, y: 2},
                {x: 3, y: 3},
              ],
            },
          ],
        },
      },
    })

    let first = [...enriched.getSequence(enriched.root.id)][1]
    assert.deepStrictEqual(first.data.SBKV, ['62.00'])
    assert.deepStrictEqual(first.data.SBKS, ['3.50'])
    assert.strictEqual(first.children.length, 2)
    assert.deepStrictEqual(first.children[1].data.W, ['cc'])
    assert.deepStrictEqual(first.children[1].data.SBKV, ['70.00'])
    assert.deepStrictEqual(first.children[1].data.SBKS, ['4.20'])
  })

  it('rejects malformed review entries without exposing private fields', () => {
    let reviews = sanitizeReviewList({results: [{id: 1, auth: 'secret'}]})
    assert.deepStrictEqual(reviews[0].id, 1)
    assert.strictEqual('auth' in reviews[0], false)
  })

  it('authenticates the AI socket and receives review updates by UUID', async () => {
    let sent = []
    class FakeWebSocket {
      constructor() {
        setTimeout(() => this.onopen(), 0)
      }

      send(value) {
        let message = JSON.parse(value)
        sent.push(message)

        if (message[0] === 'authenticate') {
          setTimeout(
            () => this.onmessage({data: JSON.stringify([message[2], {}])}),
            0,
          )
        }
        if (message[0] === 'ai-review-connect') {
          setTimeout(
            () =>
              this.onmessage({
                data: JSON.stringify([
                  message[1].uuid,
                  {
                    'move-1': {
                      move_number: 1,
                      move: {x: 1, y: 1},
                      win_rate: 0.5,
                      branches: [],
                    },
                  },
                ]),
              }),
            0,
          )
        }
      }

      close() {}
    }

    let client = new OgsAiReviewClient({
      getJwtToken: () => 'jwt-token',
      webSocketImpl: FakeWebSocket,
    })
    let review = {
      id: 4,
      uuid: '01234567-89ab-cdef-0123-456789abcdef',
      type: 'full',
      engine: 'katago',
    }

    await client.connectReview({gameId: 752, review})

    assert.deepStrictEqual(sent[0][0], 'authenticate')
    assert.deepStrictEqual(sent[1], [
      'ai-review-connect',
      {uuid: review.uuid, game_id: 752, ai_review_id: 4},
    ])
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.strictEqual(
      client.getState().reviews[review.uuid].moves['1'].winRate,
      0.5,
    )
    client.dispose()
  })
})

function createReviewTestTree() {
  let tree = new GameTree({
    getId: (() => {
      let id = 0
      return () => String(id++)
    })(),
    merger: () => null,
  })

  return tree.mutate((draft) => {
    let first = draft.appendNode(draft.root.id, {B: ['aa']})
    draft.appendNode(first, {W: ['bb']})
  })
}
