import assert from 'assert'

import {ratingToRank, rankNumberToRank} from '../src/ogs/ranks.js'

describe('OGS ranks', () => {
  it('converts ratings to rank labels', () => {
    assert.strictEqual(ratingToRank(null), null)
    assert.strictEqual(ratingToRank(Number.NaN), null)
    assert.strictEqual(ratingToRank(100), '30k')
    assert.strictEqual(ratingToRank(1500), '6k')
    assert.strictEqual(ratingToRank(6000), '9d')
  })

  it('converts OGS rank numbers to rank labels', () => {
    assert.strictEqual(rankNumberToRank(null), null)
    assert.strictEqual(rankNumberToRank(-1), null)
    assert.strictEqual(rankNumberToRank(39), null)
    assert.strictEqual(rankNumberToRank(0), '30k')
    assert.strictEqual(rankNumberToRank(27), '3k')
    assert.strictEqual(rankNumberToRank(30), '1d')
    assert.strictEqual(rankNumberToRank(38), '9d')
  })
})
