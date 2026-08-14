import {v4 as uuid} from 'uuid'

import {
  createBoardAttachmentState,
  createOgsBoardAttachment,
} from './boardattachment.js'

export const onlineGameTabStateKeys = [
  'gameIndex',
  'gameTrees',
  'gameCurrents',
  'treePosition',
  'boardAttachment',
  'onlineGameId',
  'boardTransformation',
  'mode',
  'deadStones',
  'estimateOverrides',
]

export function createOnlineGameTabSnapshot({
  state,
  history,
  historyPointer,
  id,
}) {
  let snapshot = {
    id: id || state.activeOnlineGameTabId || uuid(),
    history: history || [],
    historyPointer: historyPointer || 0,
  }

  for (let key of onlineGameTabStateKeys) snapshot[key] = state[key]

  return snapshot
}

export function createOnlineGameTab(onlineGame, gameTrees) {
  let [firstTree] = gameTrees
  let attachmentState = createBoardAttachmentState(
    createOgsBoardAttachment(onlineGame?.gameId),
  )

  return {
    id: uuid(),
    title: onlineGame?.gameName || null,
    gameIndex: 0,
    gameTrees,
    gameCurrents: gameTrees.map((_) => ({})),
    treePosition: firstTree.root.id,
    boardTransformation: '',
    mode: 'play',
    deadStones: [],
    estimateOverrides: {},
    ...attachmentState,
    history: [],
    historyPointer: 0,
  }
}

export function getOnlineGameTabProjection(tab) {
  let projection = {}
  for (let key of onlineGameTabStateKeys) projection[key] = tab[key]
  return projection
}

export function updateOnlineGameTab(tabs, id, data) {
  let index = tabs.findIndex((tab) => tab.id === id)

  if (index < 0) return [...tabs, data]
  return tabs.map((tab, i) => (i === index ? {...tab, ...data} : tab))
}
