import {h, Component} from 'preact'
import {stringifyVertex} from '@sabaki/sgf'

import i18n from '../i18n.js'
import * as gametree from '../modules/gametree.js'
import {advanceSolution, resolveMove} from '../modules/tsumego.js'
import GameGraph from './sidebars/GameGraph.js'
import Goban from './Goban.js'

const t = i18n.context('TsumegoSolver')

export default class TsumegoSolver extends Component {
  constructor(props) {
    super(props)
    this.state = this.getInitialState(props)
  }

  getInitialState({problem}) {
    return {
      displayNodeId: problem.startNodeId,
      decisionPointId: problem.startNodeId,
      expectedMoveNodeId: problem.firstMove.id,
      feedback: null,
      solved: false,
      showGameGraph: false,
    }
  }

  handleVertexClick = (evt) => {
    if (this.state.solved || evt.vertex == null) return

    let {gameTree, problem} = this.props
    let expectedMoveNode = gameTree.get(this.state.expectedMoveNodeId)
    let result = resolveMove(
      gameTree,
      problem,
      stringifyVertex(evt.vertex),
      this.state.decisionPointId,
      expectedMoveNode,
    )
    if (result.status !== 'correct' || result.node == null) {
      this.setState({feedback: t('Incorrect'), solved: false})
      return
    }

    let advanced = advanceSolution(gameTree, problem, result.node)
    if (advanced == null) {
      this.setState({feedback: t('Incorrect'), solved: false})
      return
    }

    this.setState({
      displayNodeId: advanced.positionNodeId,
      decisionPointId: advanced.decisionPointId,
      expectedMoveNodeId: advanced.nextPlayerMove?.id || null,
      feedback: advanced.solved ? t('Solved') : null,
      solved: advanced.solved,
      showGameGraph: advanced.solved,
    })
  }

  handleGraphNodeClick = (evt) => {
    if (evt.button !== 0 || evt.treePosition == null) return
    this.setState({displayNodeId: evt.treePosition})
  }

  handleRetry = () => {
    this.setState(this.getInitialState(this.props))
  }

  render() {
    let {
      gameTree,
      problem,
      problemIndex,
      problemCount,
      relativePath,
      source,
      onBack,
      onPrevious,
      onNext,
    } = this.props
    let {displayNodeId, feedback, solved, showGameGraph} = this.state
    let board = gametree.getBoard(gameTree, displayNodeId)
    let currentNode = gameTree.get(displayNodeId)
    let currentComment = currentNode?.data?.C?.[0] || ''
    let filename = splitRelativePath(relativePath).pop() || ''
    let currentThemeId = window.sabaki.setting.get('theme.current')
    let graphGridSize = window.sabaki.setting.get('graph.grid_size')
    let graphNodeSize = window.sabaki.setting.get('graph.node_size')

    return h(
      'div',
      {class: 'tsumego-solver'},
      h(
        'div',
        {class: 'tsumego-solver-board'},
        h(Goban, {
          gameTree,
          treePosition: displayNodeId,
          board,
          currentThemeId,
          showNextMoves: false,
          showSiblings: false,
          showMoveNumbers: false,
          showMoveColorization: false,
          fuzzyStonePlacement: false,
          animateStonePlacement: false,
          drawLineMode: null,
          onVertexClick: this.handleVertexClick,
          onLineDraw: () => {},
        }),
      ),
      h(
        'aside',
        {class: 'tsumego-solver-sidebar'},
        h('h2', {}, `${t('Problem')} ${problemIndex + 1} / ${problemCount}`),
        h('p', {class: 'tsumego-problem-filename'}, filename),
        h(
          'p',
          {class: 'tsumego-source-label'},
          source === 'builtin' ? t('Built-in') : t('My Library'),
        ),
        h(
          'p',
          {class: 'tsumego-player-to-move'},
          problem.playerToMove === 'B'
            ? t('Black to play')
            : t('White to play'),
        ),
        this.props.initialComment &&
          h('p', {class: 'tsumego-initial-comment'}, this.props.initialComment),
        feedback != null &&
          h(
            'p',
            {class: `tsumego-solver-feedback ${solved ? 'solved' : 'wrong'}`},
            feedback,
          ),
        solved &&
          h(
            'div',
            {class: 'tsumego-solution'},
            h('h3', {}, t('Solution')),
            currentComment && h('p', {}, currentComment),
            h(
              'div',
              {class: 'tsumego-solver-graph'},
              h(GameGraph, {
                gameTree,
                gameCurrents: {},
                treePosition: displayNodeId,
                showGameGraph,
                height: 100,
                gridSize: graphGridSize,
                nodeSize: graphNodeSize,
                onNodeClick: this.handleGraphNodeClick,
              }),
            ),
          ),
      ),
      h(
        'div',
        {class: 'tsumego-solver-navigation'},
        h('button', {type: 'button', onClick: onBack}, `‹ ${t('Collection')}`),
        h(
          'button',
          {type: 'button', disabled: problemIndex <= 0, onClick: onPrevious},
          `‹ ${t('Previous')}`,
        ),
        h('span', {}, `${problemIndex + 1} / ${problemCount}`),
        h(
          'button',
          {
            type: 'button',
            disabled: problemIndex >= problemCount - 1,
            onClick: onNext,
          },
          `${t('Next')} ›`,
        ),
        solved &&
          h('button', {type: 'button', onClick: this.handleRetry}, t('Retry')),
      ),
    )
  }
}

function splitRelativePath(relativePath) {
  return String(relativePath || '')
    .split(/[\\/]/)
    .filter(Boolean)
}
