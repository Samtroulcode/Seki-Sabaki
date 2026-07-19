import assert from 'assert'

import {
  createBoardAttachmentState,
  createLocalDocumentBoardAttachment,
  createOgsBoardAttachment,
  getAttachedOgsGameId,
  isOgsBoardAttachment,
  normalizeBoardAttachment,
} from '../src/modules/boardattachment.js'

describe('board attachment', () => {
  it('creates local document attachments by default', () => {
    assert.deepStrictEqual(createLocalDocumentBoardAttachment(), {
      type: 'local-document',
      documentId: null,
    })
    assert.deepStrictEqual(normalizeBoardAttachment(null), {
      type: 'local-document',
      documentId: null,
    })
    assert.strictEqual(getAttachedOgsGameId(null), null)
  })

  it('normalizes OGS game attachments', () => {
    assert.deepStrictEqual(createOgsBoardAttachment('42'), {
      type: 'ogs',
      gameId: 42,
    })
    assert.deepStrictEqual(createOgsBoardAttachment(null), {
      type: 'local-document',
      documentId: null,
    })
    assert.deepStrictEqual(
      normalizeBoardAttachment({type: 'ogs', gameId: ''}),
      {
        type: 'local-document',
        documentId: null,
      },
    )
    assert.strictEqual(getAttachedOgsGameId({type: 'ogs', gameId: '42'}), 42)
    assert.strictEqual(isOgsBoardAttachment({type: 'ogs', gameId: 42}), true)
    assert.strictEqual(
      isOgsBoardAttachment({type: 'ogs', gameId: 42}, '42'),
      true,
    )
    assert.strictEqual(
      isOgsBoardAttachment({type: 'ogs', gameId: 42}, 43),
      false,
    )
  })

  it('creates compatible public state from attachments', () => {
    assert.deepStrictEqual(
      createBoardAttachmentState({type: 'ogs', gameId: '42'}),
      {
        boardAttachment: {type: 'ogs', gameId: 42},
        onlineGameId: 42,
      },
    )
    assert.deepStrictEqual(
      createBoardAttachmentState({type: 'local-document'}),
      {
        boardAttachment: {type: 'local-document', documentId: null},
        onlineGameId: null,
      },
    )
  })
})
