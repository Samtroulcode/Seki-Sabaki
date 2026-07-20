import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import {basename, join} from 'path'

import {
  createDefaultSgfAnalysisConfig,
  normalizeSgfAnalysisConfig,
  validateSgfAnalysisConfig,
} from './sgfanalysisconfig.js'
import {
  extractSgfAnalysisMetadata,
  getUniqueAnalysisOutputPath,
  listAnalyzedGames,
} from './sgfanalysisfiles.js'
import {SgfAnalysisQueue} from './sgfanalysisqueue.js'
import {runSgfAnalysis} from './sgfanalysisrunner.js'

export class SgfAnalysisService {
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
    let nextConfig = normalizeSgfAnalysisConfig({...this.config, ...config})
    let errors = this.validateConfig(nextConfig)
    if (errors.length > 0) throw new SgfAnalysisServiceError(errors[0])

    this.config = nextConfig
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
    let config = normalizeSgfAnalysisConfig({
      ...this.config,
      ...(request?.options || {}),
    })
    let configErrors = this.validateConfig(config)
    if (configErrors.length > 0)
      throw new SgfAnalysisServiceError(configErrors[0])

    let jobId = this.createId()
    let source = this.prepareSource(request, config, jobId)
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

  refreshAnalyzedGames() {
    return this.getAnalyzedGames()
  }

  getAnalyzedGames() {
    if (this.config.outputDirectory === '') return []
    return this.fs.listAnalyzedGames(this.config.outputDirectory)
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

export class SgfAnalysisServiceError extends Error {
  constructor({code, message}) {
    super(message)
    this.name = 'SgfAnalysisServiceError'
    this.code = code
  }
}
