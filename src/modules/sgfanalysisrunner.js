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
const sgf = require('@sabaki/sgf')

const {buildAnalyzeSgfArguments} = require('./sgfanalysisconfig.js')
const {extractSgfAnalysisMetadata} = require('./sgfanalysisfiles.js')
const {parseAnalyzeSgfProgress} = require('./sgfanalysisprogress.js')

const MAX_ERROR_MESSAGE_LENGTH = 500

async function runSgfAnalysis({
  inputPath,
  outputPath,
  config,
  logPath = null,
  generatedFileSuffix = createDefaultGeneratedFileSuffix(),
  onProgress = () => {},
  onLog = () => {},
  signal = null,
  spawnImpl = spawn,
  now = () => new Date(),
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

  let args = [
    ...(Array.isArray(config.analyzeSgfArgs) ? config.analyzeSgfArgs : []),
    ...buildAnalyzeSgfArguments({
      inputPath,
      config,
      fileSuffix: generatedFileSuffix,
    }),
  ]
  writeLog(logPath, onLog, now, `Starting analysis for ${inputPath}`)
  writeLog(logPath, onLog, now, `Output path: ${outputPath}`)
  writeLog(
    logPath,
    onLog,
    now,
    `Command: ${config.analyzeSgfPath} ${args.join(' ')}`,
  )
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
      writeLog(logPath, onLog, now, `Failed: ${error.message || error.code}`)
      cleanupFile(generatedPath)
      reject(toSgfAnalysisRunnerError(error))
    }

    let finish = () => {
      if (settled) return
      settled = true

      try {
        let content = addScoreLeadProperties(
          readValidGeneratedSgf(generatedPath),
        )
        writeFinalSgf(outputPath, content)
        cleanupFile(generatedPath)
        writeLog(logPath, onLog, now, 'Analysis completed successfully.')
        resolve({outputPath, stdout, stderr})
      } catch (error) {
        cleanupFile(generatedPath)
        reject(toSgfAnalysisRunnerError(error))
      }
    }

    let abort = () => {
      cancelled = true
      writeLog(logPath, onLog, now, 'Cancellation requested.')
      try {
        child.kill?.('SIGTERM')
      } catch (err) {}
    }

    signal?.addEventListener?.('abort', abort, {once: true})

    child.stdout?.on?.('data', (chunk) => {
      let text = chunk.toString()
      stdout += text
      emitLogChunk(logPath, onLog, now, 'stdout', text)
      stdoutLineBuffer = emitProgressChunk(stdoutLineBuffer, text, onProgress)
    })

    child.stderr?.on?.('data', (chunk) => {
      let text = chunk.toString()
      stderr += text
      emitLogChunk(logPath, onLog, now, 'stderr', text)
      stderrLineBuffer = emitProgressChunk(stderrLineBuffer, text, onProgress)
    })

    child.on?.('error', (error) => {
      signal?.removeEventListener?.('abort', abort)
      fail(classifySpawnError(error))
    })

    child.on?.('close', (code, closeSignal) => {
      signal?.removeEventListener?.('abort', abort)
      flushProgressLine(stdoutLineBuffer, onProgress)
      flushProgressLine(stderrLineBuffer, onProgress)
      writeLog(
        logPath,
        onLog,
        now,
        `analyze-sgf closed with code ${code ?? 'null'}${
          closeSignal == null ? '' : ` and signal ${closeSignal}`
        }.`,
      )

      if (cancelled || signal?.aborted) {
        fail({code: 'cancelled', message: 'Analysis was cancelled.'})
        return
      }

      if (code !== 0) {
        fail({
          ...classifyProcessFailure(stderr, code, closeSignal),
          exitCode: code,
          signal: closeSignal,
          stderrLastLine: getProcessErrorMessage(stderr, code, closeSignal),
          logPath,
        })
        return
      }

      finish()
    })
  })
}

function emitLogChunk(logPath, onLog, now, streamName, text) {
  let lines = text.split(/\r?\n|\r/g).filter((line) => line.trim() !== '')
  for (let line of lines)
    writeLog(logPath, onLog, now, `${streamName}: ${line}`)
}

