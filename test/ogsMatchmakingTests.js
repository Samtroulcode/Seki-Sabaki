import assert from 'assert'

import {
  buildAutomatchPayload,
  sanitizeMatchmakingOptions,
} from '../src/ogs/matchmaking.js'

describe('OGS matchmaking helpers', () => {
  it('sanitizes automatch options', () => {
    assert.deepStrictEqual(
      sanitizeMatchmakingOptions({
        boardSizes: [9, 19, 99, 9],
        speeds: ['blitz', 'bad'],
        timeSystem: 'fischer',
        lowerRankDiff: 20,
        upperRankDiff: 2,
        rules: {condition: 'preferred', value: 'aga'},
        handicap: {condition: 'required', value: 'disabled'},
      }),
      {
        boardSizes: [9, 19],
        speeds: ['blitz'],
        timeSystem: 'fischer',
        lowerRankDiff: 9,
        upperRankDiff: 2,
        rules: {condition: 'preferred', value: 'aga'},
        handicap: {condition: 'required', value: 'disabled'},
      },
    )
  })

  it('builds deterministic automatch payloads when uuid is provided', () => {
    let payload = buildAutomatchPayload(
      {
        boardSizes: [9, 13],
        speeds: ['blitz', 'rapid'],
        timeSystem: 'fischer',
        lowerRankDiff: 1,
        upperRankDiff: 2,
        rules: {condition: 'required', value: 'chinese'},
        handicap: {condition: 'preferred', value: 'enabled'},
      },
      {uuid: 'fixed-search'},
    )

    assert.strictEqual(payload.uuid, 'fixed-search')
    assert.strictEqual(typeof payload.timestamp, 'number')
    assert.deepStrictEqual(payload.size_speed_options, [
      {size: '9x9', speed: 'blitz', system: 'fischer'},
      {size: '9x9', speed: 'rapid', system: 'fischer'},
      {size: '13x13', speed: 'blitz', system: 'fischer'},
      {size: '13x13', speed: 'rapid', system: 'fischer'},
    ])
    assert.strictEqual(payload.lower_rank_diff, 1)
    assert.strictEqual(payload.upper_rank_diff, 2)
    assert.deepStrictEqual(payload.rules, {
      condition: 'required',
      value: 'chinese',
    })
    assert.deepStrictEqual(payload.handicap, {
      condition: 'preferred',
      value: 'enabled',
    })
  })
})
