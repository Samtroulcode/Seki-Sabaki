import assert from 'assert'

import {AnalysisStore} from '../src/modules/analysisstore.js'

function createAnalysisApi(overrides = {}) {
  let stateChangeCallback = null
  let analysisState = {
    currentJob: null,
    queuedJobs: [],
    completedJobs: [],
  }
  let config = {
    analyzeSgfPath: 'analyze-sgf',
    analyzeSgfStatus: 'path',
    katagoPath: '',
    katagoModelPath: '',
    katagoConfigPath: '',
    katagoArguments: 'analysis',
    outputDirectory: '',
    maxVisits: 1600,
    rules: 'tromp-taylor',
    komi: 7.5,
  }
  let analyzedGames = []

  return {
    get stateChangeCallback() {
      return stateChangeCallback
    },
    getState: async () => analysisState,
    getConfig: async () => config,
    listAnalyzedGames: async () => analyzedGames,
    refreshAnalyzedGames: async () => analyzedGames,
    selectInputFile: async () => '/tmp/game.sgf',
    selectOutputDirectory: async () => '/tmp/analysis',
    selectKatagoExecutable: async () => '/usr/bin/katago',
    selectKatagoModel: async () => '/models/model.bin.gz',
    selectKatagoConfig: async () => '/configs/analysis.cfg',
    setConfig: async (nextConfig) => {
      config = nextConfig
      return {ok: true, config}
    },
    start: async (request) => {
      analysisState = {
        currentJob: {
          id: 'job-1',
          status: 'running',
          progress: 0,
          sourcePath: request.source.path,
        },
        queuedJobs: [],
        completedJobs: [],
      }

      return {ok: true, job: analysisState.currentJob, state: analysisState}
    },
    cancel: async () => {
      analysisState = {
        currentJob: null,
        queuedJobs: [],
        completedJobs: [],
      }

      return {ok: true, state: analysisState}
    },
    showInFolder: async () => true,
    openAnalyzedGame: async () => true,
    onStateChange: (callback) => {
      stateChangeCallback = callback
      return () => {
        stateChangeCallback = null
      }
    },
    ...overrides,
  }
}

