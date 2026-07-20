import assert from 'assert'

import {parseAnalyzeSgfProgress} from '../src/modules/sgfanalysisprogress.js'

describe('SGF analysis progress parser', () => {
  it('parses a standard progress line', () => {
    assert.deepStrictEqual(
      parseAnalyzeSgfProgress('63% (132/208, 4200 visits)'),
      {
        percent: 63,
        currentMove: 132,
        totalMoves: 208,
        visits: 4200,
      },
    )
  })

  it('parses visits with k and m suffixes', () => {
    assert.deepStrictEqual(
      parseAnalyzeSgfProgress('63% (132/208, 4.2k visits)'),
      {
        percent: 63,
        currentMove: 132,
        totalMoves: 208,
        visits: 4200,
      },
    )
    assert.deepStrictEqual(
      parseAnalyzeSgfProgress('100% (208/208, 1.5M visits)'),
      {
        percent: 100,
        currentMove: 208,
        totalMoves: 208,
        visits: 1500000,
      },
    )
  })

  it('ignores non-progress lines', () => {
    assert.strictEqual(parseAnalyzeSgfProgress('loading model'), null)
    assert.strictEqual(parseAnalyzeSgfProgress('info move Q16 visits 10'), null)
    assert.strictEqual(parseAnalyzeSgfProgress(null), null)
  })

  it('rejects invalid ranges', () => {
    assert.strictEqual(parseAnalyzeSgfProgress('101% (1/2, 10 visits)'), null)
    assert.strictEqual(parseAnalyzeSgfProgress('50% (3/2, 10 visits)'), null)
  })
})
