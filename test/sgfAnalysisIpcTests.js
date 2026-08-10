import assert from 'assert'

import {
  createSgfAnalysisService,
  filterUserSgfAnalysisConfig,
  parseKatagoArgumentPath,
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

  it('returns selected analysis file and configuration paths', async () => {
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

    dialog.showOpenDialog = async (win, options) => {
      calls.push(options)
      return {canceled: false, filePaths: ['/usr/bin/katago']}
    }
    assert.strictEqual(
      await handlers['analysis:selectKatagoExecutable']({sender: {}}),
      '/usr/bin/katago',
    )

    dialog.showOpenDialog = async (win, options) => {
      calls.push(options)
      return {canceled: false, filePaths: ['/models/model.bin.gz']}
    }
    assert.strictEqual(
      await handlers['analysis:selectKatagoModel']({sender: {}}),
      '/models/model.bin.gz',
    )

    dialog.showOpenDialog = async (win, options) => {
      calls.push(options)
      return {canceled: false, filePaths: ['/configs/analysis.cfg']}
    }
    assert.strictEqual(
      await handlers['analysis:selectKatagoConfig']({sender: {}}),
      '/configs/analysis.cfg',
    )
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

  it('only shows known analysis logs in folder', async () => {
    let shown = []
    let handlers = setup({
      service: createService({
        getAnalysisState: () => ({
          currentJob: {id: 'job-1', logPath: '/analysis/logs/job-1.log'},
          queuedJobs: [],
          completedJobs: [],
        }),
      }),
      shell: {showItemInFolder: (path) => shown.push(path)},
    })

    assert.strictEqual(
      await handlers['analysis:showLogInFolder'](
        {},
        '/analysis/logs/job-1.log',
      ),
      true,
    )
    assert.strictEqual(
      await handlers['analysis:showLogInFolder']({}, '/etc/passwd'),
      false,
    )
    assert.deepStrictEqual(shown, ['/analysis/logs/job-1.log'])
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
        katagoModelPath: '/models/model.bin.gz',
        katagoConfigPath: '/configs/analysis.cfg',
        katagoArguments: 'ignored',
        outputDirectory: '/analysis',
        inferGameSettingsFromSgf: false,
        maxVisits: 1,
        language: 'fr',
        commentStyle: 'compact',
        analyzeSgfArgs: ['/tmp/evil.js'],
      }),
      {
        katagoPath: '/usr/bin/katago',
        katagoModelPath: '/models/model.bin.gz',
        katagoConfigPath: '/configs/analysis.cfg',
        outputDirectory: '/analysis',
        inferGameSettingsFromSgf: false,
        maxVisits: 1,
        language: 'fr',
        commentStyle: 'compact',
      },
    )
  })

  it('initializes and persists user analysis settings', () => {
    let values = {
      'analysis.katago_path': '/bin/sh',
      'analysis.katago_model_path': '/bin/sh',
      'analysis.katago_config_path': '/bin/sh',
      'analysis.output_directory': '/tmp',
      'analysis.infer_game_settings_from_sgf': true,
      'analysis.max_visits': 800,
      'analysis.rules': 'japanese',
      'analysis.komi': 6.5,
      'analysis.comment_style': 'compact',
      'analysis.language': 'fr',
      'analysis.annotation_style': 'classification',
      'analysis.max_variations_for_each_move': 3,
      'analysis.min_winrate_drop_for_variations': 2,
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
        katagoModelPath: '/bin/sh',
        katagoConfigPath: '/bin/sh',
        outputDirectory: '/tmp',
        inferGameSettingsFromSgf: false,
        maxVisits: 800,
        rules: 'japanese',
        komi: 6.5,
        commentStyle: 'compact',
        language: 'fr',
        annotationStyle: 'classification',
        maxVariationsForEachMove: 3,
        minWinrateDropForVariations: 2,
      },
    )

    assert.notStrictEqual(service.getConfig().analyzeSgfPath, '/tmp/ignored')
    assert.deepStrictEqual(setCalls, [
      ['analysis.katago_path', '/bin/sh'],
      ['analysis.katago_model_path', '/bin/sh'],
      ['analysis.katago_config_path', '/bin/sh'],
      ['analysis.output_directory', '/tmp'],
      ['analysis.infer_game_settings_from_sgf', false],
      ['analysis.max_visits', 800],
      ['analysis.rules', 'japanese'],
      ['analysis.komi', 6.5],
      ['analysis.comment_style', 'compact'],
      ['analysis.language', 'fr'],
      ['analysis.annotation_style', 'classification'],
      ['analysis.max_variations_for_each_move', 3],
      ['analysis.min_winrate_drop_for_variations', 2],
    ])
  })

  it('migrates existing raw KataGo arguments into model and config paths', () => {
    assert.strictEqual(
      parseKatagoArgumentPath(
        'analysis -model "/models/model path.bin.gz" -config /configs/analysis.cfg',
        'model',
      ),
      '/models/model path.bin.gz',
    )
    assert.strictEqual(
      parseKatagoArgumentPath(
        'analysis -model "/models/model path.bin.gz" -config /configs/analysis.cfg',
        'config',
      ),
      '/configs/analysis.cfg',
    )
  })
})
