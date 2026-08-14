import assert from 'assert'

import {
  createOnlineGameTab,
  createOnlineGameTabSnapshot,
  getOnlineGameTabProjection,
  onlineGameTabStateKeys,
  updateOnlineGameTab,
} from '../src/modules/onlinegametabs.js'
import {createOgsBoardAttachment} from '../src/modules/boardattachment.js'

function fakeTree(id) {
  return {root: {id}}
}

describe('online game tabs', () => {
  it('creates dedicated OGS tabs from game trees', () => {
    let tree = fakeTree('root')
    let tab = createOnlineGameTab({gameId: 42, gameName: 'Fixture'}, [tree])

    assert.strictEqual(typeof tab.id, 'string')
    assert.strictEqual(tab.title, 'Fixture')
    assert.strictEqual(tab.gameIndex, 0)
    assert.deepStrictEqual(tab.gameTrees, [tree])
    assert.deepStrictEqual(tab.gameCurrents, [{}])
    assert.strictEqual(tab.treePosition, 'root')
    assert.deepStrictEqual(tab.boardAttachment, createOgsBoardAttachment(42))
    assert.strictEqual(tab.onlineGameId, 42)
    assert.strictEqual(tab.mode, 'play')
    assert.deepStrictEqual(tab.deadStones, [])
    assert.deepStrictEqual(tab.estimateOverrides, {})
    assert.strictEqual('attachedEngineSyncers' in tab, false)
    assert.strictEqual('analysis' in tab, false)
  })

  it('snapshots and projects only online-game-owned state', () => {
    let state = {
      activeOnlineGameTabId: 'tab-1',
      gameIndex: 0,
      gameTrees: [fakeTree('root')],
      gameCurrents: [{}],
      treePosition: 'root',
      boardAttachment: createOgsBoardAttachment(42),
      onlineGameId: 42,
      boardTransformation: '',
      mode: 'scoring',
      deadStones: [[0, 0]],
      estimateOverrides: {'0,0': 1},
      attachedEngineSyncers: ['not-owned'],
      analysis: {winrate: 50},
    }
    let snapshot = createOnlineGameTabSnapshot({
      state,
      history: [{gameIndex: 0}],
      historyPointer: 0,
    })

    assert.strictEqual(snapshot.id, 'tab-1')
    assert.strictEqual(snapshot.onlineGameId, 42)
    assert.strictEqual(snapshot.attachedEngineSyncers, undefined)
    assert.strictEqual(snapshot.analysis, undefined)
    assert.deepStrictEqual(
      Object.keys(getOnlineGameTabProjection(snapshot)),
      onlineGameTabStateKeys,
    )
  })

  it('updates existing online game tabs', () => {
    let tab = createOnlineGameTab({gameId: 42}, [fakeTree('root')])
    let updated = {...tab, title: 'Updated'}

    assert.deepStrictEqual(updateOnlineGameTab([tab], tab.id, updated), [
      updated,
    ])
  })
})
