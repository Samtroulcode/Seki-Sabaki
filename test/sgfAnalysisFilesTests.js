import assert from 'assert'
import {mkdtempSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {
  buildAnalysisFilename,
  createAnalyzedGame,
  extractSgfAnalysisMetadata,
  getPartialAnalysisOutputPath,
  getUniqueAnalysisOutputPath,
  listAnalyzedGames,
  slugifyAnalysisName,
} from '../src/modules/sgfanalysisfiles.js'

const fixedDate = new Date('2026-07-20T12:00:00Z')

describe('SGF analysis files', () => {
  it('slugifies analysis names safely', () => {
    assert.strictEqual(
      slugifyAnalysisName('Sam vs Opponent'),
      'sam-vs-opponent',
    )
    assert.strictEqual(slugifyAnalysisName('Été / Partie #1'), 'ete-partie-1')
    assert.strictEqual(slugifyAnalysisName('../..'), 'partie')
    assert.strictEqual(slugifyAnalysisName(''), 'partie')
  })

  it('builds filenames from board size, name, and date', () => {
    assert.strictEqual(
      buildAnalysisFilename(
        {boardWidth: 9, boardHeight: 9, name: 'Fast Game', date: '2026-07-20'},
        {now: fixedDate},
      ),
      '9x9-fast-game-2026-07-20.sgf',
    )
  })

  it('uses player names and current date as filename fallbacks', () => {
    assert.strictEqual(
      buildAnalysisFilename(
        {blackPlayer: 'Black', whitePlayer: 'White'},
        {now: fixedDate},
      ),
      '19x19-black-vs-white-2026-07-20.sgf',
    )
  })

  it('avoids collisions with final and partial files', () => {
    let existing = new Set([
      '/analysis/19x19-sam-2026-07-20.sgf',
      '/analysis/19x19-sam-2026-07-20-2.sgf.partial',
    ])

    assert.strictEqual(
      getUniqueAnalysisOutputPath(
        '/analysis',
        {name: 'Sam', date: '2026-07-20'},
        {exists: (path) => existing.has(path), now: fixedDate},
      ),
      '/analysis/19x19-sam-2026-07-20-3.sgf',
    )
  })

  it('uses filesystem collision checks by default', () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-analysis-'))

    try {
      writeFileSync(join(directory, '19x19-sam-2026-07-20.sgf'), '(;GM[1])')
      writeFileSync(
        join(directory, '19x19-sam-2026-07-20-2.sgf.partial'),
        '(;GM[1])',
      )

      assert.strictEqual(
        getUniqueAnalysisOutputPath(
          directory,
          {name: 'Sam', date: '2026-07-20'},
          {now: fixedDate},
        ),
        join(directory, '19x19-sam-2026-07-20-3.sgf'),
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('derives the partial output path', () => {
    assert.strictEqual(
      getPartialAnalysisOutputPath('/analysis/game.sgf'),
      '/analysis/game.sgf.partial',
    )
  })

  it('extracts root SGF metadata for analyzed game cards', () => {
    let metadata = extractSgfAnalysisMetadata(
      '(;GM[1]FF[4]SZ[13]GN[Test Game]PB[Black]PW[White]BR[1d]WR[2d]DT[2026-07-20]RE[B+R]KM[7.5]C[Root summary];B[dd];W[pq])',
    )

    assert.deepStrictEqual(metadata, {
      gameName: 'Test Game',
      blackPlayer: 'Black',
      whitePlayer: 'White',
      blackRank: '1d',
      whiteRank: '2d',
      result: 'B+R',
      date: '2026-07-20',
      boardWidth: 13,
      boardHeight: 13,
      komi: 7.5,
      summary: 'Root summary',
    })
  })

  it('returns null for invalid analyzed SGF files', () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-analysis-'))
    let invalidPath = join(directory, 'invalid.sgf')

    try {
      writeFileSync(invalidPath, 'not sgf')
      assert.strictEqual(createAnalyzedGame(invalidPath), null)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('lists valid SGF files and ignores partial or invalid files', () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-analysis-'))

    try {
      writeFileSync(
        join(directory, 'newer.sgf'),
        '(;GM[1]FF[4]SZ[9]GN[Newer]PB[B]PW[W])',
      )
      writeFileSync(
        join(directory, 'older.sgf'),
        '(;GM[1]FF[4]SZ[19]GN[Older]PB[B]PW[W])',
      )
      writeFileSync(join(directory, 'ignored.sgf.partial'), '(;GM[1])')
      writeFileSync(join(directory, 'invalid.sgf'), 'not sgf')

      let games = listAnalyzedGames(directory)

      assert.deepStrictEqual(games.map((game) => game.filename).sort(), [
        'newer.sgf',
        'older.sgf',
      ])
      assert.deepStrictEqual(games.map((game) => game.gameName).sort(), [
        'Newer',
        'Older',
      ])
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })
})
