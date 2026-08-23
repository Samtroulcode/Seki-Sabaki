import {showMessageBox} from '../../modules/dialog.js'
import {selectBestReview} from '../../ogs/review-sanitize.js'
import sabaki from '../../modules/sabaki.js'
import onlineStore from '../../modules/onlinestore.js'

export async function analyzeOgsGame(gameId, {t = (s) => s} = {}) {
  let result = await onlineStore.listAiReviews(gameId)
  let review = selectBestReview(result.reviews)

  if (!result.ok || review == null) {
    await showMessageBox(
      result.error?.message ||
        t('No OGS AI review is available for this game.'),
      'info',
    )
    return
  }

  let connection = await window.sabaki.ogsReviews.connect(gameId, review)
  if (!connection?.ok) {
    await showMessageBox(
      connection?.error?.message || t('Unable to connect to OGS AI review.'),
      'warning',
    )
    return
  }

  let sgf = await onlineStore.downloadGameSgf(gameId)
  if (sgf.ok) {
    await sabaki.openContentInNewBoardTab(sgf.sgf, 'sgf', {
      gotoEnd: true,
      representedFilename: null,
      ogsGameId: gameId,
    })
  } else {
    await window.sabaki.ogsReviews.disconnect(review.uuid)
  }
}

export async function analyzeSekiGame(gameId) {
  let result = await onlineStore.downloadGameSgf(gameId)
  if (result.stale || !result.ok) return

  await sabaki.startCurrentGameSgfAnalysis({sgfContent: result.sgf})
}
