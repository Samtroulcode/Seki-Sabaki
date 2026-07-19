import assert from 'assert'

import OgsBoardSessionController from '../src/modules/ogsboardsessioncontroller.js'

describe('OGS board session controller', () => {
  it('invalidates pending operations when a session changes', () => {
    let controller = new OgsBoardSessionController()
    let submissionId = controller.beginSubmission()
    controller.setPendingMove({gameId: 1, moveNumber: 1, move: 'aa'})

    assert.strictEqual(controller.submittingMove, true)
    assert.strictEqual(controller.pendingMove.move, 'aa')

    let nextSubmissionId = controller.invalidateOperations()

    assert.strictEqual(nextSubmissionId, submissionId + 1)
    assert.strictEqual(controller.submittingMove, false)
    assert.strictEqual(controller.pendingMove, null)
  })

  it('prevents multiple simultaneous submissions', () => {
    let controller = new OgsBoardSessionController()
    let submissionId = controller.beginSubmission()

    assert.strictEqual(typeof submissionId, 'number')
    assert.strictEqual(controller.beginSubmission(), null)

    assert.strictEqual(controller.finishSubmission(submissionId), true)
    assert.strictEqual(controller.submittingMove, false)
    assert.strictEqual(controller.beginSubmission(), submissionId + 1)
  })

  it('correlates pending moves and stale submissions', () => {
    let controller = new OgsBoardSessionController()
    let submissionId = controller.beginSubmission()
    let pendingMove = {gameId: 42, moveNumber: 3, move: 'cc'}
    controller.setPendingMove(pendingMove)

    assert.strictEqual(
      controller.isCurrentSubmission(
        {submissionId, gameId: 42, pendingMove},
        42,
      ),
      true,
    )
    assert.strictEqual(
      controller.isCurrentSubmission(
        {submissionId, gameId: 43, pendingMove},
        42,
      ),
      false,
    )
    assert.strictEqual(
      controller.isPendingMove({moveNumber: 3, move: 'cc'}),
      true,
    )
    assert.strictEqual(
      controller.clearPendingMove({moveNumber: 3, move: 'dd'}),
      false,
    )
    assert.strictEqual(
      controller.clearPendingMove({moveNumber: 3, move: 'cc'}),
      true,
    )
    assert.strictEqual(controller.pendingMove, null)
  })
})
