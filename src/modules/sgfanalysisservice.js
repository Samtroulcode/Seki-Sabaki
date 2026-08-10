const {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require('fs')
const {basename, extname, join} = require('path')

const {
  createDefaultSgfAnalysisConfig,
  normalizeSgfAnalysisConfig,
  validateSgfAnalysisConfig,
} = require('./sgfanalysisconfig.js')
const {
  extractSgfAnalysisMetadata,
  getUniqueAnalysisOutputPath,
  listAnalyzedGames,
} = require('./sgfanalysisfiles.js')
const {SgfAnalysisQueue} = require('./sgfanalysisqueue.js')
const {runSgfAnalysis} = require('./sgfanalysisrunner.js')

const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024
const PER_JOB_OPTION_KEYS = [
  'inferGameSettingsFromSgf',
  'maxVisits',
  'rules',
  'komi',
  'commentStyle',
  'language',
  'annotationStyle',
  'maxVariationsForEachMove',
  'minWinrateDropForVariations',
]

class SgfAnalysisService {
  constructor({
    config = createDefaultSgfAnalysisConfig(),
    queue = null,
    runner = runSgfAnalysis,
    now = () => Date.now(),
    createId = null,
    fs = {},
  } = {}) {
    this.config = normalizeSgfAnalysisConfig(config)
    this.now = now
    this.createId =
      createId ||
      (() => `analysis-${this.now()}-${Math.random().toString(36).slice(2)}`)
    this.fs = {
      exists: fs.exists || existsSync,
      mkdir: fs.mkdir || ((path) => mkdirSync(path, {recursive: true})),
      readFile: fs.readFile || ((path) => readFileSync(path, 'utf8')),
      writeFile:
        fs.writeFile || ((path, content) => writeFileSync(path, content)),
      stat: fs.stat || statSync,
      unlink: fs.unlink || unlinkSync,
      listAnalyzedGames: fs.listAnalyzedGames || listAnalyzedGames,
    }
    this.tempSources = new Map()
    this.cleanedTempSources = new Set()
    this.queue =
      queue ||
      new SgfAnalysisQueue({
        runner,
        now,
        createId: this.createId,
      })

    this.unsubscribeQueue = this.queue.subscribe((state) => {
      this.cleanupCompletedTempSources(state.completedJobs)
    })
  }

  dispose() {
    this.unsubscribeQueue?.()
    this.unsubscribeQueue = null
  }

  getAnalysisState() {
    return this.queue.getState()
  }

  getConfig() {
    return {...this.config}
  }

  setConfig(config) {
    let nextConfig = {...this.config, ...config}
    let errors = this.validateConfig(nextConfig)
    if (errors.length > 0) throw new SgfAnalysisServiceError(errors[0])

    this.config = normalizeSgfAnalysisConfig(nextConfig)
    return this.getConfig()
  }

  validateConfig(config = this.config) {
    return validateSgfAnalysisConfig(config, {
      fileExists: this.fs.exists,
      directoryExists: (path) => {
        try {
          return this.fs.stat(path).isDirectory()
        } catch (err) {
          return false
        }
      },
    })
  }

  startAnalysis(request) {
    let config = {
      ...this.config,
      ...pickPerJobOptions(request?.options || {}),
    }
    let configErrors = this.validateConfig(config)
    if (configErrors.length > 0)
      throw new SgfAnalysisServiceError(configErrors[0])

    config = normalizeSgfAnalysisConfig(config)

    let jobId = this.createId()
    let logPath = this.getAnalysisLogPath(config, jobId)
    let source = this.prepareSource(request, config, jobId)
    config = applySgfGameSettings(config, source.metadata)
    let metadata = {...source.metadata, ...(request.metadata || {})}
    let outputPath = getUniqueAnalysisOutputPath(
      config.outputDirectory,
      metadata,
      {
        exists: (path) =>
          this.fs.exists(path) || this.isOutputPathReserved(path),
        now: new Date(this.now()),
      },
    )
    if (source.temporary) this.tempSources.set(jobId, source.path)

    let job

    try {
      job = this.queue.enqueue({
        id: jobId,
        sourcePath: source.path,
        outputPath,
        logPath,
        displayName: getAnalysisDisplayName(metadata, source.path),
        config,
      })
    } catch (err) {
      if (source.temporary) {
        this.tempSources.delete(jobId)
        this.cleanupTempSource(source.path)
      }

      throw err
    }

    return job
  }

  cancelAnalysis(jobId) {
    return this.queue.cancel(jobId)
  }

  subscribe(listener) {
    return this.queue.subscribe(listener)
  }

  refreshAnalyzedGames() {
    return this.getAnalyzedGames()
  }

  getAnalyzedGames() {
    if (this.config.outputDirectory === '') return []
    return this.fs.listAnalyzedGames(this.config.outputDirectory)
  }

  getAnalysisLogPath(config, jobId) {
    let logDirectory = join(config.outputDirectory, 'logs')
    this.fs.mkdir(logDirectory)
    return join(logDirectory, `${jobId}.log`)
  }

  prepareSource(request, config, jobId) {
    validateAnalysisRequest(request)

    if (request.source.type === 'file') return this.prepareFileSource(request)
    return this.prepareBoardSource(request, config, jobId)
  }

  prepareFileSource(request) {
    let path = request.source.path

    if (!this.fs.exists(path)) {
      throw new SgfAnalysisServiceError({
        code: 'source-not-found',
        message: 'Analysis source file was not found.',
      })
    }

    this.validateSourceFile(path)
    let content = this.readSourceContent(path)
    let metadata = extractSgfAnalysisMetadata(content)
    if (metadata == null) {
      throw new SgfAnalysisServiceError({
        code: 'invalid-sgf',
        message: 'Analysis source file is not valid SGF.',
      })
    }

    return {path, metadata, temporary: false}
  }

  prepareBoardSource(request, config, jobId) {
    let content = request.source.sgfContent
    if (content.length > MAX_SOURCE_FILE_BYTES) {
      throw new SgfAnalysisServiceError({
        code: 'source-too-large',
        message: 'Analysis source is too large.',
      })
    }

    let metadata = extractSgfAnalysisMetadata(content)
    if (metadata == null) {
      throw new SgfAnalysisServiceError({
        code: 'invalid-sgf',
        message: 'Current board SGF is not valid.',
      })
    }

    let tempDirectory = join(config.outputDirectory, 'tmp')
    this.fs.mkdir(tempDirectory)
    let sourcePath = join(tempDirectory, `${jobId}.sgf`)

    if (this.fs.exists(sourcePath)) {
      throw new SgfAnalysisServiceError({
        code: 'temp-source-exists',
        message: 'Temporary analysis source already exists.',
      })
    }

    this.fs.writeFile(sourcePath, content)

    return {path: sourcePath, metadata, temporary: true}
  }

  readSourceContent(path) {
    try {
      return this.fs.readFile(path)
    } catch (err) {
      throw new SgfAnalysisServiceError({
        code: 'source-read-failed',
        message: 'Analysis source file could not be read.',
      })
    }
  }

  validateSourceFile(path) {
    let extension = extname(path).toLowerCase()
    if (extension !== '.sgf' && extension !== '.rsgf') {
      throw new SgfAnalysisServiceError({
        code: 'unsupported-source-file',
        message: 'Analysis source must be an SGF file.',
      })
    }

    let stat

    try {
      stat = this.fs.stat(path)
    } catch (err) {
      throw new SgfAnalysisServiceError({
        code: 'source-not-found',
        message: 'Analysis source file was not found.',
      })
    }

    if (!stat.isFile()) {
      throw new SgfAnalysisServiceError({
        code: 'unsupported-source-file',
        message: 'Analysis source must be a regular SGF file.',
      })
    }

    if (stat.size > MAX_SOURCE_FILE_BYTES) {
      throw new SgfAnalysisServiceError({
        code: 'source-too-large',
        message: 'Analysis source file is too large.',
      })
    }
  }

  cleanupCompletedTempSources(completedJobs) {
    for (let job of completedJobs) {
      let sourcePath = this.tempSources.get(job.id)
      if (sourcePath == null || this.cleanedTempSources.has(job.id)) continue

      this.cleanupTempSource(sourcePath)

      this.cleanedTempSources.add(job.id)
      this.tempSources.delete(job.id)
    }
  }

  cleanupTempSource(sourcePath) {
    try {
      this.fs.unlink(sourcePath)
    } catch (err) {}
  }

  isOutputPathReserved(path) {
    let state = this.queue.getState()
    let reserved = [state.currentJob, ...state.queuedJobs]

    return reserved.some((job) => job?.outputPath === path)
  }
}

function validateAnalysisRequest(request) {
  if (request == null || typeof request !== 'object') {
    throw new SgfAnalysisServiceError({
      code: 'invalid-request',
      message: 'Analysis request is invalid.',
    })
  }

  if (request.source?.type === 'file') {
    if (typeof request.source.path === 'string' && request.source.path !== '') {
      return
    }

    throw new SgfAnalysisServiceError({
      code: 'invalid-source',
      message: 'Analysis source file path is invalid.',
    })
  }

  if (request.source?.type === 'board') {
    if (
      typeof request.source.sgfContent === 'string' &&
      request.source.sgfContent !== ''
    ) {
      return
    }

    throw new SgfAnalysisServiceError({
      code: 'invalid-source',
      message: 'Current board SGF content is invalid.',
    })
  }

  throw new SgfAnalysisServiceError({
    code: 'invalid-source',
    message: 'Analysis source type is invalid.',
  })
}

function getAnalysisDisplayName(metadata, sourcePath) {
  return (
    metadata.name ||
    metadata.gameName ||
    [metadata.blackPlayer, metadata.whitePlayer].filter(Boolean).join(' vs ') ||
    basename(sourcePath)
  )
}

function pickPerJobOptions(options) {
  let result = {}

  for (let key of PER_JOB_OPTION_KEYS) {
    if (key in options) result[key] = options[key]
  }

  return result
}

class SgfAnalysisServiceError extends Error {
  constructor({code, message}) {
    super(message)
    this.name = 'SgfAnalysisServiceError'
    this.code = code
  }
}

function applySgfGameSettings(config, metadata = {}) {
  if (config.inferGameSettingsFromSgf !== true) return config

  let inferred = {}
  if (Number.isFinite(metadata.komi)) inferred.komi = metadata.komi
  if (typeof metadata.rules === 'string' && metadata.rules !== '') {
    inferred.rules = metadata.rules
  }

  return Object.keys(inferred).length === 0 ? config : {...config, ...inferred}
}

exports.SgfAnalysisService = SgfAnalysisService
exports.applySgfGameSettings = applySgfGameSettings
exports.SgfAnalysisServiceError = SgfAnalysisServiceError
