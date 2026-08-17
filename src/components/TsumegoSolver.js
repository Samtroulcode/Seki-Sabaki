import {h, Component} from 'preact'
import {stringifyVertex} from '@sabaki/sgf'

import i18n from '../i18n.js'
import * as gametree from '../modules/gametree.js'
import {advanceSolution, resolveMove} from '../modules/tsumego.js'
import * as sound from '../modules/sound.js'
import {
  applyExplorationMove,
  cloneExplorationBoard,
  getExplorationPlayer,
} from '../modules/tsumegoexploration.js'
import GameGraph from './sidebars/GameGraph.js'
import Goban from './Goban.js'

const t = i18n.context('TsumegoSolver')
const AUTO_REPLY_DELAY = 1000

export default class TsumegoSolver extends Component {
  constructor(props) {
    super(props)
    this.state = this.getInitialState(props)
    this.autoSequenceId = 0
    this.autoTimer = null
  }

  componentWillUnmount() {
    this.cancelAutoSequence()
  }

  getInitialState({problem}) {
    let initial = {
      phase: 'solving',
      displayNodeId: problem.startNodeId,
      decisionPointId: problem.startNodeId,
      expectedMoveNodeId: problem.firstMove.id,
      feedback: null,
      showGameGraph: false,
      explorationBoard: null,
      explorationPlayer: null,
    }
    return {...initial, retrySnapshot: {...initial}}
  }

  handleVertexClick = (evt) => {
    if (evt.vertex == null) return
    if (this.state.phase === 'waiting') return
    if (this.state.phase !== 'solving') {
      this.handleExplorationVertex(evt.vertex)
      return
    }

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
      this.startFailedExploration(evt.vertex)
      return
    }

    let advanced = advanceSolution(gameTree, problem, result.node)
    if (advanced == null) {
      this.startFailedExploration(evt.vertex)
      return
    }

