import assert from 'assert'

import {
  createSgfAnalysisService,
  filterUserSgfAnalysisConfig,
  setupSgfAnalysisIpcHandlers,
} from '../src/sgfanalysis.js'

function setup({
  service,
  dialog = null,
  shell = null,
  setting = null,
  sendStateChange = null,
}) {
  let handlers = {}
  let ipcMain = {
    handle: (name, handler) => {
      handlers[name] = handler
    },
  }

  setupSgfAnalysisIpcHandlers(ipcMain, service, {
    dialog,
    shell,
    setting,
    sendStateChange,
  })

  return handlers
}

function createService(overrides = {}) {
  let state = {currentJob: null, queuedJobs: [], completedJobs: []}
  let config = {outputDirectory: '/analysis'}
  let games = [{path: '/analysis/game.sgf', gameName: 'Game'}]
  let callbacks = []

  return {
    getAnalysisState: () => state,
    getConfig: () => config,
    setConfig: (next) => {
      config = {...config, ...next}
      return config
    },
    getAnalyzedGames: () => games,
    refreshAnalyzedGames: () => games,
    startAnalysis: (request) => ({id: 'job-1', request}),
    cancelAnalysis: () => true,
    subscribe: (callback) => {
      callbacks.push(callback)
      return () => callbacks.splice(callbacks.indexOf(callback), 1)
    },
    emit: (nextState) => callbacks.forEach((callback) => callback(nextState)),
    ...overrides,
  }
}

describe('SGF analysis IPC handlers', () => {
  it('exposes state, config, and analyzed games', async () => {
    let service = createService()
    let handlers = setup({service})

    assert.deepStrictEqual(await handlers['analysis:getState'](), {
      currentJob: null,
      queuedJobs: [],
      completedJobs: [],
    })
    assert.deepStrictEqual(await handlers['analysis:getConfig'](), {
      outputDirectory: '/analysis',
    })
    assert.deepStrictEqual(await handlers['analysis:listAnalyzedGames'](), [
      {path: '/analysis/game.sgf', gameName: 'Game'},
    ])
    assert.deepStrictEqual(await handlers['analysis:refreshAnalyzedGames'](), [
      {path: '/analysis/game.sgf', gameName: 'Game'},
    ])
  })

  it('wraps start, cancel, and config errors', async () => {
    let service = createService({
      startAnalysis: () => {
        let error = new Error('Invalid SGF')
        error.code = 'invalid-sgf'
        throw error
      },
      setConfig: () => {
        let error = new Error('Bad config')
        error.code = 'invalid-config'
        throw error
      },
      cancelAnalysis: () => false,
    })
    let handlers = setup({service})

    assert.deepStrictEqual(await handlers['analysis:start']({}, {}), {
      ok: false,
      error: {code: 'invalid-sgf', message: 'Invalid SGF'},
      state: {currentJob: null, queuedJobs: [], completedJobs: []},
    })
    assert.deepStrictEqual(await handlers['analysis:setConfig']({}, {}), {
      ok: false,
      error: {code: 'invalid-config', message: 'Bad config'},
    })
    assert.deepStrictEqual(await handlers['analysis:cancel']({}, 'missing'), {
      ok: false,
      state: {currentJob: null, queuedJobs: [], completedJobs: []},
    })
  })

  it('returns selected file and output directory paths', async () => {
    let calls = []
    let dialog = {
      showOpenDialog: async (win, options) => {
        calls.push(options)
        return {canceled: false, filePaths: ['/tmp/game.sgf']}
      },
    }
    let handlers = setup({service: createService(), dialog})

    assert.strictEqual(
      await handlers['analysis:selectInputFile']({sender: {}}),
      '/tmp/game.sgf',
    )
    assert.deepStrictEqual(calls[0].filters, [
      {name: 'SGF Files', extensions: ['sgf', 'rsgf']},
    ])

    dialog.showOpenDialog = async (win, options) => {
      calls.push(options)
      return {canceled: false, filePaths: ['/tmp/out']}
    }

    assert.strictEqual(
      await handlers['analysis:selectOutputDirectory']({sender: {}}),
      '/tmp/out',
    )
    assert.deepStrictEqual(calls[1].properties, [
      'openDirectory',
      'createDirectory',
    ])
  })

  it('only shows known analyzed games in folder', async () => {
    let shown = []
    let handlers = setup({
      service: createService(),
      shell: {showItemInFolder: (path) => shown.push(path)},
    })

    assert.strictEqual(
      await handlers['analysis:showInFolder']({}, '/analysis/game.sgf'),
      true,
    )
    assert.strictEqual(
      await handlers['analysis:showInFolder']({}, '/etc/passwd'),
      false,
    )
    assert.deepStrictEqual(shown, ['/analysis/game.sgf'])
  })

  it('only opens known analyzed games', async () => {
    let sent = []
    let handlers = setup({service: createService()})
    let evt = {sender: {send: (...args) => sent.push(args)}}

    assert.strictEqual(
      await handlers['analysis:openAnalyzedGame'](evt, '/analysis/game.sgf'),
      true,
    )
    assert.strictEqual(
      await handlers['analysis:openAnalyzedGame'](evt, '/etc/passwd'),
      false,
    )
    assert.deepStrictEqual(sent, [['load-file', '/analysis/game.sgf']])
  })

  it('coalesces state-change notifications', async () => {
    let states = []
    let service = createService()

    setup({service, sendStateChange: (state) => states.push(state)})

    service.emit({currentJob: {id: 'first'}})
    service.emit({currentJob: {id: 'last'}})
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.deepStrictEqual(states, [{currentJob: {id: 'last'}}])
  })

  it('filters renderer config to user-owned settings', () => {
    assert.deepStrictEqual(
      filterUserSgfAnalysisConfig({
        analyzeSgfPath: '/tmp/evil',
        katagoPath: '/usr/bin/katago',
        katagoArguments: 'analysis',
        outputDirectory: '/analysis',
        maxVisits: 1,
      }),
      {
        katagoPath: '/usr/bin/katago',
        katagoArguments: 'analysis',
        outputDirectory: '/analysis',
      },
    )
  })

  it('initializes and persists user analysis settings', () => {
    let values = {
      'analysis.katago_path': '/bin/sh',
      'analysis.katago_arguments': 'analysis -model model.bin.gz',
      'analysis.output_directory': '/tmp',
    }
    let setCalls = []
    let setting = {
      get: (key) => values[key],
      set: (key, value) => {
        setCalls.push([key, value])
        values[key] = value
        return setting
      },
    }

    let service = createSgfAnalysisService({
      app: {isPackaged: false},
      setting,
    })

    assert.strictEqual(service.getConfig().katagoPath, '/bin/sh')

    let handlers = setup({service, dialog: null, shell: null, setting})
    handlers['analysis:setConfig'](
      {},
      {
        analyzeSgfPath: '/tmp/ignored',
        katagoPath: '/bin/sh',
        katagoArguments: 'analysis -model next.bin.gz',
        outputDirectory: '/tmp',
      },
    )

    assert.strictEqual(service.getConfig().analyzeSgfPath, 'analyze-sgf')
    assert.deepStrictEqual(setCalls, [
      ['analysis.katago_path', '/bin/sh'],
      ['analysis.katago_arguments', 'analysis -model next.bin.gz'],
      ['analysis.output_directory', '/tmp'],
    ])
  })
})
