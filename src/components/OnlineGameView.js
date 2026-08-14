import {h, Component} from 'preact'

import Goban from './Goban.js'
import OgsGameContextPanel from './sidebars/OgsGameContextPanel.js'
import sabaki from '../modules/sabaki.js'
import * as gametree from '../modules/gametree.js'

export default class OnlineGameView extends Component {
  constructor(props) {
    super(props)

    this.handleGobanVertexClick = (evt) => {
      sabaki.clickVertex(evt.vertex, evt)
    }

    this.handlePassButtonClick = () => sabaki.makePass()
    this.handleResignButtonClick = () => sabaki.makeResign()
    this.handleAcceptRemovedStonesButtonClick = () =>
      sabaki.acceptOgsRemovedStones()

    this.handleDisconnectGame = async (gameId) => {
      let result = await window.sabaki.ogs.disconnectGame(gameId)

      if (result.ok) {
        sabaki.detachOgsGame(gameId)
      }

      return result
    }
  }

  render({
    gameTree,
    treePosition,
    onlineGameId,
    boardTransformation,
    mode,
    deadStones,
    areaMap,
  }) {
    let board = gametree.getBoard(gameTree, treePosition)
    let scoring = ['scoring', 'estimator'].includes(mode)

    return h(
      'section',
      {id: 'online-game', class: 'online-game-workspace'},
      h(
        'main',
        {class: 'online-game-board'},
        h(Goban, {
          gameTree,
          treePosition,
          board,
          highlightVertices: [],
          analysis: null,
          paintMap: scoring ? areaMap : undefined,
          dimmedStones: scoring ? deadStones : [],
          showCoordinates: this.props.showCoordinates,
          showMoveColorization: this.props.showMoveColorization,
          showMoveNumbers: this.props.showMoveNumbers,
          moveNumbersType: this.props.moveNumbersType,
          showNextMoves: false,
          showSiblings: false,
          fuzzyStonePlacement: this.props.fuzzyStonePlacement,
          animateStonePlacement: this.props.animateStonePlacement,
          currentThemeId: this.props.currentThemeId,
          playVariation: null,
          drawLineMode: null,
          transformation: boardTransformation,
          onVertexClick: this.handleGobanVertexClick,
        }),
      ),
      h(
        'aside',
        {class: 'online-game-context'},
        h(OgsGameContextPanel, {
          onlineGameId,
          onPass: this.handlePassButtonClick,
          onResign: this.handleResignButtonClick,
          onAcceptRemovedStones: this.handleAcceptRemovedStonesButtonClick,
          onDisconnectGame: this.handleDisconnectGame,
        }),
      ),
    )
  }
}
