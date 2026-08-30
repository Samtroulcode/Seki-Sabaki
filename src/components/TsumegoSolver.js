import {h, Component} from 'preact'
import {stringifyVertex} from '@sabaki/sgf'

import i18n from '../i18n.js'
import * as gametree from '../modules/gametree.js'
import {
  advanceSolution,
  advanceRefutation,
  resolveMove,
} from '../modules/tsumego.js'
import * as sound from '../modules/sound.js'
import {
  applyExplorationMove,
  cloneExplorationBoard,
  getExplorationPlayer,
} from '../modules/tsumegoexploration.js'
import GameGraph from './sidebars/GameGraph.js'
import Goban from './Goban.js'

const t = i18n.context('TsumegoSolver')
const AUTO_REPLY_DELAY = 500
const AUTO_NEXT_DELAY = 800

export default class TsumegoSolver extends Component {
  constructor(props) {
    super(props)
    this.state = this.getInitialState(props)
    this.autoSequenceId = 0
    this.autoTimer = null
    this.autoNextTimer = null
  }

  componentWillUnmount() {
    this.cancelAutoSequence()
    this.cancelAutoNext()
  }

  componentDidUpdate(previousProps) {
    if (this.props.autoNext === previousProps.autoNext) return
    if (this.props.autoNext) {
      if (this.state.phase === 'solved') this.startAutoNext()
    } else {
      this.cancelAutoNext()
    }
  }

  getInitialState({problem, interpretation}) {
    if (
      interpretation != null &&
      (interpretation.kind === 'point-selection' ||
        interpretation.kind === 'judgement' ||
        interpretation.kind === 'stone-selection' ||
        interpretation.kind === 'score')
    ) {
      return {
        phase: 'solving',
        displayNodeId: interpretation.startNodeId,
        decisionPointId: interpretation.startNodeId,
        expectedMoveNodeId: null,
        feedback: null,
        showGameGraph: false,
        explorationBoard: null,
        explorationPlayer: null,
        highlightVertices: [],
        selectedVertices: [],
        scoreChoice: null,
        scoreMargin: '',
        scoreBlack: '',
        scoreWhite: '',
      }
    }
    return {
      phase: 'solving',
      displayNodeId: problem.startNodeId,
      decisionPointId: problem.startNodeId,
      expectedMoveNodeId: problem.firstMove.id,
      feedback: null,
      showGameGraph: false,
      explorationBoard: null,
      explorationPlayer: null,
      highlightVertices: [],
      selectedVertices: [],
    }
  }

