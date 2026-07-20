const {resolve} = require('path')
const {BrowserWindow} = require('electron')

const {SgfAnalysisService} = require('./modules/sgfanalysisservice.js')

function setupSgfAnalysisIpcHandlers(
  ipcMain,
  service = new SgfAnalysisService(),
  {dialog = null, shell = null, sendStateChange = null} = {},
) {
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
      return {ok: true, config: service.setConfig(config || {})}
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

  ipcMain.handle('analysis:showInFolder', (evt, path) => {
    if (shell == null || !isKnownAnalyzedGamePath(service, path)) return false

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
  setupSgfAnalysisIpcHandlers,
  serializeError,
}