describe('AnalysisStore', () => {
  it('initializes state and subscribes to analysis state changes', async () => {
    let api = createAnalysisApi()
    let store = new AnalysisStore({analysis: () => api})
    let changes = []
    store.subscribe((state) => changes.push(state))

    await store.initialize()

    assert.strictEqual(typeof api.stateChangeCallback, 'function')
    assert.strictEqual(store.getState().config.maxVisits, 1600)
    assert.strictEqual(store.getState().configDirty, false)

    api.stateChangeCallback({
      currentJob: {id: 'job-1', status: 'running'},
      queuedJobs: [],
      completedJobs: [],
    })

    assert.strictEqual(store.getState().analysisState.currentJob.id, 'job-1')
    assert.strictEqual(changes.length > 0, true)

    store.dispose()
    assert.strictEqual(api.stateChangeCallback, null)
  })

  it('selects an SGF file and starts analysis from that path', async () => {
    let receivedRequest = null
    let api = createAnalysisApi({
      start: async (request) => {
        receivedRequest = request

        return {
          ok: true,
          job: {id: 'job-1'},
          state: {
            currentJob: {id: 'job-1', sourcePath: request.source.path},
            queuedJobs: [],
            completedJobs: [],
          },
        }
      },
    })
    let store = new AnalysisStore({analysis: () => api})

    await store.selectInputFile()
    await store.startAnalysis()

    assert.deepStrictEqual(receivedRequest, {
      source: {type: 'file', path: '/tmp/game.sgf'},
    })
    assert.strictEqual(store.getState().analysisState.currentJob.id, 'job-1')
  })

  it('edits draft settings and starts only after applying them', async () => {
    let receivedRequest = null
    let api = createAnalysisApi({
      start: async (request) => {
        receivedRequest = request

        return {
          ok: true,
          job: {id: 'job-1'},
          state: {currentJob: null, queuedJobs: [], completedJobs: []},
        }
      },
    })
    let store = new AnalysisStore({analysis: () => api})

    await store.initialize()
    store.setSelectedInputPath('/tmp/game.sgf')
    store.updateConfigDraft({katagoPath: '/usr/bin/katago'})

    assert.strictEqual(store.getState().configDirty, true)
    assert.strictEqual(await store.startAnalysis(), null)
    assert.strictEqual(receivedRequest, null)

    await store.applyConfig()
    await store.startAnalysis()

    assert.deepStrictEqual(receivedRequest, {
      source: {type: 'file', path: '/tmp/game.sgf'},
    })
  })

  it('updates output directory draft and refreshes results after apply', async () => {
    let refreshed = false
    let api = createAnalysisApi({
      listAnalyzedGames: async () => [{path: '/old/game.sgf'}],
      refreshAnalyzedGames: async () => {
        refreshed = true
        return [{path: '/tmp/analysis/game.sgf'}]
      },
    })
    let store = new AnalysisStore({analysis: () => api})

    await store.initialize()
    await store.selectOutputDirectory()

    assert.strictEqual(
      store.getState().draftConfig.outputDirectory,
      '/tmp/analysis',
    )
    assert.strictEqual(store.getState().configDirty, true)
    assert.strictEqual(refreshed, false)

    await store.applyConfig()

    assert.strictEqual(store.getState().config.outputDirectory, '/tmp/analysis')
    assert.strictEqual(refreshed, true)
    assert.deepStrictEqual(store.getState().analyzedGames, [
      {path: '/tmp/analysis/game.sgf'},
    ])
  })

  it('selects KataGo executable, model, and config into draft settings', async () => {
    let store = new AnalysisStore({analysis: () => createAnalysisApi()})

    await store.initialize()
    await store.selectKatagoExecutable()
    await store.selectKatagoModel()
    await store.selectKatagoConfig()

    assert.strictEqual(
      store.getState().draftConfig.katagoPath,
      '/usr/bin/katago',
    )
    assert.strictEqual(
      store.getState().draftConfig.katagoModelPath,
      '/models/model.bin.gz',
    )
    assert.strictEqual(
      store.getState().draftConfig.katagoConfigPath,
      '/configs/analysis.cfg',
    )
    assert.strictEqual(store.getState().configDirty, true)
  })

  it('reverts draft settings', async () => {
    let store = new AnalysisStore({analysis: () => createAnalysisApi()})

    await store.initialize()
    store.updateConfigDraft({katagoPath: '/tmp/katago'})

    assert.strictEqual(store.getState().configDirty, true)

    store.resetConfigDraft()

    assert.strictEqual(store.getState().draftConfig.katagoPath, '')
    assert.strictEqual(store.getState().configDirty, false)
  })

  it('keeps dirty draft settings across refreshes', async () => {
    let config = {
      analyzeSgfPath: 'analyze-sgf',
      analyzeSgfStatus: 'path',
      katagoPath: '',
      katagoModelPath: '',
      katagoConfigPath: '',
      katagoArguments: 'analysis',
      outputDirectory: '',
      maxVisits: 1600,
      rules: 'tromp-taylor',
      komi: 7.5,
    }
    let api = createAnalysisApi({
      getConfig: async () => config,
    })
    let store = new AnalysisStore({analysis: () => api})

    await store.initialize()
    store.updateConfigDraft({katagoPath: '/tmp/katago'})

    config = {...config, outputDirectory: '/tmp/analysis'}
    await store.refresh()

    assert.strictEqual(store.getState().draftConfig.katagoPath, '/tmp/katago')
    assert.strictEqual(store.getState().config.outputDirectory, '/tmp/analysis')
    assert.strictEqual(store.getState().configDirty, true)
  })

  it('stores command errors for display', async () => {
    let api = createAnalysisApi({
      start: async () => ({
        ok: false,
        error: {message: 'KataGo executable was not found.'},
        state: {currentJob: null, queuedJobs: [], completedJobs: []},
      }),
    })
    let store = new AnalysisStore({analysis: () => api})

    store.setSelectedInputPath('/tmp/game.sgf')
    await store.startAnalysis()

    assert.strictEqual(
      store.getState().error,
      'KataGo executable was not found.',
    )
  })
})
