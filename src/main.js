const {
  app,
  shell,
  dialog,
  clipboard,
  ipcMain,
  nativeImage,
  BrowserWindow,
  Menu,
} = require('electron')
const {resolve} = require('path')
const {pathToFileURL} = require('url')
const i18n = require('./i18n')
const setting = require('./setting')
const updater = require('./updater')
const {getOpenFileFromArgv} = require('./argv')
const {setupOgsIpcHandlers} = require('./ogs')
const {OgsAiReviewClient} = require('./ogs/ai-review-client.js')
const {setupOgsReviewIpcHandlers} = require('./ogs/review-ipc.js')
const {setupSgfAnalysisIpcHandlers} = require('./sgfanalysis')
const {openExternalUrl} = require('./shell')
const recentFiles = require('./recentfiles')
const library = require('./library')
const tsumegoProgress = require('./tsumegoprogress')

let windows = []
let openfile = null
let isQuitting = false
let explicitOzonePlatform = process.argv
  .find((arg) => arg.startsWith('--ozone-platform='))
  ?.split('=')[1]
let runningWayland =
  process.platform === 'linux' &&
  !!process.env.WAYLAND_DISPLAY &&
  explicitOzonePlatform !== 'x11'

const expectedAppUrl = pathToFileURL(resolve(__dirname, '../index.html'))

// GitHub repository used for update checks. Matches package.json's
// repository/homepage/bugs URLs.
const updateRepository = 'Samtroulcode/Seki-Sabaki'

function isTrustedRendererEvent(event) {
  let window = BrowserWindow.fromWebContents(event.sender)
  let url = event.senderFrame?.url || event.sender.getURL?.() || ''
  return (
    window?.webContents === event.sender &&
    event.senderFrame?.parent === null &&
    url === expectedAppUrl.href
  )
}

// Electron 43 can hang during first paint on Wayland when Vulkan is selected.
// Prefer XWayland when it is available; explicit Electron CLI flags remain
// authoritative for users who need a different backend.
if (
  runningWayland &&
  process.env.DISPLAY &&
  !process.argv.some((arg) => arg.startsWith('--ozone-platform='))
) {
  app.commandLine.appendSwitch('ozone-platform', 'x11')
}

if (
  runningWayland &&
  !process.argv.includes('--disable-gpu') &&
  !process.argv.includes('--enable-gpu')
) {
  app.commandLine.appendSwitch('disable-gpu')
}

function newWindow(path) {
  let window = new BrowserWindow({
    icon: nativeImage.createFromPath(resolve(__dirname, '../logo.png')),
    title: app.name,
    useContentSize: true,
    width: setting.get('window.width'),
    height: setting.get('window.height'),
    minWidth: setting.get('window.minwidth'),
    minHeight: setting.get('window.minheight'),
    autoHideMenuBar: !setting.get('view.show_menubar'),
    backgroundColor: '#111111',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      preload: resolve(__dirname, 'preload.js'),
      zoomFactor: setting.get('app.zoom_factor'),
    },
  })

  windows.push(window)
  clearApplicationMenu()
  setupWindowEventForwarding(window)

  window.once('ready-to-show', () => {
    window.show()
  })

  if (setting.get('window.maximized') === true) {
    window.maximize()
  }

  // store the window size
  window.on('maximize', () => {
    setting.set('window.maximized', true)
  })

  window.on('unmaximize', () => {
    setting.set('window.maximized', false)
  })

  window.on('closed', () => {
    window = null
  })

  window.webContents.audioMuted = !setting.get('sound.enable')

  window.webContents.once('did-finish-load', () => {
    if (!window.isVisible()) window.show()
    if (path) window.webContents.send('load-file', path)
  })

  window.webContents.setWindowOpenHandler(({url, frameName}) => {
    return {action: 'deny'}
  })

  window.loadURL(`file://${resolve(__dirname, '../index.html')}`)

  return window
}

function clearApplicationMenu() {
  Menu.setApplicationMenu(null)
}

