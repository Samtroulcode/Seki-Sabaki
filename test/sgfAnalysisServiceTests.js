import assert from 'assert'
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {createDefaultSgfAnalysisConfig} from '../src/modules/sgfanalysisconfig.js'
import {
  SgfAnalysisService,
  SgfAnalysisServiceError,
} from '../src/modules/sgfanalysisservice.js'

function deferred() {
  let resolve
  let reject
  let promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return {promise, resolve, reject}
}

function createService(options = {}) {
  let directory =
    options.directory || mkdtempSync(join(tmpdir(), 'seki-service-'))
  let id = 0

  return {
    directory,
    service: new SgfAnalysisService({
      config: {
        ...createDefaultSgfAnalysisConfig(),
        analyzeSgfPath: 'analyze-sgf',
        katagoPath: '/katago',
        katagoModelPath: '/model.bin.gz',
        katagoConfigPath: '/analysis.cfg',
        outputDirectory: directory,
      },
      runner: options.runner || (async () => {}),
      now: () => 1784540000000,
      createId: () => `id-${++id}`,
      fs: {
        exists: (path) =>
          path === '/katago' ||
          path === '/model.bin.gz' ||
          path === '/analysis.cfg' ||
          existsSync(path),
        ...options.fs,
      },
    }),
  }
}