  handleVertexClick = (evt) => {
    if (evt.vertex == null) return
    if (this.state.phase === 'waiting') return
    if (
      this.props.interpretation?.kind === 'stone-selection' &&
      this.state.phase !== 'solving'
    )
      return
    if (this.state.phase !== 'solving') {
      this.handleExplorationVertex(evt.vertex)
      return
    }

    let {gameTree, problem, interpretation} = this.props
    if (interpretation != null && interpretation.kind === 'point-selection') {
      this.handlePointSelectionVertex(evt.vertex)
      return
    }
    if (interpretation != null && interpretation.kind === 'judgement') {
      // Judgement problems do not use board clicks as answers; Goban is read-only while solving
      return
    }
    if (interpretation != null && interpretation.kind === 'stone-selection') {
      this.handleStoneSelectionVertex(evt.vertex)
      return
    }

    let expectedMoveNode = gameTree.get(this.state.expectedMoveNodeId)
    let result = resolveMove(
      gameTree,
      problem,
      stringifyVertex(evt.vertex),
      this.state.decisionPointId,
      expectedMoveNode,
    )
    if (result.status !== 'correct' || result.node == null) {
      // Check if the wrong move has an SGF variation (result.node exists)
      if (result.status === 'wrong' && result.node != null) {
        this.startRefutationSequence(result.node)
      } else {
        this.startFailedExploration(evt.vertex)
      }
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
    this.setState(nextState)
    if (waiting) {
      this.startAutoSequence(advanced)
    } else if (advanced.solved) {
      this.props.onSolved?.()
      this.startAutoNext()
    }
  }

  handlePointSelectionVertex(vertex) {
    let {gameTree, interpretation} = this.props
    let vertexString = stringifyVertex(vertex)
    let isAccepted = interpretation.acceptedPoints.includes(vertexString)

    if (isAccepted) {
      // Find the answer group containing the selected point
      let answerGroup = null
      if (interpretation.answerGroups != null) {
        for (let group of interpretation.answerGroups) {
          if (group.points.includes(vertexString)) {
            answerGroup = group
            break
          }
        }
      }
      let displayNodeId =
        answerGroup != null ? answerGroup.nodeId : interpretation.startNodeId
      sound.playPachi()
      this.setState({
        phase: 'solved',
        displayNodeId,
        feedback: t('Solved') || 'Solved',
        showGameGraph: true,
        explorationBoard: null,
        explorationPlayer: null,
        highlightVertices: [vertex],
      })
      this.props.onSolved?.()
      this.startAutoNext()
      return
    }

    // Check if the clicked point corresponds to an explicit wrong B/W variation
    let decisionPoint = gameTree.get(interpretation.startNodeId)
    if (decisionPoint != null) {
      let depth = 0
      let stack = [{node: gameTree.root, depth: 0}]
      while (stack.length) {
        let {node, depth: currentDepth} = stack.pop()
        if (node.id === decisionPoint.id) {
          depth = currentDepth
          break
        }
        for (let child of node.children)
          stack.push({node: child, depth: currentDepth + 1})
      }
      // Use the same helper as playerToMove inference for consistency
      let candidates = []
      // Inline getDecisionPointCandidates logic to avoid import
      let candidateStack = decisionPoint.children
        .map((child) => ({node: child, depth: depth + 1}))
        .reverse()
      while (candidateStack.length) {
        let candidate = candidateStack.pop()
        if (
          candidate.node.data != null &&
          (candidate.node.data.B != null || candidate.node.data.W != null)
        ) {
          candidates.push(candidate.node)
        } else if (
          candidate.node.data == null ||
          (candidate.node.data.AB == null &&
            candidate.node.data.AW == null &&
            candidate.node.data.AE == null &&
            candidate.node.data.PL == null)
        ) {
          for (let child of [...candidate.node.children].reverse()) {
            candidateStack.push({node: child, depth: candidate.depth + 1})
          }
        }
      }

      let matching = candidates.filter((node) => {
        let color = node.data.B != null ? 'B' : 'W'
        let values = node.data[color]
        if (!Array.isArray(values) || values.length === 0) return false
        return values[0] === vertexString
      })

      if (matching.length > 0) {
        // Found a matching wrong variation - try to play its refutation
        let wrongNode = matching[0]
        let refutation = advanceRefutation(gameTree, wrongNode)
        if (refutation != null && refutation.automaticMoves.length > 0) {
          this.startRefutationSequence(wrongNode)
          return
        }
        // No refutation or refutation has no moves - fall through to failed exploration
        // But we should still show the wrong move
        this.startFailedExplorationFromNode(wrongNode)
        return
      }
    }

    // Other point - incorrect. For point-selection with unknown player, do not
    // invent a stone color.
    if (interpretation.playerToMove == null) {
      this.setState({
        phase: 'failed',
        feedback: t('Incorrect'),
        explorationBoard: null,
        explorationPlayer: null,
      })
      if (vertexString != null) sound.playPachi()
      return
    }

    // Other legal point - incorrect
    this.startFailedExploration(vertex)
  }

  handleJudgementChoice = (choice) => {
    if (this.state.phase !== 'solving') return
    let {interpretation} = this.props
    if (interpretation == null || interpretation.kind !== 'judgement') return

    if (choice === interpretation.correctChoice) {
      sound.playPachi()
      this.setState({
        phase: 'solved',
        displayNodeId: interpretation.answerNodeId,
        feedback: t('Solved') || 'Solved',
        showGameGraph: true,
        explorationBoard: null,
        explorationPlayer: null,
        highlightVertices: [],
      })
      this.props.onSolved?.()
      this.startAutoNext()
    } else {
      sound.playPachi()
      this.setState({
        phase: 'failed',
        feedback: t('Incorrect'),
        explorationBoard: null,
        explorationPlayer: null,
        highlightVertices: [],
      })
    }
  }

  handleStoneSelectionVertex(vertex) {
    let board = gametree.getBoard(this.props.gameTree, this.state.displayNodeId)
    if (board.get(vertex) === 0) return
    let selected = this.state.selectedVertices || []
    let exists = selected.some(
      (point) => point[0] === vertex[0] && point[1] === vertex[1],
    )
    let next = exists
      ? selected.filter(
          (point) => point[0] !== vertex[0] || point[1] !== vertex[1],
        )
      : [...selected, vertex]
    this.setState({selectedVertices: next, highlightVertices: next})
  }

  handleStoneSelectionCheck = () => {
    if (this.state.phase !== 'solving') return
    let {interpretation} = this.props
    if (interpretation == null || interpretation.kind !== 'stone-selection')
      return
    let selected = new Set(
      (this.state.selectedVertices || []).map((point) =>
        stringifyVertex(point),
      ),
    )
    let accepted = new Set(interpretation.acceptedVertices)
    let correct =
      selected.size === accepted.size &&
      [...selected].every((point) => accepted.has(point))
    if (correct) {
      this.setState({
        phase: 'solved',
        displayNodeId: interpretation.answerNodeId,
        feedback: t('Solved') || 'Solved',
        showGameGraph: true,
        selectedVertices: [],
        highlightVertices: [],
      })
      this.props.onSolved?.()
      this.startAutoNext()
    } else {
      this.setState({
        phase: 'failed',
        feedback: t('Incorrect'),
        highlightVertices: this.state.selectedVertices || [],
      })
    }
  }

  handleScoreCheck = () => {
    if (this.state.phase !== 'solving') return
    let {interpretation} = this.props
    if (interpretation?.kind !== 'score') return
    let value =
      interpretation.answerMode === 'winner-margin'
        ? {
            winner: this.state.scoreChoice,
            margin: Number(this.state.scoreMargin),
          }
        : {
            winner:
              Number(this.state.scoreBlack) === Number(this.state.scoreWhite)
                ? 'draw'
                : Number(this.state.scoreBlack) > Number(this.state.scoreWhite)
                  ? 'B'
                  : 'W',
            margin: Math.abs(
              Number(this.state.scoreBlack) - Number(this.state.scoreWhite),
            ),
          }
    let expected = interpretation.result
    let correct =
      value.winner === expected.winner && value.margin === expected.margin
    if (interpretation.answerMode === 'totals')
      correct =
        correct &&
        Number(this.state.scoreBlack) === interpretation.totals.B &&
        Number(this.state.scoreWhite) === interpretation.totals.W
    if (correct) {
      this.setState({
        phase: 'solved',
        displayNodeId: interpretation.answerNodeId,
        feedback: t('Solved') || 'Solved',
        showGameGraph: true,
      })
      this.props.onSolved?.()
      this.startAutoNext()
    } else this.setState({phase: 'failed', feedback: t('Incorrect')})
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
        if (advanced.solved) {
          this.props.onSolved?.()
          this.startAutoNext()
        }
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

  startRefutationSequence(wrongMoveNode) {
    this.cancelAutoSequence()
    let {gameTree, problem} = this.props
    let refutation = advanceRefutation(gameTree, wrongMoveNode)
    if (refutation == null) {
      // No refutation sequence available, fall back to failed exploration
      this.startFailedExplorationFromNode(wrongMoveNode)
      return
    }

    // Play the user's wrong move first
    sound.playPachi()
    this.setState(
      {
        displayNodeId: wrongMoveNode.id,
        phase: 'waiting',
        feedback: null,
        showGameGraph: false,
        explorationBoard: null,
        explorationPlayer: null,
      },
      () => {
        // Then play the refutation sequence automatically
        this.playRefutationSequence(refutation)
      },
    )
  }

  playRefutationSequence(refutation) {
    this.cancelAutoSequence()
    let sequenceId = this.autoSequenceId
    let playNext = (index) => {
      if (sequenceId !== this.autoSequenceId) return
      if (index >= refutation.automaticMoves.length) {
        // Refutation complete, show Incorrect
        this.setState({
          displayNodeId: refutation.positionNodeId,
          phase: 'failed',
          feedback: t('Incorrect'),
          showGameGraph: false,
          explorationBoard: null,
          explorationPlayer: null,
        })
        return
      }

      this.autoTimer = setTimeout(() => {
        this.autoTimer = null
        if (sequenceId !== this.autoSequenceId) return
        let move = refutation.automaticMoves[index]
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

  cancelAutoNext() {
    if (this.autoNextTimer != null) {
      clearTimeout(this.autoNextTimer)
      this.autoNextTimer = null
    }
  }

  startAutoNext() {
    this.cancelAutoNext()
    if (this.props.autoNext !== true) return
    if (this.props.problemIndex >= this.props.problemCount - 1) return
    this.autoNextTimer = setTimeout(() => {
      this.autoNextTimer = null
      this.props.onNext?.()
    }, AUTO_NEXT_DELAY)
  }

  startFailedExploration(vertex) {
    let {gameTree, problem, interpretation} = this.props
    let playerToMove = null
    if (interpretation != null && interpretation.kind === 'point-selection') {
      playerToMove = interpretation.playerToMove
    } else if (problem != null) {
      playerToMove = problem.playerToMove
    }
    let fallbackSign = playerToMove === 'W' ? -1 : 1
    let board = cloneExplorationBoard(
      gametree.getBoard(gameTree, this.state.displayNodeId),
    )
    let node = gameTree.get(this.state.displayNodeId)
    let sign = getExplorationPlayer(node, fallbackSign)
    let movedBoard = applyExplorationMove(board, sign, vertex)
    let nextBoard = movedBoard || board
    if (movedBoard != null) sound.playPachi()
    this.setState({
      phase: 'failed',
      feedback: t('Incorrect'),
      explorationBoard: nextBoard,
      explorationPlayer: movedBoard == null ? sign : -sign,
    })
  }

  startFailedExplorationFromNode(wrongMoveNode) {
    let {gameTree, problem, interpretation} = this.props
    let playerToMove = null
    if (interpretation != null && interpretation.kind === 'point-selection') {
      playerToMove = interpretation.playerToMove
    } else if (problem != null) {
      playerToMove = problem.playerToMove
    }
    let fallbackSign = playerToMove === 'W' ? -1 : 1
    let board = cloneExplorationBoard(
      gametree.getBoard(gameTree, wrongMoveNode.id),
    )
    let node = gameTree.get(wrongMoveNode.id)
    let sign = getExplorationPlayer(node, fallbackSign)
    // The wrong move is already on the board at wrongMoveNode; sign is the
    // player to move from that position.
    sound.playPachi()
    this.setState({
      displayNodeId: wrongMoveNode.id,
      phase: 'failed',
      feedback: t('Incorrect'),
      explorationBoard: board,
      explorationPlayer: sign,
    })
  }

  handleRetry = () => {
    this.cancelAutoSequence()
    this.cancelAutoNext()
    // Always restore the original problem state (full reset)
    this.setState(this.getInitialState(this.props))
  }

  handleBack = () => {
    this.cancelAutoSequence()
    this.cancelAutoNext()
    this.props.onBack()
  }

  handlePrevious = () => {
    this.cancelAutoSequence()
    this.cancelAutoNext()
    this.props.onPrevious()
  }

  handleNext = () => {
    this.cancelAutoSequence()
    this.cancelAutoNext()
    this.props.onNext()
  }

  handleGraphNodeClick = (evt) => {
    if (evt.button !== 0 || evt.treePosition == null) return
    this.cancelAutoSequence()
    this.cancelAutoNext()
    this.setState({
      displayNodeId: evt.treePosition,
      explorationBoard: null,
      explorationPlayer: null,
    })
  }

  handleGraphWheel = (step) => {
    this.cancelAutoSequence()
    this.cancelAutoNext()
    let next = this.props.gameTree.navigate(this.state.displayNodeId, step, {})
    if (next == null) return
    this.setState({
      displayNodeId: next.id,
      explorationBoard: null,
      explorationPlayer: null,
    })
  }

  handleSolverWheel = (evt) => {
    if (this.state.phase !== 'solved') return
    // Avoid double navigation when wheel originates over GameGraph
    let target = evt.target
    while (target != null) {
      if (target.id === 'graph') return
      target = target.parentElement
    }
    let setting = window.sabaki.setting.get('game.navigation_sensitivity')
    let sensitivity = typeof setting === 'number' ? setting : 40
    this.residueDeltaY = (this.residueDeltaY || 0) + evt.deltaY
    if (Math.abs(this.residueDeltaY) < sensitivity) return
    evt.preventDefault()
    let step = Math.sign(this.residueDeltaY)
    this.residueDeltaY = 0
    this.cancelAutoNext()
    let next = this.props.gameTree.navigate(this.state.displayNodeId, step, {})
    if (next == null) return
    this.setState({
      displayNodeId: next.id,
      explorationBoard: null,
      explorationPlayer: null,
      highlightVertices: [],
    })
  }

  handleExplorationVertex(vertex) {
    let {gameTree, problem, interpretation} = this.props
    let playerToMove = null
    if (interpretation != null && interpretation.kind === 'point-selection') {
      playerToMove = interpretation.playerToMove
    } else if (problem != null) {
      playerToMove = problem.playerToMove
    }
    let board =
      this.state.explorationBoard ||
      cloneExplorationBoard(
        gametree.getBoard(gameTree, this.state.displayNodeId),
      )
    let node = gameTree.get(this.state.displayNodeId)
    let sign
    if (this.state.explorationPlayer != null) {
      sign = this.state.explorationPlayer
    } else if (
      interpretation != null &&
      interpretation.kind === 'point-selection' &&
      playerToMove == null
    ) {
      // Do not invent a color for point-selection with unknown player
      sign = getExplorationPlayer(node, null)
      if (sign == null) return
    } else {
      let fallbackSign = playerToMove === 'W' ? -1 : 1
      sign = getExplorationPlayer(node, fallbackSign)
    }
    let nextBoard = applyExplorationMove(board, sign, vertex)
    if (nextBoard == null) return
    sound.playPachi()
    this.setState({
      explorationBoard: nextBoard,
      explorationPlayer: -sign,
      feedback: null,
    })
  }

  render() {
    let {
      gameTree,
      problem,
      interpretation,
      problemIndex,
      problemCount,
      relativePath,
      source,
      testMode = false,
    } = this.props
    let {
      displayNodeId,
      phase,
      feedback,
      showGameGraph,
      explorationBoard,
      highlightVertices,
      selectedVertices,
    } = this.state
    let solved = phase === 'solved'
    let board = explorationBoard || gametree.getBoard(gameTree, displayNodeId)
    let currentNode = gameTree.get(displayNodeId)
    let currentComment = currentNode?.data?.C?.[0] || ''
    let filename = splitRelativePath(relativePath).pop() || ''
    let currentThemeId = window.sabaki.setting.get('theme.current')
    let graphGridSize = window.sabaki.setting.get('graph.grid_size')
    let graphNodeSize = window.sabaki.setting.get('graph.node_size')
    let playerToMove = null
    if (interpretation != null && interpretation.kind === 'point-selection') {
      playerToMove = interpretation.playerToMove
    } else if (problem != null) {
      playerToMove = problem.playerToMove
    }

    return h(
      'div',
      {
        class: `tsumego-solver phase-${phase}`,
        onWheel: this.handleSolverWheel,
      },
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
          highlightVertices: highlightVertices || [],
          onVertexClick: this.handleVertexClick,
          onLineDraw: () => {},
        }),
      ),
      h(
        'aside',
        {class: 'tsumego-solver-sidebar'},
        h(
          'h2',
          {},
          testMode
            ? t('Test Problem')
            : `${t('Problem')} ${problemIndex + 1} / ${problemCount}`,
        ),
        h(
          'p',
          {class: 'tsumego-problem-filename'},
          testMode ? t('Unsaved draft') : filename,
        ),
        !testMode &&
          h(
            'p',
            {class: 'tsumego-source-label'},
            source === 'builtin' ? t('Built-in') : t('My Library'),
          ),
        playerToMove != null &&
          h(
            'p',
            {class: 'tsumego-player-to-move'},
            playerToMove === 'B' ? t('Black to play') : t('White to play'),
          ),
        this.props.initialComment &&
          h('p', {class: 'tsumego-initial-comment'}, this.props.initialComment),
        interpretation != null &&
          interpretation.kind === 'judgement' &&
          phase === 'solving' &&
          h(
            'div',
            {class: 'tsumego-judgement-controls'},
            ...(interpretation.choices || []).map((choice) =>
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => this.handleJudgementChoice(choice),
                },
                t(
                  choice === 'alive'
                    ? 'Alive'
                    : choice === 'dead'
                      ? 'Dead'
                      : choice === 'legal'
                        ? 'Legal'
                        : choice === 'illegal'
                          ? 'Illegal'
                          : choice === 'yes'
                            ? 'Yes'
                            : choice === 'no'
                              ? 'No'
                              : choice === 'good'
                                ? 'Good'
                                : choice === 'bad'
                                  ? 'Bad'
                                  : choice,
                ),
              ),
            ),
          ),
        interpretation?.kind === 'score' &&
          phase === 'solving' &&
          h(
            'div',
            {class: 'tsumego-score-controls'},
            interpretation.answerMode === 'winner-margin'
              ? [
                  h(
                    'label',
                    {},
                    t('Winner'),
                    h(
                      'select',
                      {
                        value: this.state.scoreChoice,
                        onChange: (evt) =>
                          this.setState({scoreChoice: evt.target.value}),
                      },
                      h('option', {value: ''}, ''),
                      h('option', {value: 'B'}, t('Black')),
                      h('option', {value: 'W'}, t('White')),
                      h('option', {value: 'draw'}, t('Draw')),
                    ),
                  ),
                  this.state.scoreChoice !== 'draw' &&
                    h(
                      'label',
                      {},
                      t('Margin'),
                      h('input', {
                        type: 'number',
                        step: 'any',
                        value: this.state.scoreMargin,
                        onInput: (evt) =>
                          this.setState({scoreMargin: evt.target.value}),
                      }),
                    ),
                ]
              : [
                  h(
                    'label',
                    {},
                    t('Black'),
                    h('input', {
                      type: 'number',
                      step: 'any',
                      value: this.state.scoreBlack,
                      onInput: (evt) =>
                        this.setState({scoreBlack: evt.target.value}),
                    }),
                  ),
                  h(
                    'label',
                    {},
                    t('White'),
                    h('input', {
                      type: 'number',
                      step: 'any',
                      value: this.state.scoreWhite,
                      onInput: (evt) =>
                        this.setState({scoreWhite: evt.target.value}),
                    }),
                  ),
                ],
          ),
        interpretation != null &&
          interpretation.kind === 'stone-selection' &&
          phase === 'solving' &&
          h(
            'button',
            {type: 'button', onClick: this.handleStoneSelectionCheck},
            t('Check answer'),
          ),
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
          `‹ ${testMode ? t('Back to Editor') : t('Collection')}`,
        ),
        !testMode &&
          h(
            'button',
            {
              type: 'button',
              disabled: problemIndex <= 0,
              onClick: this.handlePrevious,
            },
            `‹ ${t('Previous')}`,
          ),
        !testMode && h('span', {}, `${problemIndex + 1} / ${problemCount}`),
        !testMode &&
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
        interpretation?.kind === 'score' &&
          phase === 'solving' &&
          h(
            'button',
            {type: 'button', onClick: this.handleScoreCheck},
            t('Check answer'),
          ),
        !testMode &&
          problemCount > 1 &&
          h(
            'label',
            {class: 'tsumego-auto-next'},
            h('input', {
              type: 'checkbox',
              checked: this.props.autoNext === true,
              onChange: (evt) =>
                this.props.onAutoNextChange?.(evt.target.checked),
            }),
            t('Auto next'),
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
