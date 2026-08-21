import influence from '@sabaki/influence'

import gametree from './gametree.js'
import utils from './utils.js'
import {getOgsReviewAnalysis} from './ogsreviewanalysis.js'

export function deriveBoardRenderState(state, inferredState) {
  let tree = inferredState.gameTree
  let scoreBoard, areaMap

  if (['scoring', 'estimator'].includes(state.mode)) {
    scoreBoard = gametree.getBoard(tree, state.treePosition).clone()

    for (let vertex of state.deadStones) {
      let sign = scoreBoard.get(vertex)
      if (sign === 0) continue

      scoreBoard.setCaptures(-sign, (x) => x + 1)
      scoreBoard.set(vertex, 0)
    }

    areaMap =
      state.mode === 'estimator'
        ? influence.map(scoreBoard.signMap, {discrete: true})
        : influence.areaMap(scoreBoard.signMap)

    for (let key in state.estimateOverrides) {
      let [x, y] = key.split(',').map(Number)
      areaMap[y][x] = utils.cycleAreaValue(
        areaMap[y][x],
        state.estimateOverrides[key],
      )
    }
  }

  let activeReview = Object.values(state.ogsReviewState?.reviews || {})[0]
  let rootSource = String(gametree.getRootProperty(tree, 'SO', '') || '')
  let reviewMatchesBoard =
    activeReview != null &&
    (state.onlineGameId === activeReview.gameId ||
      new RegExp(`/game/${activeReview.gameId}(?:/|$)`).test(rootSource))
  let ogsAnalysis = getOgsReviewAnalysis(
    reviewMatchesBoard ? state.ogsReviewState : null,
    tree,
    state.treePosition,
  )
  let hasOgsReview = reviewMatchesBoard
  return {
    ...state,
    ...inferredState,
    scoreBoard,
    areaMap,
    analysis: hasOgsReview ? ogsAnalysis : state.analysis,
    analysisTreePosition: hasOgsReview
      ? ogsAnalysis
        ? state.treePosition
        : null
      : state.analysisTreePosition,
    showAnalysis: hasOgsReview ? ogsAnalysis != null : state.showAnalysis,
  }
}
