import assert from 'assert'

import {
  boardTabStateKeys,
  createBoardTab,
  createBoardTabSnapshot,
  getBoardTabProjection,
  isBoardTabDirty,
  updateBoardTab,
} from '../src/modules/boardtabs.js'
import {createLocalDocumentBoardAttachment} from '../src/modules/boardattachment.js'

function fakeTree(id, hash = id) {
  return {root: {id}, getHash: () => hash}
}

describe('board tabs', () => {
  it('creates local board tabs from game trees', () => {
    let tree = fakeTree('root')
    let tab = createBoardTab([tree], {representedFilename: '/tmp/game.sgf'})

    assert.strictEqual(typeof tab.id, 'string')
    assert.strictEqual(tab.representedFilename, '/tmp/game.sgf')
    assert.strictEqual(tab.gameIndex, 0)
    assert.deepStrictEqual(tab.gameTrees, [tree])
    assert.deepStrictEqual(tab.gameCurrents, [{}])
    assert.strictEqual(tab.treePosition, 'root')
    assert.deepStrictEqual(
      tab.boardAttachment,
      createLocalDocumentBoardAttachment(),
    )
    assert.strictEqual(tab.onlineGameId, null)
    assert.deepStrictEqual(tab.attachedEngineSyncers, [])
    assert.strictEqual(tab.analyzingEngineSyncerId, null)
    assert.strictEqual(tab.blackEngineSyncerId, null)
    assert.strictEqual(tab.whiteEngineSyncerId, null)
    assert.strictEqual(tab.engineGameOngoing, null)
    assert.strictEqual(tab.analysisTreePosition, null)
    assert.strictEqual(tab.analysis, null)
  })

  it('snapshots and projects board-owned state', () => {
    let state = {
      activeBoardTabId: 'tab-1',
      representedFilename: null,
      gameIndex: 0,
      gameTrees: [fakeTree('root')],
      gameCurrents: [{}],
      treePosition: 'root',
      boardAttachment: createLocalDocumentBoardAttachment(),
      onlineGameId: null,
      boardTransformation: '',
      attachedEngineSyncers: [],
      analyzingEngineSyncerId: null,
      blackEngineSyncerId: null,
      whiteEngineSyncerId: null,
      engineGameOngoing: null,
      analysisTreePosition: null,
      analysis: null,
    }
    let snapshot = createBoardTabSnapshot({
      state,
      history: [{gameIndex: 0}],
      historyPointer: 0,
      treeHash: 'tree-hash',
      fileHash: null,
    })

    assert.strictEqual(snapshot.id, 'tab-1')
    assert.strictEqual(snapshot.treeHash, 'tree-hash')
    assert.deepStrictEqual(
      Object.keys(getBoardTabProjection(snapshot)),
      boardTabStateKeys,
    )
  })

  it('updates and detects dirty board tabs', () => {
    let cleanTab = createBoardTab([fakeTree('root', 'clean')])
    cleanTab.treeHash = 'clean'
    let dirtyTab = {...cleanTab, gameTrees: [fakeTree('root', 'dirty')]}

    assert.strictEqual(isBoardTabDirty(cleanTab), false)
    assert.strictEqual(isBoardTabDirty(dirtyTab), true)
    assert.deepStrictEqual(updateBoardTab([cleanTab], cleanTab.id, dirtyTab), [
      dirtyTab,
    ])
  })
})
