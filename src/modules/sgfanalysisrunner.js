const {spawn} = require('child_process')
const {
  constants,
  closeSync,
  fstatSync,
  openSync,
  lstatSync,
  realpathSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} = require('fs')
const {dirname, extname, join, basename, resolve} = require('path')

const {buildAnalyzeSgfArguments} = require('./sgfanalysisconfig.js')
const {extractSgfAnalysisMetadata} = require('./sgfanalysisfiles.js')
const {parseAnalyzeSgfProgress} = require('./sgfanalysisprogress.js')

const MAX_ERROR_MESSAGE_LENGTH = 500

async function runSgfAnalysis({
  inputPath,
  outputPath,
  config,
  generatedFileSuffix = createDefaultGeneratedFileSuffix(),
  onProgress = () => {},
  signal = null,
  spawnImpl = spawn,
} = {}) {
  validateRunInput({inputPath, outputPath})

  if (pathEntryExists(outputPath)) {
    throw toSgfAnalysisRunnerError({
      code: 'output-exists',
      message: 'Analysis output already exists.',
    })
  }

  if (signal?.aborted) {
    throw toSgfAnalysisRunnerError({
      code: 'cancelled',
      message: 'Analysis was cancelled.',
    })
  }

  let generatedPath = getAnalyzeSgfGeneratedPath(inputPath, generatedFileSuffix)

  if (isSameFilePath(generatedPath, outputPath)) {
    throw toSgfAnalysisRunnerError({
      code: 'invalid-output',
      message: 'Analysis output path conflicts with temporary output.',
    })
  }

  if (pathEntryExists(generatedPath)) {
    throw toSgfAnalysisRunnerError({
      code: 'generated-output-exists',
      message: 'Temporary analysis output already exists.',
    })
  }

  let args = buildAnalyzeSgfArguments({
    inputPath,
    config,
    fileSuffix: generatedFileSuffix,
  })
  let child = spawnImpl(config.analyzeSgfPath, args, {shell: false})
  let stdout = ''
  let stderr = ''
  let stdoutLineBuffer = ''
  let stderrLineBuffer = ''
  let settled = false
  let cancelled = false

  return await new Promise((resolve, reject) => {
    let fail = (error) => {
      if (settled) return
      settled = true
      cleanupFile(generatedPath)
      reject(toSgfAnalysisRunnerError(error))
    }

    let finish = () => {
      if (settled) return
      settled = true

      try {
        let content = readValidGeneratedSgf(generatedPath)
        writeFinalSgf(outputPath, content)
        cleanupFile(generatedPath)
        resolve({outputPath, stdout, stderr})
      } catch (error) {
        cleanupFile(generatedPath)
        reject(toSgfAnalysisRunnerError(error))
      }
    }

    let abort = () => {
      cancelled = true
      try {
        child.kill?.('SIGTERM')
      } catch (err) {}
    }

    signal?.addEventListener?.('abort', abort, {once: true})

    child.stdout?.on?.('data', (chunk) => {
      let text = chunk.toString()
      stdout += text
      stdoutLineBuffer = emitProgressChunk(stdoutLineBuffer, text, onProgress)
    })

    child.stderr?.on?.('data', (chunk) => {
      let text = chunk.toString()
      stderr += text
      stderrLineBuffer = emitProgressChunk(stderrLineBuffer, text, onProgress)
    })

    child.on?.('error', (error) => {
      signal?.removeEventListener?.('abort', abort)
      fail({code: 'spawn-failed', message: error.message})
    })

    child.on?.('close', (code, closeSignal) => {
      signal?.removeEventListener?.('abort', abort)
      flushProgressLine(stdoutLineBuffer, onProgress)
      flushProgressLine(stderrLineBuffer, onProgress)

      if (cancelled || signal?.aborted) {
        fail({code: 'cancelled', message: 'Analysis was cancelled.'})
        return
      }

      if (code !== 0) {
        fail({
          code: 'process-failed',
          message: getProcessErrorMessage(stderr, code, closeSignal),
        })
        return
      }

      finish()
    })
  })
}

