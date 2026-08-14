import {v4 as uuid} from 'uuid'

import {
  createBoardAttachmentState,
  createLocalDocumentBoardAttachment,
} from './boardattachment.js'

export const boardTabStateKeys = [
  'representedFilename',
  'gameIndex',
  'gameTrees',
  'gameCurrents',
  'treePosition',
  'boardAttachment',
  'onlineGameId',
  'boardTransformation',
  'attachedEngineSyncers',
  'analyzingEngineSyncerId',
  'blackEngineSyncerId',
  'whiteEngineSyncerId',
  'engineGameOngoing',
  'analysisTreePosition',
  'analysis',
]

export function createBoardTabSnapshot({
  state,
  history,
  historyPointer,
  treeHash,
  fileHash,
  id,
}) {
  let snapshot = {
    id: id || state.activeBoardTabId || uuid(),
    history: history || [],
    historyPointer: historyPointer || 0,
    treeHash,
    fileHash,
  }

  for (let key of boardTabStateKeys) snapshot[key] = state[key]

  return snapshot
}

export function createBoardTab(
  gameTrees,
  {representedFilename = null, boardAttachment = null} = {},
) {
  let attachmentState = createBoardAttachmentState(
    boardAttachment ?? createLocalDocumentBoardAttachment(),
  )
  let [firstTree] = gameTrees

  return {
    id: uuid(),
    representedFilename,
    gameIndex: 0,
    gameTrees,
    gameCurrents: gameTrees.map((_) => ({})),
    treePosition: firstTree.root.id,
    boardTransformation: '',
    attachedEngineSyncers: [],
    analyzingEngineSyncerId: null,
    blackEngineSyncerId: null,
    whiteEngineSyncerId: null,
    engineGameOngoing: null,
    analysisTreePosition: null,
    analysis: null,
    ...attachmentState,
    history: [],
    historyPointer: 0,
    treeHash: null,
    fileHash: null,
  }
}

export function getBoardTabProjection(tab) {
  let projection = {}
  for (let key of boardTabStateKeys) projection[key] = tab[key]
  return projection
}

export function updateBoardTab(tabs, id, data) {
  let index = tabs.findIndex((tab) => tab.id === id)

  if (index < 0) return [...tabs, data]
  return tabs.map((tab, i) => (i === index ? {...tab, ...data} : tab))
}

export function isBoardTabDirty(tab) {
  if (tab == null) return false
  return tab.gameTrees.map((tree) => tree.getHash()).join('-') !== tab.treeHash
}
