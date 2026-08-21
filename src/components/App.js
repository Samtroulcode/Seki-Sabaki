import {ipcRenderer} from 'electron'
import {h, render, Component} from 'preact'
import classNames from 'classnames'
import fixPath from 'fix-path'

import TripleSplitContainer from './helpers/TripleSplitContainer.js'
import ThemeManager from './ThemeManager.js'
import MainMenu from './MainMenu.js'
import AppTabs from './AppTabs.js'
import WorkspaceView from './WorkspaceView.js'
import LeftSidebar from './LeftSidebar.js'
import Sidebar from './Sidebar.js'
import DrawerManager from './DrawerManager.js'
import InputBox from './InputBox.js'
import BusyScreen from './BusyScreen.js'
import InfoOverlay from './InfoOverlay.js'
import MatchmakingToast from './MatchmakingToast.js'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import {deriveBoardRenderState} from '../modules/boardrenderstate.js'
import * as gametree from '../modules/gametree.js'
import * as gtplogger from '../modules/gtplogger.js'
import * as helper from '../modules/helper.js'
import onlineStore from '../modules/onlinestore.js'
import {
  OgsOnlineController,
  configureOgsOnlineController,
} from '../modules/ogsonlinecontroller.js'

if (process.env.SABAKI_E2E) window.__sabaki = sabaki

const setting = {
  get: (key) => window.sabaki.setting.get(key),
  set: (key, value) => {
    window.sabaki.setting.set(key, value)
    return setting
  },
}
const t = i18n.context('App')

const leftSidebarMinWidth = setting.get('view.sidebar_minwidth')
const sidebarMinWidth = setting.get('view.leftsidebar_minwidth')
const ogsOnlineController = configureOgsOnlineController(
  new OgsOnlineController({store: onlineStore, sabaki}),
)

fixPath()
const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
if (portableDir) process.chdir(portableDir)

class App extends Component {
  constructor(props) {
    super(props)

    this.state = sabaki.state

    sabaki.on('change', ({change, callback}) => {
      this.setState(change, callback)
    })

    let bind = (f) => f.bind(this)
    this.handleWheel = bind(this.handleWheel)
    this.handleMainLayoutSplitChange = bind(this.handleMainLayoutSplitChange)
    this.handleMainLayoutSplitFinish = bind(this.handleMainLayoutSplitFinish)
  }