function createDefaultGeneratedFileSuffix() {
  return `.seki-analysis-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`
}

function getAnalyzeSgfGeneratedPath(inputPath, fileSuffix) {
  let extension = extname(inputPath)
  let stem = basename(inputPath, extension)

  return join(dirname(inputPath), `${stem}${fileSuffix}.sgf`)
}

function validateRunInput({inputPath, outputPath}) {
  if (typeof inputPath !== 'string' || inputPath === '') {
    throw toSgfAnalysisRunnerError({
      code: 'invalid-input',
      message: 'Analysis input path is invalid.',
    })
  }

  if (typeof outputPath !== 'string' || outputPath === '') {
    throw toSgfAnalysisRunnerError({
      code: 'invalid-output',
      message: 'Analysis output path is invalid.',
    })
  }
}

function emitProgressChunk(buffer, text, onProgress) {
  let lines = `${buffer}${text}`.split(/\r?\n|\r/g)
  let nextBuffer = lines.pop() || ''

  for (let line of lines) {
    let progress = parseAnalyzeSgfProgress(line)
    if (progress != null) onProgress(progress)
  }

  return nextBuffer
}

function flushProgressLine(line, onProgress) {
  let progress = parseAnalyzeSgfProgress(line)
  if (progress != null) onProgress(progress)
}

function readValidGeneratedSgf(path) {
  let fd = null

  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  } catch (err) {
    throw {
      code: 'output-missing',
      message: 'Analysis output was not generated.',
    }
  }

  try {
    let fileStat = fstatSync(fd)

    if (!fileStat.isFile()) {
      throw {
        code: 'output-invalid',
        message: 'Analysis output is not a regular file.',
      }
    }

    if (fileStat.size === 0) {
      throw {code: 'output-empty', message: 'Analysis output is empty.'}
    }

    let content = readFileSync(fd, 'utf8')

    if (extractSgfAnalysisMetadata(content) == null) {
      throw {
        code: 'output-invalid',
        message: 'Analysis output is not valid SGF.',
      }
    }

    return content
  } finally {
    if (fd != null) closeSync(fd)
  }
}

function getProcessErrorMessage(stderr, code, closeSignal) {
  let message = stderr
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-1)[0]

  if (message != null && message !== '') {
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
  }
  if (closeSignal != null)
    return `analyze-sgf exited with signal ${closeSignal}.`

  return `analyze-sgf exited with code ${code}.`
}

function writeFinalSgf(outputPath, content) {
  let fd = null

  try {
    fd = openSync(
      outputPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    )
    writeFileSync(fd, content)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw {code: 'output-exists', message: 'Analysis output already exists.'}
    }

    throw error
  } finally {
    if (fd != null) closeSync(fd)
  }
}

function cleanupFile(path) {
  try {
    if (path != null && pathEntryExists(path)) unlinkSync(path)
  } catch (err) {}
}

function pathEntryExists(path) {
  try {
    lstatSync(path)
    return true
  } catch (err) {
    return false
  }
}

function isSameFilePath(a, b) {
  if (resolve(a) === resolve(b)) return true

  try {
    return (
      realpathSync(dirname(a)) === realpathSync(dirname(b)) &&
      basename(a) === basename(b)
    )
  } catch (err) {
    return false
  }
}

function toSgfAnalysisRunnerError(error) {
  if (error instanceof SgfAnalysisRunnerError) return error

  return new SgfAnalysisRunnerError({
    code: error?.code || 'analysis-runner-error',
    message: error?.message || 'Analysis failed.',
  })
}

class SgfAnalysisRunnerError extends Error {
  constructor({code, message}) {
    super(message)
    this.name = 'SgfAnalysisRunnerError'
    this.code = code
  }
}

exports.runSgfAnalysis = runSgfAnalysis
exports.createDefaultGeneratedFileSuffix = createDefaultGeneratedFileSuffix
exports.getAnalyzeSgfGeneratedPath = getAnalyzeSgfGeneratedPath
exports.SgfAnalysisRunnerError = SgfAnalysisRunnerError
