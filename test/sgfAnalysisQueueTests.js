import assert from 'assert'

import {SgfAnalysisQueue} from '../src/modules/sgfanalysisqueue.js'

function deferred() {
  let resolve
  let reject
  let promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  return {promise, resolve, reject}
}

function createQueue({runner, nowValues = null} = {}) {
  let id = 0
  let nowIndex = 0
  let values = nowValues || [100, 101, 102, 103, 104, 105, 106]

  return new SgfAnalysisQueue({
    runner,
    createId: () => `job-${++id}`,
    now: () => values[nowIndex++] ?? values[values.length - 1],
  })
}

function request(overrides = {}) {
  return {
    sourcePath: '/tmp/source.sgf',
    outputPath: '/tmp/output.sgf',
    displayName: 'Game',
    config: {maxVisits: 100},
    ...overrides,
  }
}

describe('SGF analysis queue', () => {
  it('starts the first job immediately and completes it', async () => {
    let queue = createQueue({runner: async () => {}})
    let states = []
    queue.subscribe((state) => states.push(state))

    let job = queue.enqueue(request())
    await Promise.resolve()

    assert.strictEqual(job.id, 'job-1')
    assert.strictEqual(queue.getState().currentJob, null)
    assert.strictEqual(queue.getState().completedJobs[0].status, 'completed')
    assert.strictEqual(
      states.some((state) => state.currentJob?.status === 'running'),
      true,
    )
  })

  it('runs queued jobs sequentially', async () => {
    let first = deferred()
    let second = deferred()
    let calls = []
    let queue = createQueue({
      runner: ({inputPath}) => {
        calls.push(inputPath)
        return calls.length === 1 ? first.promise : second.promise
      },
    })

    queue.enqueue(
      request({sourcePath: '/tmp/1.sgf', outputPath: '/tmp/1.out.sgf'}),
    )
    queue.enqueue(
      request({sourcePath: '/tmp/2.sgf', outputPath: '/tmp/2.out.sgf'}),
    )

    assert.deepStrictEqual(calls, ['/tmp/1.sgf'])
    assert.strictEqual(queue.getState().queuedJobs.length, 1)

    first.resolve()
    await Promise.resolve()
    await Promise.resolve()

    assert.deepStrictEqual(calls, ['/tmp/1.sgf', '/tmp/2.sgf'])
    second.resolve()
    await Promise.resolve()
    await Promise.resolve()

    assert.deepStrictEqual(
      queue.getState().completedJobs.map((job) => job.status),
      ['completed', 'completed'],
    )
  })

  it('updates progress on the running job', async () => {
    let run = deferred()
    let emitProgress
    let queue = createQueue({
      runner: ({onProgress}) => {
        emitProgress = onProgress
        return run.promise
      },
    })

    queue.enqueue(request())
    emitProgress({progress: 50, currentMove: 10, totalMoves: 20, visits: 1600})

    assert.strictEqual(queue.getState().currentJob.progress, 50)
    assert.strictEqual(queue.getState().currentJob.currentMove, 10)

    run.resolve()
    await Promise.resolve()
  })

  it('ignores stale progress after advancing to the next job', async () => {
    let first = deferred()
    let second = deferred()
    let firstProgress
    let calls = 0
    let queue = createQueue({
      runner: ({onProgress}) => {
        calls++
        if (calls === 1) {
          firstProgress = onProgress
          return first.promise
        }

        return second.promise
      },
    })

    queue.enqueue(
      request({sourcePath: '/tmp/1.sgf', outputPath: '/tmp/1.out.sgf'}),
    )
    queue.enqueue(
      request({sourcePath: '/tmp/2.sgf', outputPath: '/tmp/2.out.sgf'}),
    )

    first.resolve()
    await Promise.resolve()
    await Promise.resolve()

    assert.strictEqual(queue.getState().currentJob.id, 'job-2')
    firstProgress({progress: 99, currentMove: 99})

    assert.strictEqual(queue.getState().currentJob.progress, 0)
    second.resolve()
    await Promise.resolve()
  })

  it('marks failed jobs and continues with the next job', async () => {
    let calls = 0
    let queue = createQueue({
      runner: async () => {
        calls++
        if (calls === 1) {
          let error = new Error('bad config')
          error.code = 'invalid-config'
          throw error
        }
      },
    })

    queue.enqueue(
      request({sourcePath: '/tmp/1.sgf', outputPath: '/tmp/1.out.sgf'}),
    )
    queue.enqueue(
      request({sourcePath: '/tmp/2.sgf', outputPath: '/tmp/2.out.sgf'}),
    )
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    assert.deepStrictEqual(
      queue
        .getState()
        .completedJobs.map((job) => [job.status, job.error?.code]),
      [
        ['failed', 'invalid-config'],
        ['completed', undefined],
      ],
    )
  })

  it('cancels the active job with AbortSignal', async () => {
    let run = deferred()
    let signal
    let queue = createQueue({
      runner: ({signal: runnerSignal}) => {
        signal = runnerSignal
        signal.addEventListener('abort', () => {
          let error = new Error('cancelled')
          error.code = 'cancelled'
          run.reject(error)
        })
        return run.promise
      },
    })

    let job = queue.enqueue(request())
    assert.strictEqual(queue.cancel(job.id), true)
    assert.strictEqual(signal.aborted, true)
    await Promise.resolve()
    await Promise.resolve()

    assert.strictEqual(queue.getState().completedJobs[0].status, 'cancelled')
  })

  it('keeps active jobs cancelled even if the runner resolves after abort', async () => {
    let run = deferred()
    let queue = createQueue({runner: () => run.promise})

    let job = queue.enqueue(request())
    assert.strictEqual(queue.cancel(job.id), true)
    run.resolve()
    await Promise.resolve()
    await Promise.resolve()

    assert.strictEqual(queue.getState().completedJobs[0].status, 'cancelled')
  })

  it('cancels queued jobs without running them', () => {
    let run = deferred()
    let calls = 0
    let queue = createQueue({
      runner: () => {
        calls++
        return run.promise
      },
    })

    queue.enqueue(
      request({sourcePath: '/tmp/1.sgf', outputPath: '/tmp/1.out.sgf'}),
    )
    let queued = queue.enqueue(
      request({sourcePath: '/tmp/2.sgf', outputPath: '/tmp/2.out.sgf'}),
    )

    assert.strictEqual(queue.cancel(queued.id), true)
    assert.strictEqual(calls, 1)
    assert.deepStrictEqual(queue.getState().queuedJobs, [])
    assert.strictEqual(queue.getState().completedJobs[0].status, 'cancelled')
  })

  it('does not expose mutable internal jobs', () => {
    let run = deferred()
    let queue = createQueue({runner: () => run.promise})

    queue.enqueue(request())

    let state = queue.getState()
    state.currentJob.config.maxVisits = 1

    assert.strictEqual(queue.getState().currentJob.config.maxVisits, 100)
  })

  it('sends isolated state clones to each subscriber', () => {
    let run = deferred()
    let queue = createQueue({runner: () => run.promise})
    let secondListenerValue = null

    queue.subscribe((state) => {
      if (state.currentJob != null) state.currentJob.config.maxVisits = 1
    })
    queue.subscribe((state) => {
      if (state.currentJob != null) {
        secondListenerValue = state.currentJob.config.maxVisits
      }
    })

    queue.enqueue(request())

    assert.strictEqual(secondListenerValue, 100)
  })
})
