import {h, Component} from 'preact'

import sabaki from '../modules/sabaki.js'
import i18n from '../i18n.js'
import SplitContainer from './helpers/SplitContainer.js'
import ToolBar, {ToolBarButton} from './ToolBar.js'
import GtpConsole from './sidebars/GtpConsole.js'
import OgsPanel from './sidebars/OgsPanel.js'
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
      showOgsPanel: false,
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
      let syncer = this.props.attachedEngineSyncers.find(
        (syncer) => syncer.id === this.state.selectedEngineSyncerId,
      )

      if (syncer != null) {
        syncer.queueCommand(command)
      }
    }

    this.handleOgsPanelToggle = () => {
      this.setState(({showOgsPanel}) => ({showOgsPanel: !showOgsPanel}))
    }

    this.handleAttachEngineButtonClick = (evt) => {
      let {left, bottom} = evt.currentTarget.getBoundingClientRect()

      sabaki.openEnginesMenu({x: left, y: bottom})
    }

    this.handleStartStopGameButtonClick = () => {
      sabaki.startStopEngineGame(sabaki.state.treePosition)
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
      showLeftSidebar,
      consoleLog,
    },
    {peerListHeight, selectedEngineSyncerId, showOgsPanel},
  ) {
    return h(
      'section',
      {
        ref: (el) => (this.element = el),
        id: 'leftsidebar',
      },

      h(
        ToolBar,
        {},

        h(ToolBarButton, {
          icon: './node_modules/@primer/octicons/build/svg/question-16.svg',
          tooltip: t('Show OGS Panel'),
          checked: showOgsPanel,
          onClick: this.handleOgsPanelToggle,
        }),

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

        showOgsPanel
          ? h(OgsPanel)
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
