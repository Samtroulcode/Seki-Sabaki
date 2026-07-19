import {h, Component} from 'preact'

import sabaki from '../modules/sabaki.js'
import i18n from '../i18n.js'
import SplitContainer from './helpers/SplitContainer.js'
import ToolBar, {ToolBarButton} from './ToolBar.js'
import GtpConsole from './sidebars/GtpConsole.js'
import OgsGameContextPanel from './sidebars/OgsGameContextPanel.js'
import {EnginePeerList} from './sidebars/PeerList.js'

const t = i18n.context('LeftSidebar')
const setting = {
  get: (key) => window.sabaki.setting.get(key),
  set: (key, value) => window.sabaki.setting.set(key, value),
}
const peerListMinHeight = setting.get('view.peerlist_minheight')

export default class LeftSidebar extends Component {
  constructor() {
    super()

    this.state = {
      peerListHeight: setting.get('view.peerlist_height'),
      selectedEngineSyncerId: null,
    }

    this.handlePeerListHeightChange = ({sideSize}) => {
      this.setState({peerListHeight: Math.max(sideSize, peerListMinHeight)})
    }

    this.handlePeerListHeightFinish = () => {
      setting.set('view.peerlist_height', this.state.peerListHeight)
    }

    this.handleCommandControlStep = ({step}) => {
      let {attachedEngineSyncers} = this.props
      let engineIndex = attachedEngineSyncers.findIndex(
        (syncer) => syncer.id === this.state.selectedEngineSyncerId,
      )

      let stepEngineIndex = Math.min(
        Math.max(0, engineIndex + step),
        attachedEngineSyncers.length - 1,
      )
      let stepEngine = this.props.attachedEngineSyncers[stepEngineIndex]

      if (stepEngine != null) {
        this.setState({selectedEngineSyncerId: stepEngine.id})
      }
    }

    this.handleEngineSelect = ({syncer}) => {
      this.setState({selectedEngineSyncerId: syncer.id}, () => {
        let input = this.element.querySelector('.gtp-console .input .command')

        if (input != null) {
          input.focus()
        }
      })
    }

    this.handleCommandSubmit = ({command}) => {
      if (this.props.onlineGameId != null) return

      let syncer = this.props.attachedEngineSyncers.find(
        (syncer) => syncer.id === this.state.selectedEngineSyncerId,
      )

      if (syncer != null) {
        syncer.queueCommand(command)
      }
    }

    this.handleAttachEngineButtonClick = (evt) => {
      let {left, bottom} = evt.currentTarget.getBoundingClientRect()

      sabaki.openEnginesMenu({x: left, y: bottom})
    }

    this.handleStartStopGameButtonClick = () => {
      sabaki.startStopEngineGame(sabaki.state.treePosition)
    }

    this.handleOgsPassButtonClick = () => sabaki.makePass()

    this.handleOgsResignButtonClick = () => sabaki.makeResign()

    this.handleOgsDisconnectGame = async (gameId) => {
      let result = await window.sabaki.ogs.disconnectGame(gameId)

      if (result.ok) {
        sabaki.detachOgsGame(gameId)
      }

      return result
    }
  }

  shouldComponentUpdate(nextProps) {
    return (
      nextProps.showLeftSidebar != this.props.showLeftSidebar ||
      nextProps.showLeftSidebar
    )
  }

  render(
    {
      attachedEngineSyncers,
      analyzingEngineSyncerId,
      blackEngineSyncerId,
      whiteEngineSyncerId,
      engineGameOngoing,
      onlineGameId,
      showLeftSidebar,
      consoleLog,
    },
    {peerListHeight, selectedEngineSyncerId},
  ) {
    return h(
      'section',
      {
        ref: (el) => (this.element = el),
        id: 'leftsidebar',
      },

      onlineGameId != null
        ? h('div', {class: 'left-sidebar-title'}, t('OGS'))
        : h(
            ToolBar,
            {},

            h(ToolBarButton, {
              icon: './node_modules/@primer/octicons/build/svg/play-16.svg',
              tooltip: t('Attach Engine…'),
              menu: true,
              onClick: this.handleAttachEngineButtonClick,
            }),

            h(ToolBarButton, {
              icon: './node_modules/@primer/octicons/build/svg/zap-16.svg',
              tooltip: !engineGameOngoing
                ? t('Start Engine vs. Engine Game')
                : t('Stop Engine vs. Engine Game'),
              checked: !!engineGameOngoing,
              onClick: this.handleStartStopGameButtonClick,
            }),
          ),

      h(
        'div',
        {class: 'left-sidebar-content'},

        onlineGameId != null
          ? h(OgsGameContextPanel, {
              onlineGameId,
              onPass: this.handleOgsPassButtonClick,
              onResign: this.handleOgsResignButtonClick,
              onDisconnectGame: this.handleOgsDisconnectGame,
            })
          : h(SplitContainer, {
              vertical: true,
              invert: true,
              sideSize: peerListHeight,

              sideContent: h(EnginePeerList, {
                attachedEngineSyncers,
                analyzingEngineSyncerId,
                blackEngineSyncerId,
                whiteEngineSyncerId,
                selectedEngineSyncerId,
                engineGameOngoing,
                onlineGameId,
                showToolBar: false,

                onEngineSelect: this.handleEngineSelect,
              }),

              mainContent: h(GtpConsole, {
                show: showLeftSidebar,
                consoleLog,
                attachedEngine: attachedEngineSyncers
                  .map((syncer) =>
                    syncer.id !== selectedEngineSyncerId
                      ? null
                      : {
                          name: syncer.engine.name,
                          get commands() {
                            return syncer.commands
                          },
                        },
                  )
                  .find((x) => x != null),

                onSubmit: this.handleCommandSubmit,
                onControlStep: this.handleCommandControlStep,
              }),

              onChange: this.handlePeerListHeightChange,
              onFinish: this.handlePeerListHeightFinish,
            }),
      ),
    )
  }
}

LeftSidebar.getDerivedStateFromProps = (props, state) => {
  if (
    props.attachedEngineSyncers.length > 0 &&
    props.attachedEngineSyncers.find(
      (syncer) => syncer.id === state.selectedEngineSyncerId,
    ) == null
  ) {
    return {selectedEngineSyncerId: props.attachedEngineSyncers[0].id}
  } else if (props.attachedEngineSyncers.length === 0) {
    return {selectedEngineSyncerId: null}
  }
}
