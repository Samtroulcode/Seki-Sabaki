import assert from 'assert'

import {
  boardSizes,
  conditions,
  createOgsPanelLabels,
  defaultMatchmakingOptions,
  formatBoard,
  formatPlayers,
  getSocketLabel,
  handicapValues,
  rules,
  speeds,
  timeSystems,
} from '../src/components/sidebars/ogsPanelData.js'

describe('OGS panel data', () => {
  let t = (value) => `t:${value}`

  it('keeps matchmaking option lists stable', () => {
    assert.deepStrictEqual(boardSizes, [9, 13, 19])
    assert.deepStrictEqual(speeds, ['blitz', 'rapid', 'live', 'correspondence'])
    assert.deepStrictEqual(timeSystems, ['byoyomi', 'fischer'])
    assert.deepStrictEqual(conditions, [
      'required',
      'preferred',
      'no-preference',
    ])
    assert.deepStrictEqual(rules, [
      'japanese',
      'chinese',
      'aga',
      'korean',
      'ing',
      'nz',
    ])
    assert.deepStrictEqual(handicapValues, ['enabled', 'disabled'])
  })

  it('keeps default matchmaking options stable', () => {
    assert.deepStrictEqual(defaultMatchmakingOptions, {
      boardSizes: [19],
      speeds: ['rapid'],
      timeSystem: 'byoyomi',
      lowerRankDiff: 3,
      upperRankDiff: 3,
      rules: {condition: 'required', value: 'japanese'},
      handicap: {condition: 'preferred', value: 'enabled'},
    })
  })

  it('creates translated UI labels', () => {
    assert.deepStrictEqual(createOgsPanelLabels(t), {
      conditions: {
        required: 't:Required',
        preferred: 't:Preferred',
        'no-preference': 't:No preference',
      },
      speeds: {
        blitz: 't:Blitz',
        rapid: 't:Rapid',
        live: 't:Live',
        correspondence: 't:Correspondence',
      },
      timeSystems: {
        byoyomi: 't:Byo-yomi',
        fischer: 't:Fischer',
      },
      rules: {
        japanese: 't:Japanese',
        chinese: 't:Chinese',
        aga: 't:AGA',
        korean: 't:Korean',
        ing: 't:Ing',
        nz: 't:New Zealand',
      },
      handicap: {
        enabled: 't:Enabled',
        disabled: 't:Disabled',
      },
    })
  })

  it('formats board and player summaries', () => {
    assert.strictEqual(formatBoard({width: 19, height: 19}, t), '19x19')
    assert.strictEqual(formatBoard(null, t), 't:Unknown')
    assert.strictEqual(
      formatPlayers({username: 'Black'}, {username: 'White'}, t),
      'Black vs White',
    )
    assert.strictEqual(formatPlayers(null, null, t), 't:Black vs t:White')
  })

  it('formats socket status labels', () => {
    assert.strictEqual(
      getSocketLabel({status: 'authentication-sent'}, t),
      't:Authentication sent',
    )
    assert.strictEqual(
      getSocketLabel({status: 'authenticated'}, t),
      't:Authenticated',
    )
    assert.strictEqual(getSocketLabel({status: 'connected'}, t), 't:Connected')
    assert.strictEqual(
      getSocketLabel({status: 'connecting'}, t),
      't:Connecting',
    )
    assert.strictEqual(
      getSocketLabel({status: 'error', error: 'boom'}, t),
      'boom',
    )
    assert.strictEqual(
      getSocketLabel({status: 'error'}, t),
      't:Connection error',
    )
    assert.strictEqual(getSocketLabel(null, t), 't:Disconnected')
  })
})