describe('SGF analysis service', () => {
  it('starts file-based analyses without modifying the source', async () => {
    let calls = []
    let {directory, service} = createService({
      runner: async (job) => calls.push(job),
    })
    let sourcePath = join(directory, 'source.sgf')

    try {
      writeFileSync(
        sourcePath,
        '(;GM[1]FF[4]SZ[9]GN[Test Game]PB[Black]PW[White]DT[2026-07-20])',
      )

      let job = service.startAnalysis({
        source: {type: 'file', path: sourcePath},
        metadata: {name: 'Override'},
        options: {maxVisits: 800},
      })
      await Promise.resolve()

      assert.strictEqual(job.id, 'id-1')
      assert.strictEqual(job.sourcePath, sourcePath)
      assert.strictEqual(job.displayName, 'Override')
      assert.strictEqual(job.config.maxVisits, 800)
      assert.strictEqual(
        job.outputPath,
        join(directory, '9x9-override-2026-07-20.sgf'),
      )
      assert.strictEqual(job.logPath, join(directory, 'logs', 'id-1.log'))
      assert.strictEqual(
        readFileSync(sourcePath, 'utf8').includes('Test Game'),
        true,
      )
      assert.strictEqual(calls[0].inputPath, sourcePath)
      assert.strictEqual(
        service.getAnalysisState().completedJobs[0].status,
        'completed',
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('writes board SGF content to a temporary source and cleans it after completion', async () => {
    let tempSource = null
    let {directory, service} = createService({
      runner: async ({inputPath}) => {
        tempSource = inputPath
        assert.strictEqual(existsSync(inputPath), true)
      },
    })

    try {
      let job = service.startAnalysis({
        source: {
          type: 'board',
          sgfContent: '(;GM[1]FF[4]SZ[13]GN[Board Game]PB[B]PW[W])',
        },
      })
      await Promise.resolve()

      assert.strictEqual(job.sourcePath, join(directory, 'tmp', 'id-1.sgf'))
      assert.strictEqual(tempSource, job.sourcePath)
      assert.strictEqual(existsSync(tempSource), false)
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('does not allow per-request options to override privileged paths', () => {
    let baseDirectory = mkdtempSync(join(tmpdir(), 'seki-service-'))
    let overrideDirectory = join(baseDirectory, 'override')
    let calls = []
    let {service} = createService({
      directory: baseDirectory,
      runner: (job) => {
        calls.push(job)
        return deferred().promise
      },
    })

    try {
      let job = service.startAnalysis({
        source: {type: 'board', sgfContent: '(;GM[1]FF[4]SZ[9]GN[Board])'},
        options: {
          outputDirectory: overrideDirectory,
          analyzeSgfPath: '/tmp/evil',
          katagoPath: '/tmp/evil-katago',
          maxVisits: 42,
        },
      })

      assert.strictEqual(job.sourcePath, join(baseDirectory, 'tmp', 'id-1.sgf'))
      assert.strictEqual(
        job.outputPath,
        join(baseDirectory, '9x9-board-2026-07-20.sgf'),
      )
      assert.strictEqual(calls[0].config.outputDirectory, baseDirectory)
      assert.strictEqual(calls[0].config.analyzeSgfPath, 'analyze-sgf')
      assert.strictEqual(calls[0].config.katagoPath, '/katago')
      assert.strictEqual(calls[0].config.maxVisits, 42)
    } finally {
      service.dispose()
      rmSync(baseDirectory, {recursive: true, force: true})
    }
  })

  it('rejects invalid persisted and per-job user options before normalization', () => {
    let {directory, service} = createService()

    try {
      assert.throws(
        () => service.setConfig({maxVisits: 'abc'}),
        (error) => error.code === 'invalid-max-visits',
      )

      assert.throws(
        () =>
          service.startAnalysis({
            source: {type: 'file', path: '/games/game.sgf'},
            options: {maxVisits: 'abc'},
          }),
        (error) => error.code === 'invalid-max-visits',
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('leaves board temporary source while analysis is running', () => {
    let run = deferred()
    let {directory, service} = createService({runner: () => run.promise})

    try {
      let job = service.startAnalysis({
        source: {type: 'board', sgfContent: '(;GM[1]FF[4]SZ[9]GN[Board])'},
      })

      assert.strictEqual(existsSync(job.sourcePath), true)
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('cleans board temporary sources after immediate runner failures', async () => {
    let {directory, service} = createService({
      runner: () => {
        let error = new Error('failed')
        error.code = 'failed'
        throw error
      },
    })

    try {
      let job = service.startAnalysis({
        source: {type: 'board', sgfContent: '(;GM[1]FF[4]SZ[9]GN[Board])'},
      })
      await Promise.resolve()
      await Promise.resolve()

      assert.strictEqual(existsSync(job.sourcePath), false)
      assert.strictEqual(
        service.getAnalysisState().completedJobs[0].status,
        'failed',
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('does not create board temporary sources when log setup fails', () => {
    let {directory, service} = createService({
      fs: {
        mkdir: (path) => {
          if (path === join(directory, 'logs')) throw new Error('no logs')
        },
      },
    })

    try {
      assert.throws(
        () =>
          service.startAnalysis({
            source: {type: 'board', sgfContent: '(;GM[1]FF[4]SZ[9]GN[Board])'},
          }),
        /no logs/,
      )
      assert.strictEqual(existsSync(join(directory, 'tmp', 'id-1.sgf')), false)
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('avoids output path collisions with running jobs', () => {
    let run = deferred()
    let {directory, service} = createService({runner: () => run.promise})
    let sourcePath = join(directory, 'source.sgf')

    try {
      writeFileSync(sourcePath, '(;GM[1]FF[4]SZ[9]GN[Same]PB[B]PW[W])')

      let first = service.startAnalysis({
        source: {type: 'file', path: sourcePath},
      })
      let second = service.startAnalysis({
        source: {type: 'file', path: sourcePath},
      })

      assert.strictEqual(
        first.outputPath,
        join(directory, '9x9-same-2026-07-20.sgf'),
      )
      assert.strictEqual(
        second.outputPath,
        join(directory, '9x9-same-2026-07-20-2.sgf'),
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('rejects invalid requests and invalid SGF sources', () => {
    let {directory, service} = createService()
    let sourcePath = join(directory, 'bad.sgf')

    try {
      writeFileSync(sourcePath, 'not sgf')

      assert.throws(
        () => service.startAnalysis({source: {type: 'file', path: sourcePath}}),
        (error) =>
          error instanceof SgfAnalysisServiceError &&
          error.code === 'invalid-sgf',
      )
      assert.throws(
        () => service.startAnalysis({source: {type: 'board', sgfContent: ''}}),
        (error) =>
          error instanceof SgfAnalysisServiceError &&
          error.code === 'invalid-source',
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('rejects unsupported, non-regular, and oversized source files', () => {
    let {directory, service} = createService({
      fs: {
        exists: (path) =>
          path === '/katago' ||
          path === '/model.bin.gz' ||
          path === '/analysis.cfg' ||
          path.startsWith('/tmp/source'),
        stat: (path) => {
          if (path === '/tmp/source-dir.sgf')
            return {isFile: () => false, size: 0}
          if (path === '/tmp/source-large.sgf') {
            return {isFile: () => true, size: 51 * 1024 * 1024}
          }

          return {isFile: () => true, size: 10, isDirectory: () => true}
        },
        readFile: () => '(;GM[1])',
      },
    })

    try {
      assert.throws(
        () =>
          service.startAnalysis({
            source: {type: 'file', path: '/tmp/source.txt'},
          }),
        (error) => error.code === 'unsupported-source-file',
      )
      assert.throws(
        () =>
          service.startAnalysis({
            source: {type: 'file', path: '/tmp/source-dir.sgf'},
          }),
        (error) => error.code === 'unsupported-source-file',
      )
      assert.throws(
        () =>
          service.startAnalysis({
            source: {type: 'file', path: '/tmp/source-large.sgf'},
          }),
        (error) => error.code === 'source-too-large',
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('exposes analyzed games from the configured output directory', () => {
    let {directory, service} = createService()

    try {
      writeFileSync(
        join(directory, 'analyzed.sgf'),
        '(;GM[1]FF[4]SZ[9]GN[Analyzed]PB[B]PW[W])',
      )

      assert.deepStrictEqual(
        service.getAnalyzedGames().map((game) => game.gameName),
        ['Analyzed'],
      )
      assert.deepStrictEqual(
        service.refreshAnalyzedGames(),
        service.getAnalyzedGames(),
      )
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('forwards cancellation to the queue', async () => {
    let run = deferred()
    let signal = null
    let {directory, service} = createService({
      runner: ({signal: runnerSignal}) => {
        signal = runnerSignal
        return run.promise
      },
    })

    try {
      let job = service.startAnalysis({
        source: {type: 'board', sgfContent: '(;GM[1]FF[4]SZ[9]GN[Board])'},
      })

      assert.strictEqual(service.cancelAnalysis(job.id), true)
      assert.strictEqual(signal.aborted, true)
    } finally {
      service.dispose()
      rmSync(directory, {recursive: true, force: true})
    }
  })
})
