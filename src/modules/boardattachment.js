export function createLocalDocumentBoardAttachment(documentId = null) {
  return {
    type: 'local-document',
    documentId,
  }
}

export function createOgsBoardAttachment(gameId) {
  gameId = normalizeAttachmentId(gameId)

  return gameId == null
    ? createLocalDocumentBoardAttachment()
    : {
        type: 'ogs',
        gameId,
      }
}

export function normalizeBoardAttachment(attachment) {
  if (attachment?.type === 'ogs') {
    let gameId = normalizeAttachmentId(attachment.gameId)
    return gameId == null
      ? createLocalDocumentBoardAttachment()
      : {type: 'ogs', gameId}
  }

  if (attachment?.type === 'local-document') {
    return createLocalDocumentBoardAttachment(attachment.documentId ?? null)
  }

  return createLocalDocumentBoardAttachment()
}

export function getAttachedOgsGameId(attachment) {
  return attachment?.type === 'ogs'
    ? normalizeAttachmentId(attachment.gameId)
    : null
}

export function isOgsBoardAttachment(attachment, gameId = null) {
  let attachedGameId = getAttachedOgsGameId(attachment)

  if (attachedGameId == null) return false
  if (gameId == null) return true

  return attachedGameId === normalizeAttachmentId(gameId)
}

export function createBoardAttachmentState(attachment) {
  attachment = normalizeBoardAttachment(attachment)

  return {
    boardAttachment: attachment,
    onlineGameId: getAttachedOgsGameId(attachment),
  }
}

function normalizeAttachmentId(id) {
  if (id == null || id === '') return null

  let result = Number(id)
  return Number.isFinite(result) ? result : String(id)
}