function writeLog(logPath, onLog, now, message) {
  let timestamp = normalizeDate(now()).toISOString()
  let line = `[${timestamp}] ${message}`

  appendLogLine(logPath, line)
  onLog(line)
}

function appendLogLine(logPath, line) {
  if (logPath == null || logPath === '') return

  let fd = null

  try {
    fd = openSync(
      logPath,
      constants.O_APPEND |
        constants.O_CREAT |
        constants.O_WRONLY |
        (constants.O_NOFOLLOW || 0),
      0o600,
    )
    writeFileSync(fd, `${line}\n`)
  } catch (err) {
    // Logging is diagnostic; analysis should continue if the log is unavailable.
  } finally {
    if (fd != null) closeSync(fd)
  }
}

function normalizeDate(value) {
  return value instanceof Date ? value : new Date(value)
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

function classifySpawnError(error) {
  if (error?.code === 'ENOENT') {
    return {
      code: 'analyze-sgf-not-found',
      message: 'analyze-sgf was not found.',
    }
  }

  return {
    code: 'spawn-failed',
    message: error?.message || 'Failed to start analyze-sgf.',
  }
}

function classifyProcessFailure(stderr, code, closeSignal) {
  let message = getProcessErrorMessage(stderr, code, closeSignal)
  let normalized = message.toLowerCase()

  if (
    /katago/.test(normalized) &&
    /no such file|not found|enoent/.test(normalized)
  ) {
    return {code: 'katago-not-found', message}
  }
  if (
    /model/.test(normalized) &&
    /no such file|not found|enoent/.test(normalized)
  ) {
    return {code: 'katago-model-not-found', message}
  }
  if (
    /config|cfg/.test(normalized) &&
    /no such file|not found|enoent/.test(normalized)
  ) {
    return {code: 'katago-config-not-found', message}
  }
  if (
    /commentstyle|language|annotationstyle|maxvariationsforeachmove|minwinratedropforvariations|unexpected token|json/.test(
      normalized,
    )
  ) {
    return {code: 'analyze-sgf-incompatible', message}
  }

  return {code: 'process-failed', message}
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

function addScoreLeadProperties(content) {
  let roots

  try {
    roots = sgf.parse(content)
  } catch (err) {
    return content
  }

  let changed = false

  for (let root of roots) {
    walkSgfNodes(root, (node) => {
      if (node.data?.SBKS != null) return

      let scoreLead = extractScoreLeadFromComment(node.data?.C?.[0])
      if (scoreLead == null) return

      node.data.SBKS = [formatScoreLeadProperty(scoreLead)]
      changed = true
    })
  }

  return changed ? sgf.stringify(roots, {linebreak: ''}) : content
}

function walkSgfNodes(node, callback) {
  callback(node)
  for (let child of node.children || []) walkSgfNodes(child, callback)
}

function extractScoreLeadFromComment(comment) {
  if (typeof comment !== 'string') return null

  let match = comment.match(
    /(?:Score estimé|Estimated score|Score lead)\s*:\s*([BW])\s*\+?(-?\d+(?:[.,]\d+)?)/i,
  )
  if (match == null) return null

  let value = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(value) || value < 0) return null

  return match[1].toUpperCase() === 'B' ? value : -value
}

function formatScoreLeadProperty(value) {
  return (Math.round(value * 100) / 100).toString()
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
  constructor({code, message, ...details}) {
    super(message)
    this.name = 'SgfAnalysisRunnerError'
    this.code = code
    for (let [key, value] of Object.entries(details)) {
      if (!(key in this)) this[key] = value
    }
  }
}

exports.runSgfAnalysis = runSgfAnalysis
exports.createDefaultGeneratedFileSuffix = createDefaultGeneratedFileSuffix
exports.getAnalyzeSgfGeneratedPath = getAnalyzeSgfGeneratedPath
exports.addScoreLeadProperties = addScoreLeadProperties
exports.extractScoreLeadFromComment = extractScoreLeadFromComment
exports.SgfAnalysisRunnerError = SgfAnalysisRunnerError