    sound.playPachi()
    let waiting = advanced.automaticMoves.length > 0
    let phase = advanced.solved ? 'solved' : 'solving'
    let nextState = {
      displayNodeId: result.node.id,
      decisionPointId: advanced.decisionPointId,
      expectedMoveNodeId: advanced.nextPlayerMove?.id || null,
      feedback: advanced.solved && !waiting ? t('Solved') || 'Solved' : null,
      phase: waiting ? 'waiting' : phase,
      showGameGraph: waiting ? false : advanced.solved,
      explorationBoard: null,
      explorationPlayer: null,
    }
    this.setState({
      ...nextState,
      retrySnapshot: advanced.solved
        ? this.state.retrySnapshot
        : {...nextState, retrySnapshot: undefined},
    })
    if (waiting) {
      this.startAutoSequence(advanced)
    } else if (advanced.solved) {
      this.props.onSolved?.()
    }
  }

  startAutoSequence(advanced) {
    this.cancelAutoSequence()
    let sequenceId = this.autoSequenceId
    let playNext = (index) => {
      if (sequenceId !== this.autoSequenceId) return
      if (index >= advanced.automaticMoves.length) {
        this.setState({
          displayNodeId: advanced.positionNodeId,
          decisionPointId: advanced.decisionPointId,
          expectedMoveNodeId: advanced.nextPlayerMove?.id || null,
          feedback: advanced.solved ? t('Solved') || 'Solved' : null,
          phase: advanced.solved ? 'solved' : 'solving',
          showGameGraph: advanced.solved,
        })
        if (advanced.solved) this.props.onSolved?.()
        return
      }

      this.autoTimer = setTimeout(() => {
        this.autoTimer = null
        if (sequenceId !== this.autoSequenceId) return
        let move = advanced.automaticMoves[index]
        sound.playPachi()
        this.setState({displayNodeId: move.id}, () => playNext(index + 1))
      }, AUTO_REPLY_DELAY)
    }
    playNext(0)
  }

  cancelAutoSequence() {
    if (this.autoTimer != null) {
      clearTimeout(this.autoTimer)
      this.autoTimer = null
    }
    this.autoSequenceId += 1
  }

  handleGraphNodeClick = (evt) => {
    if (evt.button !== 0 || evt.treePosition == null) return
    this.cancelAutoSequence()
    this.setState({
      displayNodeId: evt.treePosition,
      explorationBoard: null,
      explorationPlayer: null,
    })
  }

  handleGraphWheel = (step) => {
    this.cancelAutoSequence()
    let next = this.props.gameTree.navigate(this.state.displayNodeId, step, {})
    if (next == null) return
    this.setState({
      displayNodeId: next.id,
      explorationBoard: null,
      explorationPlayer: null,
    })
  }

  handleExplorationVertex(vertex) {
    let {gameTree, problem} = this.props
    let board =
      this.state.explorationBoard ||
      cloneExplorationBoard(
        gametree.getBoard(gameTree, this.state.displayNodeId),
      )
    let node = gameTree.get(this.state.displayNodeId)
    let sign =
      this.state.explorationPlayer ??
      getExplorationPlayer(node, problem.playerToMove === 'B' ? 1 : -1)
    let nextBoard = applyExplorationMove(board, sign, vertex)
    if (nextBoard == null) return
    sound.playPachi()
    this.setState({
      explorationBoard: nextBoard,
      explorationPlayer: -sign,
      feedback: null,
    })
  }

  startFailedExploration(vertex) {
    let {gameTree, problem} = this.props
    let board = cloneExplorationBoard(
      gametree.getBoard(gameTree, this.state.displayNodeId),
    )
    let node = gameTree.get(this.state.displayNodeId)
    let sign = getExplorationPlayer(node, problem.playerToMove === 'B' ? 1 : -1)
    let movedBoard = applyExplorationMove(board, sign, vertex)
    let nextBoard = movedBoard || board
    if (movedBoard != null) sound.playPachi()
    let retrySnapshot = {
      phase: 'solving',
      displayNodeId: this.state.displayNodeId,
      decisionPointId: this.state.decisionPointId,
      expectedMoveNodeId: this.state.expectedMoveNodeId,
      feedback: null,
      showGameGraph: false,
      explorationBoard: null,
      explorationPlayer: null,
    }
    this.setState({
      phase: 'failed',
      feedback: t('Incorrect'),
      explorationBoard: nextBoard,
      explorationPlayer: movedBoard == null ? sign : -sign,
      retrySnapshot,
    })
  }

  handleRetry = () => {
    this.cancelAutoSequence()
    if (this.state.phase === 'failed') {
      this.setState(this.state.retrySnapshot)
    } else {
      this.setState(this.getInitialState(this.props))
    }
  }

  handleBack = () => {
    this.cancelAutoSequence()
    this.props.onBack()
  }

  handlePrevious = () => {
    this.cancelAutoSequence()
    this.props.onPrevious()
  }

  handleNext = () => {
    this.cancelAutoSequence()
    this.props.onNext()
  }

  render() {
    let {gameTree, problem, problemIndex, problemCount, relativePath, source} =
      this.props
    let {displayNodeId, phase, feedback, showGameGraph, explorationBoard} =
      this.state
    let solved = phase === 'solved'
    let board = explorationBoard || gametree.getBoard(gameTree, displayNodeId)
    let currentNode = gameTree.get(displayNodeId)
    let currentComment = currentNode?.data?.C?.[0] || ''
    let filename = splitRelativePath(relativePath).pop() || ''
    let currentThemeId = window.sabaki.setting.get('theme.current')
    let graphGridSize = window.sabaki.setting.get('graph.grid_size')
    let graphNodeSize = window.sabaki.setting.get('graph.node_size')

    return h(
      'div',
      {class: `tsumego-solver phase-${phase}`},
      h(
        'div',
        {class: 'tsumego-solver-board'},
        h(Goban, {
          gameTree,
          treePosition: displayNodeId,
          board,
          transformation: '',
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
                onWheelNavigation: this.handleGraphWheel,
              }),
            ),
          ),
      ),
      h(
        'div',
        {class: 'tsumego-solver-navigation'},
        h(
          'button',
          {type: 'button', onClick: this.handleBack},
          `‹ ${t('Collection')}`,
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: problemIndex <= 0,
            onClick: this.handlePrevious,
          },
          `‹ ${t('Previous')}`,
        ),
        h('span', {}, `${problemIndex + 1} / ${problemCount}`),
        h(
          'button',
          {
            type: 'button',
            disabled: problemIndex >= problemCount - 1,
            onClick: this.handleNext,
          },
          `${t('Next')} ›`,
        ),
        (phase === 'failed' || solved) &&
          h(
            'button',
            {type: 'button', onClick: this.handleRetry},
            solved ? t('Retry Problem') : t('Retry'),
          ),
      ),
    )
  }
}

function splitRelativePath(relativePath) {
  return String(relativePath || '')
    .split(/[\\/]/)
    .filter(Boolean)
}
