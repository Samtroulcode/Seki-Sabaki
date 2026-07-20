import assert from 'assert'
import {EventEmitter} from 'events'
import {PassThrough} from 'stream'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import {join} from 'path'
import {tmpdir} from 'os'

import {createDefaultSgfAnalysisConfig} from '../src/modules/sgfanalysisconfig.js'
import {
  getAnalyzeSgfGeneratedPath,
  runSgfAnalysis,
  SgfAnalysisRunnerError,
} from '../src/modules/sgfanalysisrunner.js'

function config() {
  return {
    ...createDefaultSgfAnalysisConfig(),
    analyzeSgfPath: 'fake-analyze-sgf',
    katagoPath: '/katago',
    katagoArguments: 'analysis -model model.bin.gz -config analysis.cfg',
    outputDirectory: '/analysis',
  }
}

function createFakeSpawn(handler) {
  return (executable, args, options) => {
    let child = new EventEmitter()
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()
    child.killCalls = []
    child.kill = (signal) => {
      child.killCalls.push(signal)
      child.emit('close', null, signal)
    }

    process.nextTick(() => handler({child, executable, args, options}))

    return child
  }
}

describe('SGF analysis runner', () => {
  it('derives the generated analyze-sgf path from input and suffix', () => {
    assert.strictEqual(
      getAnalyzeSgfGeneratedPath('/tmp/game.sgf', '.seki'),
      '/tmp/game.seki.sgf',
    )
  })

  it('runs analyze-sgf, emits progress, and moves valid output', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let logPath = join(directory, 'analysis.log')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')
    let progress = []
    let spawnCalls = []

    try {
      writeFileSync(inputPath, '(;GM[1]FF[4]SZ[9]PB[B]PW[W])')

      let result = await runSgfAnalysis({
        inputPath,
        outputPath,
        logPath,
        config: config(),
        generatedFileSuffix: '.tmp',
        onProgress: (value) => progress.push(value),
        spawnImpl: createFakeSpawn(({child, executable, args, options}) => {
          spawnCalls.push({executable, args, options})
          child.stderr.write('63% (5/8, 4.2k visits) | ETA: 1s\n')
          writeFileSync(generatedPath, '(;GM[1]FF[4]SZ[9]GN[Analyzed])')
          child.emit('close', 0, null)
        }),
      })

      assert.strictEqual(result.outputPath, outputPath)
      assert.strictEqual(existsSync(generatedPath), false)
      assert.strictEqual(
        readFileSync(outputPath, 'utf8'),
        '(;GM[1]FF[4]SZ[9]GN[Analyzed])',
      )
      assert.deepStrictEqual(progress, [
        {percent: 63, currentMove: 5, totalMoves: 8, visits: 4200},
      ])
      assert.strictEqual(spawnCalls[0].executable, 'fake-analyze-sgf')
      assert.strictEqual(spawnCalls[0].options.shell, false)
      assert.match(readFileSync(logPath, 'utf8'), /Starting analysis/)
      assert.match(readFileSync(logPath, 'utf8'), /stderr: 63%/)
      assert.match(readFileSync(logPath, 'utf8'), /completed successfully/)
      assert(spawnCalls[0].args.includes(inputPath))
      assert(
        spawnCalls[0].args.some((arg) => arg.includes('fileSuffix:".tmp"')),
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('continues analysis when the diagnostic log cannot be written', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')
    let logLines = []

    try {
      writeFileSync(inputPath, '(;GM[1])')

      let result = await runSgfAnalysis({
        inputPath,
        outputPath,
        logPath: directory,
        config: config(),
        generatedFileSuffix: '.tmp',
        onLog: (line) => logLines.push(line),
        spawnImpl: createFakeSpawn(({child}) => {
          child.stderr.write('63% (5/8, 4.2k visits) | ETA: 1s\n')
          writeFileSync(generatedPath, '(;GM[1]FF[4]SZ[9]GN[Analyzed])')
          child.emit('close', 0, null)
        }),
      })

      assert.strictEqual(result.outputPath, outputPath)
      assert.strictEqual(existsSync(outputPath), true)
      assert.strictEqual(
        logLines.some((line) => line.includes('stderr: 63%')),
        true,
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('fails with stderr when analyze-sgf exits non-zero', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            spawnImpl: createFakeSpawn(({child}) => {
              child.stderr.write('KataGo failed\n')
              child.emit('close', 1, null)
            }),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'process-failed' &&
          error.message === 'KataGo failed',
      )
      assert.strictEqual(existsSync(outputPath), false)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('rejects missing or invalid generated SGF output', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.seki-analysis')

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            generatedFileSuffix: '.seki-analysis',
            spawnImpl: createFakeSpawn(({child}) => {
              writeFileSync(generatedPath, 'not sgf')
              child.emit('close', 0, null)
            }),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'output-invalid',
      )
      assert.strictEqual(existsSync(generatedPath), false)
      assert.strictEqual(existsSync(outputPath), false)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('kills the process and cleans output on cancellation', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.seki-analysis')
    let controller = new AbortController()
    let childRef = null

    try {
      writeFileSync(inputPath, '(;GM[1])')

      let promise = runSgfAnalysis({
        inputPath,
        outputPath,
        config: config(),
        generatedFileSuffix: '.seki-analysis',
        signal: controller.signal,
        spawnImpl: createFakeSpawn(({child}) => {
          childRef = child
          writeFileSync(generatedPath, '(;GM[1]GN[partial])')
          controller.abort()
        }),
      })

      await assert.rejects(
        () => promise,
        (error) =>
          error instanceof SgfAnalysisRunnerError && error.code === 'cancelled',
      )
      assert.deepStrictEqual(childRef.killCalls, ['SIGTERM'])
      assert.strictEqual(existsSync(generatedPath), false)
      assert.strictEqual(existsSync(outputPath), false)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('refuses to overwrite an existing output file', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')

    try {
      writeFileSync(inputPath, '(;GM[1])')
      writeFileSync(outputPath, '(;GM[1]GN[existing])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'output-exists',
      )
      assert.strictEqual(
        readFileSync(outputPath, 'utf8'),
        '(;GM[1]GN[existing])',
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('refuses dangling symlinks at the output path', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')

    try {
      writeFileSync(inputPath, '(;GM[1])')
      symlinkSync(join(directory, 'missing.sgf'), outputPath)

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'output-exists',
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('refuses to overwrite output created while analysis is running', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            generatedFileSuffix: '.tmp',
            spawnImpl: createFakeSpawn(({child}) => {
              writeFileSync(generatedPath, '(;GM[1]GN[generated])')
              writeFileSync(outputPath, '(;GM[1]GN[race])')
              child.emit('close', 0, null)
            }),
          }),
        (error) => error.code === 'output-exists',
      )
      assert.strictEqual(readFileSync(outputPath, 'utf8'), '(;GM[1]GN[race])')
      assert.strictEqual(existsSync(generatedPath), false)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('does not spawn when the signal is already aborted', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let controller = new AbortController()
    controller.abort()

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            signal: controller.signal,
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError && error.code === 'cancelled',
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('parses progress split across stream chunks', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')
    let progress = []

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await runSgfAnalysis({
        inputPath,
        outputPath,
        config: config(),
        generatedFileSuffix: '.tmp',
        onProgress: (value) => progress.push(value),
        spawnImpl: createFakeSpawn(({child}) => {
          child.stderr.write('63% (5/')
          child.stderr.write('8, 4.2k visits) | ETA: 1s\n')
          writeFileSync(generatedPath, '(;GM[1]GN[generated])')
          child.emit('close', 0, null)
        }),
      })

      assert.deepStrictEqual(progress, [
        {percent: 63, currentMove: 5, totalMoves: 8, visits: 4200},
      ])
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('sanitizes stderr failure messages', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            spawnImpl: createFakeSpawn(({child}) => {
              child.stderr.write(`\x1b[31m${'x'.repeat(600)}\x1b[0m\n`)
              child.emit('close', 1, null)
            }),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'process-failed' &&
          error.message === 'x'.repeat(500),
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('refuses to reuse an existing generated temp output', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')

    try {
      writeFileSync(inputPath, '(;GM[1])')
      writeFileSync(generatedPath, '(;GM[1]GN[existing temp])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            generatedFileSuffix: '.tmp',
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'generated-output-exists',
      )
      assert.strictEqual(
        readFileSync(generatedPath, 'utf8'),
        '(;GM[1]GN[existing temp])',
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('refuses dangling symlinks at the generated temp path', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = join(directory, 'final.sgf')
    let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')

    try {
      writeFileSync(inputPath, '(;GM[1])')
      symlinkSync(join(directory, 'missing.sgf'), generatedPath)

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            generatedFileSuffix: '.tmp',
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'generated-output-exists',
      )
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('rejects final output paths that alias generated temp output', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let inputPath = join(directory, 'source.sgf')
    let outputPath = getAnalyzeSgfGeneratedPath(inputPath, '.tmp')

    try {
      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            generatedFileSuffix: '.tmp',
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'invalid-output',
      )
      assert.strictEqual(existsSync(outputPath), false)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })

  it('rejects generated temp aliases through symlinked directories', async () => {
    let directory = mkdtempSync(join(tmpdir(), 'seki-runner-'))
    let realDirectory = join(directory, 'real')
    let linkedDirectory = join(directory, 'link')

    try {
      mkdirSync(realDirectory)
      symlinkSync(realDirectory, linkedDirectory, 'dir')

      let inputPath = join(linkedDirectory, 'source.sgf')
      let outputPath = join(realDirectory, 'source.tmp.sgf')

      writeFileSync(inputPath, '(;GM[1])')

      await assert.rejects(
        () =>
          runSgfAnalysis({
            inputPath,
            outputPath,
            config: config(),
            generatedFileSuffix: '.tmp',
            spawnImpl: createFakeSpawn(() => assert.fail('should not spawn')),
          }),
        (error) =>
          error instanceof SgfAnalysisRunnerError &&
          error.code === 'invalid-output',
      )
      assert.strictEqual(existsSync(outputPath), false)
    } finally {
      rmSync(directory, {recursive: true, force: true})
    }
  })
})
