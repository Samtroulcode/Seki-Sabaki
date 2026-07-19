export default class OgsBoardSessionController {
  constructor() {
    this.pendingMove = null
    this.submittingMove = false
    this.submissionId = 0
  }

  invalidateOperations() {
    this.pendingMove = null
    this.submittingMove = false
    this.submissionId++
    return this.submissionId
  }

  beginSubmission() {
    if (this.submittingMove || this.pendingMove != null) return null

    this.submittingMove = true
    this.submissionId++
    return this.submissionId
  }

  finishSubmission(submissionId) {
    if (this.submissionId !== submissionId) return false

    this.submittingMove = false
    return true
  }

  setPendingMove(move) {
    this.pendingMove = move
    return this.pendingMove
  }

  clearPendingMove(move = null) {
    if (move != null && !this.isPendingMove(move)) return false

    this.pendingMove = null
    return true
  }

  isPendingMove(move) {
    return (
      this.pendingMove != null &&
      move != null &&
      this.pendingMove.moveNumber === move.moveNumber &&
      this.pendingMove.move === move.move
    )
  }

  isCurrentSubmission(
    {submissionId = null, gameId = null, pendingMove},
    currentGameId,
  ) {
    return (
      (submissionId == null || this.submissionId === submissionId) &&
      (gameId == null || currentGameId === gameId) &&
      this.pendingMove === pendingMove
    )
  }
}
