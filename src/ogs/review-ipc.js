function setupOgsReviewIpcHandlers(
  ipcMain,
  {reviewClient, sendStateChange, serializeError, isTrustedSender},
) {
  let assertTrusted = (evt) => {
    if (
      typeof isTrustedSender !== 'function' ||
      !isTrustedSender(evt?.sender, evt?.senderFrame)
    ) {
      throw new Error('Untrusted OGS review IPC sender.')
    }
  }

  ipcMain.handle('ogsReviews:getState', (evt) => {
    assertTrusted(evt)
    return reviewClient.getState()
  })

  ipcMain.handle('ogsReviews:connect', async (evt, input) => {
    try {
      assertTrusted(evt)
      let state = await reviewClient.connectReview(input || {})
      sendStateChange?.(state)
      return {ok: true, state}
    } catch (err) {
      return {ok: false, error: serializeError(err)}
    }
  })

  ipcMain.handle('ogsReviews:disconnect', (evt, uuid) => {
    assertTrusted(evt)
    let state = reviewClient.disconnectReview(uuid)
    sendStateChange?.(state)
    return {ok: true, state}
  })

  return reviewClient
}

module.exports = {setupOgsReviewIpcHandlers}
