const {resolve} = require('path')
const {BrowserWindow} = require('electron')

const {SgfAnalysisService} = require('./modules/sgfanalysisservice.js')
const {
  getAnalyzeSgfStatus,
  resolveAnalyzeSgfPath,
} = require('./sgfanalysisbinary.js')

const USER_CONFIG_KEYS = [
  'katagoPath',
  'katagoModelPath',
  'katagoConfigPath',
  'outputDirectory',
]

function setupSgfAnalysisIpcHandlers(
  ipcMain,
  service = null,
  {
    app = null,
    dialog = null,
    shell = null,
    setting = null,
    sendStateChange = null,
  } = {},
) {
  if (service == null) service = createSgfAnalysisService({app, setting})

  if (typeof sendStateChange === 'function') {
    let scheduledStateChange = false
    let latestState = null

    service.subscribe?.((state) => {
      latestState = state

      if (scheduledStateChange) return
      scheduledStateChange = true

      setTimeout(() => {
        scheduledStateChange = false
        let state = latestState
        latestState = null
        sendStateChange(state)
      }, 0)
    })
  }

  ipcMain.handle('analysis:getState', () => service.getAnalysisState())
  ipcMain.handle('analysis:getConfig', () => service.getConfig())
  ipcMain.handle('analysis:listAnalyzedGames', () => service.getAnalyzedGames())
  ipcMain.handle('analysis:refreshAnalyzedGames', () =>
    service.refreshAnalyzedGames(),
  )

  ipcMain.handle('analysis:setConfig', (evt, config) => {
    try {
      let nextConfig = service.setConfig(
        filterUserSgfAnalysisConfig(config || {}),
      )
      persistUserSgfAnalysisConfig(setting, nextConfig)

      return {ok: true, config: nextConfig}
    } catch (err) {
      return {ok: false, error: serializeError(err)}
    }
  })

  ipcMain.handle('analysis:start', (evt, request) => {
    try {
      let job = service.startAnalysis(request || {})
      return {ok: true, job, state: service.getAnalysisState()}
    } catch (err) {
      return {
        ok: false,
        error: serializeError(err),
        state: service.getAnalysisState(),
      }
    }
  })

  ipcMain.handle('analysis:cancel', (evt, jobId) => {
    try {
      return {
        ok: service.cancelAnalysis(jobId),
        state: service.getAnalysisState(),
      }
    } catch (err) {
      return {
        ok: false,
        error: serializeError(err),
        state: service.getAnalysisState(),
      }
    }
  })

  ipcMain.handle('analysis:selectInputFile', async (evt) => {
    if (dialog == null) return null

    let result = await dialog.showOpenDialog(getWindow(evt), {
      properties: ['openFile'],
      filters: [{name: 'SGF Files', extensions: ['sgf', 'rsgf']}],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('analysis:selectOutputDirectory', async (evt) => {
    if (dialog == null) return null

    let result = await dialog.showOpenDialog(getWindow(evt), {
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('analysis:selectKatagoExecutable', async (evt) => {
    if (dialog == null) return null

    let result = await dialog.showOpenDialog(getWindow(evt), {
      properties: ['openFile'],
      filters: [{name: 'KataGo Executable', extensions: ['*']}],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('analysis:selectKatagoModel', async (evt) => {
    if (dialog == null) return null

    let result = await dialog.showOpenDialog(getWindow(evt), {
      properties: ['openFile'],
      filters: [
        {name: 'KataGo Models', extensions: ['bin', 'gz', 'txt']},
        {name: 'All Files', extensions: ['*']},
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('analysis:selectKatagoConfig', async (evt) => {
    if (dialog == null) return null

    let result = await dialog.showOpenDialog(getWindow(evt), {
      properties: ['openFile'],
      filters: [
        {name: 'KataGo Config', extensions: ['cfg', 'conf', 'txt']},
        {name: 'All Files', extensions: ['*']},
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('analysis:showInFolder', (evt, path) => {
    if (shell == null || !isKnownAnalyzedGamePath(service, path)) return false

    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle('analysis:showLogInFolder', (evt, path) => {
    if (shell == null || !isKnownAnalysisLogPath(service, path)) return false

    shell.showItemInFolder(path)
    return true
  })

  ipcMain.handle('analysis:openAnalyzedGame', (evt, path) => {
    if (!isKnownAnalyzedGamePath(service, path)) return false

    evt.sender.send('load-file', path)
    return true
  })

  return service
}

function createSgfAnalysisService({app = null, setting = null} = {}) {
  let analyzeSgfPath = resolveAnalyzeSgfPath({
    isPackaged: app?.isPackaged === true,
  })
  let config = {
    analyzeSgfPath,
    analyzeSgfStatus: getAnalyzeSgfStatus({analyzeSgfPath}),
    ...loadUserSgfAnalysisConfig(setting),
  }

  return new SgfAnalysisService({config})
}

function loadUserSgfAnalysisConfig(setting) {
  if (setting == null || typeof setting.get !== 'function') return {}

  return {
    katagoPath: setting.get('analysis.katago_path') || '',
    katagoModelPath:
      setting.get('analysis.katago_model_path') ||
      parseKatagoArgumentPath(
        setting.get('analysis.katago_arguments'),
        'model',
      ),
    katagoConfigPath:
      setting.get('analysis.katago_config_path') ||
      parseKatagoArgumentPath(
        setting.get('analysis.katago_arguments'),
        'config',
      ),
    outputDirectory: setting.get('analysis.output_directory') || '',
  }
}

function parseKatagoArgumentPath(argumentsText, option) {
  if (typeof argumentsText !== 'string' || argumentsText === '') return ''

  let match = argumentsText.match(
    new RegExp(`(?:^|\\s)-${option}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`),
  )

  return match == null ? '' : match[1] || match[2] || match[3] || ''
}

function persistUserSgfAnalysisConfig(setting, config) {
  if (setting == null || typeof setting.set !== 'function') return

  setting
    .set('analysis.katago_path', config.katagoPath || '')
    .set('analysis.katago_model_path', config.katagoModelPath || '')
    .set('analysis.katago_config_path', config.katagoConfigPath || '')
    .set('analysis.output_directory', config.outputDirectory || '')
}

function filterUserSgfAnalysisConfig(config) {
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => USER_CONFIG_KEYS.includes(key)),
  )
}

function getWindow(evt) {
  return BrowserWindow?.fromWebContents?.(evt.sender) ?? null
}

function isKnownAnalyzedGamePath(service, path) {
  if (typeof path !== 'string' || path === '') return false

  let target = resolve(path)
  return service
    .getAnalyzedGames()
    .some((game) => resolve(game.path) === target)
}

function isKnownAnalysisLogPath(service, path) {
  if (typeof path !== 'string' || path === '') return false

  let target = resolve(path)
  let state = service.getAnalysisState()
  let jobs = [
    state.currentJob,
    ...(state.queuedJobs || []),
    ...(state.completedJobs || []),
  ].filter(Boolean)

  return jobs.some(
    (job) => job.logPath != null && resolve(job.logPath) === target,
  )
}

function serializeError(err) {
  return {
    code: typeof err?.code === 'string' ? err.code : 'analysis-error',
    message:
      typeof err?.message === 'string' && err.message !== ''
        ? err.message
        : 'Analysis failed.',
  }
}

module.exports = {
  createSgfAnalysisService,
  filterUserSgfAnalysisConfig,
  loadUserSgfAnalysisConfig,
  parseKatagoArgumentPath,
  persistUserSgfAnalysisConfig,
  setupSgfAnalysisIpcHandlers,
  serializeError,
}
