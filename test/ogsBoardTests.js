import assert from 'assert'

import {buildOgsGameTree, parseOgsMove} from '../src/modules/ogsboard.js'

describe('OGS board projection', () => {
  it('converts OGS game state into a linear SGF game tree', () => {
    let tree = buildOgsGameTree(
      {
        gameId: 12345,
        gameName: 'Friendly game',
        board: {width: 19, height: 19},
        players: {
          black: {username: 'sente'},
          white: {username: 'gote'},
        },
        moves: [{move: 'aa'}, {move: 'bb'}, {move: '..'}],
      },
      {appName: 'Seki-Sabaki', version: 'test'},
    )

    assert.deepStrictEqual(tree.root.data, {
      GM: ['1'],
      FF: ['4'],
      CA: ['UTF-8'],
      AP: ['Seki-Sabaki:test'],
      SZ: ['19'],
      EV: ['Online-Go.com'],
      GN: ['Friendly game'],
      SO: ['https://online-go.com/game/12345'],
      PB: ['sente'],
      PW: ['gote'],
    })
    assert.deepStrictEqual(
      [...tree.getSequence(tree.root.id)].map((node) => node.data).slice(1),
      [{B: ['aa']}, {W: ['bb']}, {B: ['']}],
    )
  })

  it('filters invalid or out-of-bounds moves', () => {
    let tree = buildOgsGameTree({
      board: {width: 9, height: 9},
      moves: [{move: 'ii'}, {move: 'jj'}, {move: 'bad'}],
    })

    assert.deepStrictEqual(
      [...tree.getSequence(tree.root.id)].map((node) => node.data).slice(1),
      [{B: ['ii']}],
    )
  })

  it('projects handicap games with setup stones and white first', () => {
    let tree = buildOgsGameTree({
      board: {width: 19, height: 19},
      handicap: 2,
      moves: [{move: 'dd', moveNumber: 1}],
    })

    assert.strictEqual(tree.root.data.HA[0], '2')
    assert.strictEqual(tree.root.data.AB.length, 2)
    assert.deepStrictEqual(
      [...tree.getSequence(tree.root.id)].map((node) => node.data).slice(1),
      [{W: ['dd']}],
    )
  })

  it('parses OGS compact moves', () => {
    assert.deepStrictEqual(parseOgsMove('aa', 19, 19), [0, 0])
    assert.deepStrictEqual(parseOgsMove('..', 19, 19), [-1, -1])
    assert.strictEqual(parseOgsMove('jj', 9, 9), null)
  })
})