function buildMenu(props = {}) {
  if (props == null || props.visible === false) {
    clearApplicationMenu()
    return
  }

  let template = require('./menu').get(props)

  // Process menu items

  let processMenu = (items) => {
    return items.map((item) => {
      if ('click' in item) {
        item.click = () => {
          let window = BrowserWindow.getFocusedWindow()
          if (!window) return

          window.webContents.send(`menu-click-${item.id}`)
        }
      }

      if ('clickMain' in item) {
        let key = item.clickMain

        item.click = () =>
          ({
            newWindow,
            checkForUpdates: () => checkForUpdates({showFailDialogs: true}),
            quit: () => app.quit(),
          })[key]()

        delete item.clickMain
      }

      if ('submenu' in item) {
        processMenu(item.submenu)
      }

      return item
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(processMenu(template)))

  // Create dock menu

  let dockMenu = Menu.buildFromTemplate([
    {
      label: i18n.t('menu.file', 'New &Window'),
      click: () => newWindow(),
    },
  ])

  if (process.platform === 'darwin') {
    app.dock.setMenu(dockMenu)
  }
}

async function checkForUpdates({showFailDialogs = false} = {}) {
  try {
    let t = i18n.context('updater')
    let info = await updater.check(updateRepository)

    if (info.hasUpdates) {
      dialog.showMessageBox(
        {
          type: 'info',
          buttons: [t('Download Update'), t('View Changelog'), t('Not Now')],
          title: app.name,
          message: t((p) => `${p.appName} v${p.version} is available now.`, {
            appName: app.name,
            version: info.latestVersion,
          }),
          noLink: true,
          cancelId: 2,
        },
        (response) => {
          if (response === 2) return

          openExternalUrl(
            shell,
            response === 0 ? info.downloadUrl || info.url : info.url,
          )
        },
      )
    } else if (showFailDialogs) {
      dialog.showMessageBox(
        {
          type: 'info',
          buttons: [t('OK')],
          title: t('No updates available'),
          message: t(
            (p) => `${p.appName} v${p.version} is the latest version.`,
            {
              appName: app.name,
              version: app.getVersion(),
            },
          ),
        },
        () => {},
      )
    }
  } catch (err) {
    if (showFailDialogs) {
      dialog.showMessageBox({
        type: 'warning',
        buttons: [t('OK')],
        title: app.name,
        message: t('An error occurred while checking for updates.'),
      })
    }
  }
}

function setupWindowEventForwarding(win) {
  const events = ['focus', 'blur', 'maximize', 'unmaximize', 'resize']
  events.forEach((event) => {
    win.on(event, () => {
      win.webContents.send(`window:${event}`)
    })
  })
}

function setupIpcHandlers() {
  // App info
  ipcMain.handle('app:getName', () => app.name)
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:quit', () => app.quit())
  // A renderer aborts an in-progress quit (e.g. the user cancelled the
  // unsaved-changes prompt) so a later ordinary window close doesn't quit the
  // app on macOS.
  ipcMain.handle('app:cancelQuit', () => {
    isQuitting = false
  })

  // Window operations
  ipcMain.handle('window:setFullScreen', (e, f) => {
    BrowserWindow.fromWebContents(e.sender)?.setFullScreen(f)
  })
  ipcMain.handle('window:isFullScreen', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isFullScreen() ?? false
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
  ipcMain.handle('window:isMinimized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMinimized() ?? false
  })
  ipcMain.handle('window:setMenuBarVisibility', (e, v) => {
    BrowserWindow.fromWebContents(e.sender)?.setMenuBarVisibility(v)
  })
  ipcMain.handle('window:setAutoHideMenuBar', (e, v) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) win.autoHideMenuBar = v
  })
  ipcMain.handle('window:getContentSize', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.getContentSize() ?? [0, 0]
  })
  ipcMain.handle('window:setContentSize', (e, w, h) => {
    BrowserWindow.fromWebContents(e.sender)?.setContentSize(
      Math.floor(w),
      Math.floor(h),
    )
  })
  ipcMain.handle('window:setProgressBar', (e, p) => {
    BrowserWindow.fromWebContents(e.sender)?.setProgressBar(p)
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:getId', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.id ?? null
  })

  // WebContents operations
  ipcMain.handle('webContents:setZoomFactor', (e, f) =>
    e.sender.setZoomFactor(f),
  )
  ipcMain.handle('webContents:getZoomFactor', (e) => e.sender.getZoomFactor())
  ipcMain.handle('webContents:setAudioMuted', (e, m) =>
    e.sender.setAudioMuted(m),
  )
  ipcMain.handle('webContents:undo', (e) => e.sender.undo())
  ipcMain.handle('webContents:redo', (e) => e.sender.redo())
  ipcMain.handle('webContents:toggleDevTools', (e) => e.sender.toggleDevTools())
  ipcMain.handle('webContents:getOSProcessId', (e) => e.sender.getOSProcessId())

  // Dialogs
  ipcMain.handle('dialog:showMessageBox', async (e, opts) => {
    return dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), opts)
  })
  ipcMain.handle('dialog:showOpenDialog', async (e, opts) => {
    return dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), opts)
  })
  ipcMain.handle('dialog:showSaveDialog', async (e, opts) => {
    return dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), opts)
  })

  // Menu popup
  ipcMain.handle('menu:popup', (e, template, x, y) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const zoomFactor = setting.get('app.zoom_factor')

    // Build menu from template
    // Click handlers are stored in renderer with IDs - we just send the ID back
    const buildMenuFromTemplate = (items) => {
      return items.map((item) => {
        if (!item) return item
        const newItem = {...item}
        // Items with IDs have click handlers stored in the renderer
        if (item.id && item.id.startsWith('popup-menu-')) {
          newItem.click = () => {
            win.webContents.send('menu-click', item.id)
          }
        }
        if (item.submenu) {
          newItem.submenu = buildMenuFromTemplate(item.submenu)
        }
        return newItem
      })
    }

    Menu.buildFromTemplate(buildMenuFromTemplate(template)).popup({
      window: win,
      x: x != null ? Math.round(x * zoomFactor) : undefined,
      y: y != null ? Math.round(y * zoomFactor) : undefined,
    })
  })

  // Shell
  ipcMain.handle('shell:openExternal', (_, url) => openExternalUrl(shell, url))
  ipcMain.handle('shell:showItemInFolder', (_, p) => shell.showItemInFolder(p))

  // Clipboard
  ipcMain.handle('clipboard:readText', () => clipboard.readText())
  ipcMain.handle('clipboard:writeText', (_, t) => clipboard.writeText(t))

  // Settings - for renderer access
  ipcMain.handle('setting:set', (e, key, value) => {
    setting.set(key, value)
    // Notify all windows of the change
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('setting:change', {key, value})
    })
    return true
  })

  // Synchronous handler for initial settings load (used by preload)
  ipcMain.on('setting:getAllSync', (e) => {
    try {
      e.returnValue = setting.getAll()
    } catch (err) {
      console.error('[main] Error in setting:getAllSync:', err)
      e.returnValue = {}
    }
  })

  ipcMain.handle('setting:loadThemes', () => {
    setting.loadThemes()
    return setting.getThemes()
  })

  let recentFilesApi = recentFiles.create(setting)
  let libraryApi = library.create(setting, dialog)
  ipcMain.handle('recentFiles:list', (e) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return recentFilesApi.list()
  })
  ipcMain.handle('recentFiles:add', (e, filePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return recentFilesApi.add(filePath)
  })
  ipcMain.handle('recentFiles:open', (e, id) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return recentFilesApi.open(id)
  })
  ipcMain.handle('library:getConfig', (e) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.getConfig()
  })
  ipcMain.handle('library:chooseRoot', async (e) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    let result = await libraryApi.chooseRoot(
      BrowserWindow.fromWebContents(e.sender),
    )
    if (result.ok) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('setting:change', {
          key: 'library.root',
          value: result.root,
        })
      })
    }
    return result
  })
  ipcMain.handle('library:list', (e, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.list(relativePath)
  })
  ipcMain.handle('library:open', (e, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.open(relativePath)
  })
  ipcMain.handle('library:listBuiltin', (e, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.listBuiltin(relativePath)
  })
  ipcMain.handle('library:openBuiltin', (e, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.openBuiltin(relativePath)
  })
  ipcMain.handle('library:getBuiltinCollectionMetadata', (e, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.getBuiltinCollectionMetadata(relativePath)
  })
  ipcMain.handle('library:countProblems', (e, source, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.countProblems(source, relativePath)
  })
  ipcMain.handle('library:saveFile', (e, relativePath, content, options) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.saveFile(relativePath, content, options)
  })
  ipcMain.handle('library:createDirectory', (e, relativePath) => {
    if (!isTrustedRendererEvent(e)) throw new Error('Untrusted renderer')
    return libraryApi.createDirectory(relativePath)
  })

  let tsumegoProgressStore = tsumegoProgress.createTsumegoProgressStore({
    userDataDirectory: setting.userDataDirectory,
  })
  tsumegoProgressStore.load()
  tsumegoProgress.setupTsumegoProgressIpcHandlers(
    ipcMain,
    tsumegoProgressStore,
    {
      isTrusted: (event) => isTrustedRendererEvent(event),
    },
  )
  ipcMain.on('setting:getPathsSync', (e) => {
    try {
      e.returnValue = {
        themesDirectory: setting.themesDirectory,
        stylesPath: setting.stylesPath,
        userDataDirectory: setting.userDataDirectory,
        themes: setting.getThemes(),
      }
    } catch (err) {
      console.error('[main] Error in setting:getPathsSync:', err)
      e.returnValue = {
        themesDirectory: '',
        stylesPath: '',
        userDataDirectory: '',
        themes: {},
      }
    }
  })

  let ogsAiReviewClient = null
  let ogsClient = setupOgsIpcHandlers(ipcMain, undefined, {
    sendStateChange: (state) => {
      if (state.user == null) ogsAiReviewClient?.dispose()
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('ogs:stateChange', state)
      })
    },
  })

  ogsAiReviewClient = new OgsAiReviewClient({
    getJwtToken: () => ogsClient.getJwtToken(),
    serverUrl: ogsClient.getServerUrl(),
    onStateChange: (state) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('ogsReviews:stateChange', state)
      })
    },
  })
  setupOgsReviewIpcHandlers(ipcMain, {
    reviewClient: ogsAiReviewClient,
    sendStateChange: (state) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('ogsReviews:stateChange', state)
      })
    },
    serializeError: (err) => ({
      code: 'network',
      message: err?.message || 'Unable to load OGS AI review.',
    }),
    isTrustedSender: (sender, senderFrame) => {
      let window = BrowserWindow.fromWebContents(sender)
      let url = senderFrame?.url || sender?.getURL?.() || ''
      let parsedUrl
      try {
        parsedUrl = new URL(url)
      } catch (err) {
        return false
      }

      return (
        window?.webContents === sender &&
        senderFrame?.parent === null &&
        parsedUrl.protocol === 'file:' &&
        parsedUrl.hostname === '' &&
        parsedUrl.href === expectedAppUrl.href
      )
    },
  })

  setupSgfAnalysisIpcHandlers(ipcMain, undefined, {
    app,
    dialog,
    shell,
    setting,
    sendStateChange: (state) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('analysis:stateChange', state)
      })
    },
  })
}

