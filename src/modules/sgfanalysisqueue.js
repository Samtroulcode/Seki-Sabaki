const {runSgfAnalysis} = require('./sgfanalysisrunner.js')

class SgfAnalysisQueue {
  constructor({
    runner = runSgfAnalysis,
    now = () => Date.now(),
    createId = null,
  } = {}) {
    this.runner = runner
    this.now = now
    this.createId =
      createId ||
      (() => `analysis-${this.now()}-${Math.random().toString(36).slice(2)}`)
    this.currentJob = null
    this.queuedJobs = []
    this.completedJobs = []
    this.listeners = new Set()
    this.currentAbortController = null
  }

  getState() {
    return cloneQueueState({
      currentJob: this.currentJob,
      queuedJobs: this.queuedJobs,
      completedJobs: this.completedJobs,
    })
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  enqueue(request) {
    let job = createQueuedJob(request, {
      id: this.createId(),
      createdAt: this.now(),
    })

    this.queuedJobs.push(job)
    this.emitChange()
    this.runNext()

    return cloneJob(job)
  }

  cancel(jobId) {
    if (this.currentJob?.id === jobId) {
      if (this.currentJob.status !== 'cancelling') {
        this.currentJob = {...this.currentJob, status: 'cancelling'}
        this.emitChange()
        this.currentAbortController?.abort()
      }

      return true
    }

    let index = this.queuedJobs.findIndex((job) => job.id === jobId)
    if (index === -1) return false

    let [job] = this.queuedJobs.splice(index, 1)
    this.completedJobs.push({
      ...job,
      status: 'cancelled',
      completedAt: this.now(),
    })
    this.emitChange()

    return true
  }

  emitChange() {
    for (let listener of this.listeners) listener(this.getState())
  }

  async runNext() {
    if (this.currentJob != null || this.queuedJobs.length === 0) return

    let job = this.queuedJobs.shift()
    let abortController = new AbortController()
    this.currentAbortController = abortController
    this.currentJob = {
      ...job,
      status: 'running',
      startedAt: this.now(),
    }
    this.emitChange()
    let jobId = this.currentJob.id

    try {
      await this.runner({
        inputPath: this.currentJob.sourcePath,
        outputPath: this.currentJob.outputPath,
        config: this.currentJob.config,
        logPath: this.currentJob.logPath,
        signal: abortController.signal,
        onProgress: (progress) => this.applyProgress(jobId, progress),
        onLog: (line) => this.applyLog(jobId, line),
      })

      this.completeCurrentJob({
        status: abortController.signal.aborted ? 'cancelled' : 'completed',
        error: null,
      })
    } catch (error) {
      this.completeCurrentJob({
        status:
          abortController.signal.aborted || error?.code === 'cancelled'
            ? 'cancelled'
            : 'failed',
        error: serializeQueueError(error),
      })
    } finally {
      this.currentAbortController = null
      this.currentJob = null
      this.emitChange()
      this.runNext()
    }
  }

  applyProgress(jobId, progress) {
    if (this.currentJob?.id !== jobId) return

    this.currentJob = {...this.currentJob, ...progress}
    this.emitChange()
  }

  applyLog(jobId, line) {
    if (this.currentJob?.id !== jobId || typeof line !== 'string') return

    let logTail = [...(this.currentJob.logTail || []), line].slice(-20)
    this.currentJob = {...this.currentJob, logTail, lastLogAt: this.now()}
    this.emitChange()
  }

  completeCurrentJob(change) {
    if (this.currentJob == null) return

    this.completedJobs.push({
      ...this.currentJob,
      ...change,
      completedAt: this.now(),
    })
  }
}

exports.SgfAnalysisQueue = SgfAnalysisQueue

function createQueuedJob(request, {id, createdAt}) {
  validateAnalysisQueueRequest(request)

  return {
    id: request.id || id,
    status: 'queued',
    sourcePath: request.sourcePath,
    outputPath: request.outputPath,
    logPath: request.logPath || null,
    displayName: request.displayName || request.sourcePath,
    config: request.config || {},
    progress: 0,
    currentMove: 0,
    totalMoves: 0,
    visits: 0,
    createdAt,
    startedAt: null,
    completedAt: null,
    error: null,
    logTail: [],
    lastLogAt: null,
  }
}

function validateAnalysisQueueRequest(request) {
  if (request == null || typeof request !== 'object') {
    throw new TypeError('Analysis queue request must be an object.')
  }

  if (typeof request.sourcePath !== 'string' || request.sourcePath === '') {
    throw new TypeError('Analysis source path is required.')
  }

  if (typeof request.outputPath !== 'string' || request.outputPath === '') {
    throw new TypeError('Analysis output path is required.')
  }
}

function serializeQueueError(error) {
  return {
    code: typeof error?.code === 'string' ? error.code : 'analysis-failed',
    message:
      typeof error?.message === 'string' && error.message !== ''
        ? error.message
        : 'Analysis failed.',
    exitCode: error?.exitCode,
    signal: error?.signal,
    stderrLastLine: error?.stderrLastLine,
    logPath: error?.logPath,
  }
}

function cloneQueueState(state) {
  return {
    currentJob: cloneJob(state.currentJob),
    queuedJobs: state.queuedJobs.map(cloneJob),
    completedJobs: state.completedJobs.map(cloneJob),
  }
}

function cloneJob(job) {
  if (job == null) return null

  return {
    ...job,
    config: cloneObject(job.config),
    error: cloneObject(job.error),
  }
}

function cloneObject(value) {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneObject)

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneObject(child)]),
  )
}
