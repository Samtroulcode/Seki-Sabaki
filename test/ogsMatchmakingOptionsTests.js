import assert from 'assert'

import {
  updateMultiMatchmakingOption,
  updateNestedMatchmakingOption,
  updateScalarMatchmakingOption,
} from '../src/modules/ogsmatchmakingoptions.js'

describe('OGS matchmaking options', () => {
  it('updates scalar options and parses rank diffs as numbers', () => {
    let options = {timeSystem: 'byoyomi', lowerRankDiff: 3}

    assert.deepStrictEqual(
      updateScalarMatchmakingOption(options, 'timeSystem', 'fischer'),
      {timeSystem: 'fischer', lowerRankDiff: 3},
    )
    assert.deepStrictEqual(
      updateScalarMatchmakingOption(options, 'lowerRankDiff', '2'),
      {timeSystem: 'byoyomi', lowerRankDiff: 2},
    )
    assert.strictEqual(options.lowerRankDiff, 3)
  })

  it('updates nested condition/value options without changing siblings', () => {
    let options = {
      rules: {condition: 'required', value: 'japanese'},
      handicap: {condition: 'preferred', value: 'enabled'},
    }

    assert.deepStrictEqual(
      updateNestedMatchmakingOption(options, 'rules.condition', 'preferred'),
      {
        rules: {condition: 'preferred', value: 'japanese'},
        handicap: {condition: 'preferred', value: 'enabled'},
      },
    )
  })

  it('updates checkbox options while preserving existing item types', () => {
    let options = {boardSizes: [19], speeds: ['rapid']}

    assert.deepStrictEqual(
      updateMultiMatchmakingOption(options, 'boardSizes', '9', true),
      {boardSizes: [19, 9], speeds: ['rapid']},
    )
    assert.deepStrictEqual(
      updateMultiMatchmakingOption(options, 'boardSizes', '19', false),
      {boardSizes: [], speeds: ['rapid']},
    )
    assert.deepStrictEqual(
      updateMultiMatchmakingOption(options, 'speeds', 'blitz', true),
      {boardSizes: [19], speeds: ['rapid', 'blitz']},
    )
    assert.deepStrictEqual(
      updateMultiMatchmakingOption(options, 'speeds', 'rapid', false),
      {boardSizes: [19], speeds: []},
    )
  })
})