  componentDidMount() {
    this.ogsReviewUnsubscribe = window.sabaki.ogsReviews?.onStateChange(
      (ogsReviewState) => {
        let activeReview = Object.values(ogsReviewState?.reviews || {})[0]
        if (
          activeReview != null &&
          this.isReviewForCurrentBoard(activeReview)
        ) {
          sabaki.applyOgsReview(activeReview)
        }
        this.setState({ogsReviewState})
      },
    )
    let ogsReviewStatePromise = window.sabaki.ogsReviews?.getState?.()
    ogsReviewStatePromise?.then((ogsReviewState) => {
      let activeReview = Object.values(ogsReviewState?.reviews || {})[0]
      if (activeReview != null && this.isReviewForCurrentBoard(activeReview)) {
        sabaki.applyOgsReview(activeReview)
      }
      this.setState({ogsReviewState})
    })
    gtplogger.updatePath()
    ogsOnlineController.initialize()
    onlineStore.initialize()

    window.addEventListener('contextmenu', (evt) => {
      evt.preventDefault()
    })

    window.addEventListener('load', () => {
      sabaki.events.emit('ready')
    })

    ipcRenderer.on('load-file', (evt, ...args) => {
      setTimeout(() => {
        sabaki.loadFile(...args)
      }, setting.get('app.loadgame_delay'))
    })

    sabaki.window.on('focus', () => {
      if (setting.get('file.show_reload_warning')) {
        sabaki.askForReload()
      }
    })

    sabaki.window.on('resize', () => {
      clearTimeout(this.resizeId)

      this.resizeId = setTimeout(() => {
        if (
          !sabaki.window.isMaximized() &&
          !sabaki.window.isMinimized() &&
          !sabaki.window.isFullScreen()
        ) {
          let [width, height] = sabaki.window.getContentSize()
          setting.set('window.width', width).set('window.height', height)
        }
      }, 1000)
    })

    // Handle mouse wheel

    document.addEventListener('wheel', this.handleWheel, {passive: false})

    // Handle file drag & drop

    document.body.addEventListener('dragover', (evt) => evt.preventDefault())
    document.body.addEventListener('drop', (evt) => {
      evt.preventDefault()

      if (evt.dataTransfer.files.length === 0) return
      const filePath = window.sabaki.getPathForFile(evt.dataTransfer.files[0])
      sabaki.loadFile(filePath)
    })

    // Handle keys

    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape') {
        if (sabaki.state.openDrawer != null) {
          sabaki.closeDrawer()
        } else if (sabaki.state.mode !== 'play') {
          sabaki.setMode('play')
        } else if (sabaki.state.fullScreen) {
          sabaki.setState({fullScreen: false})
        }
      } else if (
        !evt.ctrlKey &&
        !evt.metaKey &&
        ['ArrowUp', 'ArrowDown'].includes(evt.key)
      ) {
        if (
          sabaki.state.busy > 0 ||
          helper.isTextLikeElement(document.activeElement)
        )
          return

        evt.preventDefault()

        let sign = evt.key === 'ArrowUp' ? -1 : 1
        sabaki.startAutoscrolling(sign)
      } else if (
        (evt.ctrlKey || evt.metaKey) &&
        ['z', 'y'].includes(evt.key.toLowerCase())
      ) {
        if (sabaki.state.busy > 0) return

        // Hijack browser undo/redo

        evt.preventDefault()

        let step = evt.key.toLowerCase() === 'z' ? -1 : 1
        if (evt.shiftKey) step = -step

        let action = step < 0 ? 'undo' : 'redo'

        if (action != null) {
          if (helper.isTextLikeElement(document.activeElement)) {
            sabaki.window.webContents[action]()
          } else {
            sabaki[action]()
          }
        }
      }
    })

    document.addEventListener('keyup', (evt) => {
      if (['ArrowUp', 'ArrowDown'].includes(evt.key)) {
        sabaki.stopAutoscrolling()
      }
    })

    document.addEventListener('keydown', (evt) => {
      if (!evt.ctrlKey && !evt.metaKey) return

      if (evt.key !== 'Home') return
      if (helper.isTextLikeElement(document.activeElement)) return

      evt.preventDefault()
      sabaki.setState({activeWorkspace: 'home', homeSection: 'dashboard'})
    })

    // Handle window closing

    window.addEventListener('beforeunload', (evt) => {
      if (this.closeWindow) return

      evt.returnValue = ' '

      setTimeout(async () => {
        if (await sabaki.askForSaveAllBoardTabs()) {
          await sabaki.detachEngines(
            sabaki.getAllAttachedEngineSyncers().map((syncer) => syncer.id),
          )

          gtplogger.close()
          this.closeWindow = true
          sabaki.window.close()
        } else {
          // User backed out of the close; clear any pending quit intent so a
          // later ordinary window close still leaves the app running (macOS).
          window.sabaki.app.cancelQuit()
        }
      })
    })
  }

  isReviewForCurrentBoard(review) {
    let tree = sabaki.inferredState.gameTree
    let source = String(gametree.getRootProperty(tree, 'SO', '') || '')
    return new RegExp(`/game/${review.gameId}(?:/|$)`).test(source)
  }

  componentDidUpdate(_, prevState = {}) {
    // Update title

    let {title} = sabaki.inferredState
    if (document.title !== title) document.title = title

    // Handle full screen & show menu bar

    if (prevState.fullScreen !== sabaki.state.fullScreen) {
      if (sabaki.state.fullScreen)
        sabaki.flashInfoOverlay(t('Press Esc to exit full screen mode'))
      sabaki.window.setFullScreen(sabaki.state.fullScreen)
    }

    if (prevState.showMenuBar !== sabaki.state.showMenuBar) {
      if (!sabaki.state.showMenuBar)
        sabaki.flashInfoOverlay(t('Press Alt to show menu bar'))
      sabaki.window.setMenuBarVisibility(sabaki.state.showMenuBar)
      sabaki.window.autoHideMenuBar = !sabaki.state.showMenuBar
    }

    // Handle bars & drawers

    if (
      ['estimator', 'scoring'].includes(prevState.mode) &&
      sabaki.state.mode !== 'estimator' &&
      sabaki.state.mode !== 'scoring' &&
      sabaki.state.openDrawer === 'score'
    ) {
      sabaki.closeDrawer()
    }

    // Handle sidebar showing/hiding

    let {showSidebar: prevShowSidebar} = sabaki.getInferredState(prevState)

    let sidebarVisibilityChanged =
      prevState.showLeftSidebar !== sabaki.state.showLeftSidebar ||
      prevShowSidebar !== sabaki.inferredState.showSidebar

    if (
      sidebarVisibilityChanged ||
      prevState.activeWorkspace !== sabaki.state.activeWorkspace
    ) {
      let [width, height] = sabaki.window.getContentSize()
      let widthDiff = 0

      if (prevShowSidebar !== sabaki.inferredState.showSidebar) {
        widthDiff +=
          sabaki.state.sidebarWidth *
          (sabaki.inferredState.showSidebar ? 1 : -1)
      }

      if (prevState.showLeftSidebar !== sabaki.state.showLeftSidebar) {
        widthDiff +=
          sabaki.state.leftSidebarWidth *
          (sabaki.state.showLeftSidebar ? 1 : -1)
      }

      if (
        sidebarVisibilityChanged &&
        !sabaki.window.isMaximized() &&
        !sabaki.window.isMinimized() &&
        !sabaki.window.isFullScreen()
      ) {
        sabaki.window.setContentSize(Math.floor(width + widthDiff), height)
      }

      window.dispatchEvent(new Event('resize'))
    }

    // Handle zoom factor

    if (prevState.zoomFactor !== sabaki.state.zoomFactor) {
      sabaki.window.webContents.zoomFactor = sabaki.state.zoomFactor
    }
  }

  // User Interface

  handleWheel(evt) {
    if (evt.target.closest('#main main, #winrategraph') == null) {
      return
    }

    evt.preventDefault()

    if (this.residueDeltaY == null) this.residueDeltaY = 0
    this.residueDeltaY += evt.deltaY

    if (
      Math.abs(this.residueDeltaY) >= setting.get('game.navigation_sensitivity')
    ) {
      sabaki.goStep(Math.sign(this.residueDeltaY))
      this.residueDeltaY = 0
    }
  }

  handleMainLayoutSplitChange({beginSideSize, endSideSize}) {
    sabaki.setState(
      ({leftSidebarWidth, sidebarWidth, showLeftSidebar}) => ({
        leftSidebarWidth: showLeftSidebar
          ? Math.max(beginSideSize, leftSidebarMinWidth)
          : leftSidebarWidth,
        sidebarWidth: sabaki.inferredState.showSidebar
          ? Math.max(endSideSize, sidebarMinWidth)
          : sidebarWidth,
      }),
      () => window.dispatchEvent(new Event('resize')),
    )
  }

  handleMainLayoutSplitFinish() {
    setting
      .set('view.sidebar_width', this.state.sidebarWidth)
      .set('view.leftsidebar_width', this.state.leftSidebarWidth)
  }

  // Render

  render(_, state) {
    state = deriveBoardRenderState(state, sabaki.inferredState)

    return h(
      'section',
      {
        class: classNames({
          showleftsidebar: state.showLeftSidebar,
          showsidebar: state.showSidebar,
          [state.mode]: true,
        }),
      },

      h(ThemeManager),
      h(MainMenu, {
        showMenuBar: state.showMenuBar,
        disableAll: state.busy > 0 || state.activeWorkspace !== 'board',
        analysisType: state.analysisType,
        analysisValueType: state.analysisValueType,
        showAnalysis: state.showAnalysis,
        showCoordinates: state.showCoordinates,
        coordinatesType: state.coordinatesType,
        showMoveNumbers: state.showMoveNumbers,
        moveNumbersType: state.moveNumbersType,
        showMoveColorization: state.showMoveColorization,
        showNextMoves: state.showNextMoves,
        showSiblings: state.showSiblings,
        showWinrateGraph: state.showWinrateGraph,
        showGameGraph: state.showGameGraph,
        showCommentBox: state.showCommentBox,
        showLeftSidebar: state.showLeftSidebar,
        engineGameOngoing: state.engineGameOngoing,
        onlineGameId: state.onlineGameId,
      }),

      h(AppTabs, {
        activeWorkspace: state.activeWorkspace,
        boardTabs: state.boardTabs,
        activeBoardTabId: state.activeBoardTabId,
        onlineGameTabs: state.onlineGameTabs,
        activeOnlineGameTabId: state.activeOnlineGameTabId,
        workspaceTabs: state.workspaceTabs,
        activeWorkspaceTabId: state.activeWorkspaceTabId,
        activityTabOrder: state.activityTabOrder,
      }),

      h(MatchmakingToast),

      h(TripleSplitContainer, {
        id: 'mainlayout',

        beginSideSize:
          state.activeWorkspace === 'board' && state.showLeftSidebar
            ? state.leftSidebarWidth
            : 0,
        endSideSize:
          state.activeWorkspace === 'board' && state.showSidebar
            ? state.sidebarWidth
            : 0,

        beginSideContent:
          state.activeWorkspace === 'board' ? h(LeftSidebar, state) : null,
        mainContent: h(WorkspaceView, state),
        endSideContent:
          state.activeWorkspace === 'board' ? h(Sidebar, state) : null,

        onChange: this.handleMainLayoutSplitChange,
        onFinish: this.handleMainLayoutSplitFinish,
      }),

      h(DrawerManager, state),

      h(InputBox, {
        text: state.inputBoxText,
        defaultValue: state.inputBoxDefaultValue,
        show: state.showInputBox,
        onSubmit: state.onInputBoxSubmit,
        onCancel: state.onInputBoxCancel,
      }),

      h(BusyScreen, {show: state.busy > 0}),
      h(InfoOverlay, {
        text: state.infoOverlayText,
        show: state.showInfoOverlay,
      }),
    )
  }
}

// Render

render(h(App), document.body)