async function main() {
  if (!setting.get('app.enable_hardware_acceleration')) {
    app.disableHardwareAcceleration()
  }

  // Track an explicit quit request (Cmd+Q / Quit menu) so that on macOS the app
  // actually terminates once its windows close. The renderer's async
  // beforeunload cancels the first close to run the save prompt, which aborts
  // app.quit(); without this flag, window-all-closed then keeps the app alive,
  // so the window vanishes but the process lingers (issue #157).
  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || isQuitting) {
      app.quit()
    } else {
      buildMenu({disableAll: true})
    }
  })

  app.on('activate', (evt, hasVisibleWindows) => {
    if (app.isReady() && !hasVisibleWindows) newWindow()
  })

  app.on('open-file', (evt, path) => {
    evt.preventDefault()

    if (!app.isReady()) {
      openfile = path
    } else {
      newWindow(path)
    }
  })

  process.on('uncaughtException', (err) => {
    let t = i18n.context('exception')

    dialog.showErrorBox(
      t((p) => `${p.appName} v${p.version}`, {
        appName: app.name,
        version: app.getVersion(),
      }),
      t(
        (p) =>
          [
            `Something weird happened. ${p.appName} will shut itself down.`,
            `If possible, please report this on ${p.appName}’s repository on GitHub.`,
          ].join(' '),
        {
          appName: app.name,
        },
      ) +
        '\n\n' +
        err.stack,
    )

    process.exit(1)
  })

  await app.whenReady()

  setupIpcHandlers()

  if (!openfile) {
    openfile = getOpenFileFromArgv(process.argv)
  }

  newWindow(openfile)

  if (setting.get('app.startup_check_updates')) {
    setTimeout(
      () => checkForUpdates(),
      setting.get('app.startup_check_updates_delay'),
    )
  }

  ipcMain.on('new-window', (evt, ...args) => newWindow(...args))
  ipcMain.on('build-menu', (evt, ...args) => buildMenu(...args))
  ipcMain.on('check-for-updates', (evt, ...args) => checkForUpdates(...args))
}

main()
