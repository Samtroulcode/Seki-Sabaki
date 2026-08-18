import {h, Component} from 'preact'

import i18n from '../i18n.js'
import * as sound from '../modules/sound.js'
import {showInputBox} from '../modules/dialog.js'
import {
  applyNumberLabel,
  createDraft,
  deleteBranch,
  getBoard,
  getLabel,
  getNextPlayer,
  getNodeComment,
  getNodeResult,
  hasSolutionMoves,
  hasStones,
  playMove,
  resetDraft,
  serialize,
  setBoardSize,
  setComment,
  setLabel,
  setNodeComment,
  setNodeResult,
  setPlayerToMove,
  setSetupStone,
  toggleLineMarkup,
  toggleMarkup,
} from '../modules/tsumegocreator.js'
import {validateTsumegoTree} from '../modules/tsumegovalidator.js'
import Goban from './Goban.js'
import GameGraph from './sidebars/GameGraph.js'
import TsumegoCreatorToolbar from './TsumegoCreatorToolbar.js'

const t = i18n.context('TsumegoCreator')
const SIZES = [
  {value: 9, label: '9x9'},
  {value: 13, label: '13x13'},
  {value: 19, label: '19x19'},
]
const MARKUP_PROPERTY = {
  cross: 'MA',
  triangle: 'TR',
  square: 'SQ',
  circle: 'CR',
}
const DEFAULT_TOOL = {setup: 'B', solution: 'move'}

export default class TsumegoCreator extends Component {
  constructor(props) {
    super(props)
    this.state = {
      gameTree: createDraft(19),
      tool: 'B',
      mode: 'setup',
      currentNodeId: null,
      dirty: false,
    }
  }

  get currentNodeId() {
    return this.state.currentNodeId ?? this.state.gameTree.root.id
  }

  get currentSize() {
    return +this.state.gameTree.root.data.SZ[0]
  }

  get playerToMove() {
    return this.state.gameTree.root.data.PL?.[0] || 'B'
  }

  get comment() {
    return this.state.gameTree.root.data.C?.[0] || ''
  }

  get isCurrentNodeRoot() {
    return this.currentNodeId === this.state.gameTree.root.id
  }

  get currentNodeResult() {
    return getNodeResult(this.state.gameTree, this.currentNodeId)
  }

  get currentNodeComment() {
    return getNodeComment(this.state.gameTree, this.currentNodeId)
  }

  get selectedPositionLabel() {
    if (this.isCurrentNodeRoot) return t('Root')

    let node = this.state.gameTree.get(this.currentNodeId)
    if (node == null) return t('Root')

    let color = node.data.B != null ? 'B' : node.data.W != null ? 'W' : null
    if (color == null) return t('Root')

    return `${color}[${node.data[color][0]}]`
  }

  get validation() {
    return validateTsumegoTree(this.state.gameTree)
  }

  handleSizeChange = (size) => {
    if (size === this.currentSize) return

    let needsFullReset = hasSolutionMoves(this.state.gameTree)
    if (hasStones(this.state.gameTree) || needsFullReset) {
      let message = needsFullReset
        ? t(
            'Changing board size will reset the entire draft including the solution tree. Continue?',
          )
        : t('Changing board size will clear the current setup. Continue?')
      if (!window.confirm(message)) return
    }

    this.setState({
      gameTree: needsFullReset
        ? resetDraft(size)
        : setBoardSize(this.state.gameTree, size),
      currentNodeId: null,
      dirty: true,
    })
  }

  handleToolChange = (tool) => {
    let nextTool = tool === 'erase' ? null : tool
    if (nextTool === this.state.tool) return
    this.setState({tool: nextTool})
    // Tool changes are pure UI state and do not modify the SGF.
  }

  handlePlayerChange = (color) => {
    if (color === this.playerToMove) return
    this.setState({
      gameTree: setPlayerToMove(this.state.gameTree, color),
      dirty: true,
    })
  }

  handleCommentChange = (evt) => {
    let nextTree = setComment(this.state.gameTree, evt.target.value)
    if (nextTree === this.state.gameTree) return

    this.setState({gameTree: nextTree, dirty: true})
  }

  handleNodeResultChange = (result) => {
    if (this.isCurrentNodeRoot) return

    let nextTree = setNodeResult(
      this.state.gameTree,
      this.currentNodeId,
      result,
    )
    if (nextTree === this.state.gameTree) return

    this.setState({gameTree: nextTree, dirty: true})
  }

  handleNodeCommentChange = (evt) => {
    if (this.isCurrentNodeRoot) return

    let nextTree = setNodeComment(
      this.state.gameTree,
      this.currentNodeId,
      evt.target.value,
    )
    if (nextTree === this.state.gameTree) return

    this.setState({gameTree: nextTree, dirty: true})
  }

  handleDeleteBranch = () => {
    if (this.isCurrentNodeRoot) return

    let confirmed = window.confirm(
      t('Delete this branch and all its continuations?'),
    )
    if (!confirmed) return

    let result = deleteBranch(this.state.gameTree, this.currentNodeId)
    if (result == null) return

    this.setState({
      gameTree: result.tree,
      currentNodeId: result.parentId,
      dirty: true,
    })
  }

  handleVertexClick = (evt) => {
    if (evt.vertex == null) return

    let tool = this.state.tool
    // Line and Arrow are drawn exclusively through onLineDraw; a plain click
    // with one of them selected must not place stones, moves or markup.
    if (tool === 'line' || tool === 'arrow') return

    if (this.state.mode === 'setup') {
      if (this.isAnnotationTool(tool)) {
        this.handleAnnotationClick(evt.vertex, this.state.gameTree.root.id)
      } else {
        this.handleSetupVertexClick(evt.vertex)
      }
    } else if (tool === 'move') {
      this.handleSolutionVertexClick(evt.vertex)
    } else {
      this.handleAnnotationClick(evt.vertex, this.currentNodeId)
    }
  }

  handleLineDraw = (evt) => {
    let line = evt.line
    if (line == null) return

    let tool = this.state.tool
    if (tool !== 'line' && tool !== 'arrow') return

    let type = tool === 'line' ? 'LN' : 'AR'
    let nodeId =
      this.state.mode === 'setup'
        ? this.state.gameTree.root.id
        : this.currentNodeId

    let nextTree = toggleLineMarkup(
      this.state.gameTree,
      nodeId,
      type,
      line.v1,
      line.v2,
    )
    if (nextTree === this.state.gameTree) return

    this.setState({gameTree: nextTree, dirty: true})
  }

  isAnnotationTool(tool) {
    return (
      MARKUP_PROPERTY[tool] != null || tool === 'label' || tool === 'number'
    )
  }

  handleAnnotationClick(vertex, nodeId) {
    let tool = this.state.tool

    if (tool === 'label') {
      this.handleLabelClick(vertex, nodeId)
      return
    }

    if (tool === 'number') {
      let nextTree = applyNumberLabel(this.state.gameTree, nodeId, vertex)
      if (nextTree === this.state.gameTree) return
      this.setState({gameTree: nextTree, dirty: true})
      return
    }

    let type = MARKUP_PROPERTY[tool]
    let nextTree = toggleMarkup(this.state.gameTree, nodeId, type, vertex)
    if (nextTree === this.state.gameTree) return

    this.setState({gameTree: nextTree, dirty: true})
  }

  handleLabelClick = async (vertex, nodeId) => {
    let current = getLabel(this.state.gameTree, nodeId, vertex)
    let value = await showInputBox(t('Enter label text'), current)
    if (value == null) return

    let nextTree = setLabel(this.state.gameTree, nodeId, vertex, value)
    if (nextTree === this.state.gameTree) return

    this.setState({gameTree: nextTree, dirty: true})
  }

  handleSetupVertexClick(vertex) {
    let {gameTree, tool} = this.state
    let previousBoard = getBoard(gameTree)
    let hadStone = previousBoard.get(vertex) !== 0

    let nextTree = setSetupStone(gameTree, vertex, tool)
    let changed = nextTree !== gameTree

    if (changed) {
      let nextBoard = getBoard(nextTree)
      let hasStone = nextBoard.get(vertex) !== 0
      if (tool !== null && hasStone && !hadStone) sound.playPachi()

      this.setState({gameTree: nextTree, dirty: true})
    }
  }

  handleSolutionVertexClick(vertex) {
    let result = playMove(this.state.gameTree, this.currentNodeId, vertex)
    if (result == null) return

    if (result.created) sound.playPachi()
    this.setState({
      gameTree: result.tree,
      currentNodeId: result.nodeId,
      dirty: result.created ? true : this.state.dirty,
    })
  }

  handleModeChange = (mode) => {
    if (mode === this.state.mode) return
    this.setState({
      mode,
      tool: DEFAULT_TOOL[mode],
      currentNodeId: this.state.gameTree.root.id,
      // Navigation between modes never modifies the SGF.
    })
  }

  handleRootClick = () => {
    this.setState({currentNodeId: this.state.gameTree.root.id})
    // Navigation never modifies the SGF.
  }

  handleGraphNodeClick = (evt) => {
    if (evt.button !== 0 || evt.treePosition == null) return
    this.setState({currentNodeId: evt.treePosition})
    // Navigation never modifies the SGF.
  }

  handleGraphWheel = (step) => {
    let next = this.state.gameTree.navigate(this.currentNodeId, step, {})
    if (next == null) return
    this.setState({currentNodeId: next.id})
    // Navigation never modifies the SGF.
  }

  handleBack = () => {
    if (this.state.dirty) {
      let confirmed = window.confirm(t('Your draft will be lost. Go back?'))
      if (!confirmed) return
    }

    this.props.onBack()
  }

  render() {
    let {gameTree, tool, mode} = this.state
    let isSetup = mode === 'setup'
    let board = getBoard(
      gameTree,
      isSetup ? gameTree.root.id : this.currentNodeId,
    )
    let currentThemeId = window.sabaki.setting.get('theme.current')
    let graphGridSize = window.sabaki.setting.get('graph.grid_size')
    let graphNodeSize = window.sabaki.setting.get('graph.node_size')

    return h(
      'div',
      {
        class: 'tsumego-creator',
        'data-test-sgf': serialize(gameTree),
        'data-test-current-node-id': this.currentNodeId,
        'data-test-current-tool': tool === null ? 'erase' : tool,
      },
      h(
        'div',
        {class: 'tsumego-creator-board'},
        h(Goban, {
          gameTree,
          treePosition: isSetup ? gameTree.root.id : this.currentNodeId,
          board,
          transformation: '',
          currentThemeId,
          showNextMoves: false,
          showSiblings: false,
          showMoveNumbers: false,
          showMoveColorization: false,
          fuzzyStonePlacement: false,
          animateStonePlacement: false,
          drawLineMode: tool === 'line' || tool === 'arrow' ? tool : null,
          onVertexClick: this.handleVertexClick,
          onLineDraw: this.handleLineDraw,
        }),
      ),
      h(TsumegoCreatorToolbar, {
        mode,
        selectedTool: tool === null ? 'erase' : tool,
        onToolChange: this.handleToolChange,
      }),
      h(
        'aside',
        {class: 'tsumego-creator-sidebar'},
        h(
          'div',
          {class: 'tsumego-creator-mode-tabs'},
          h(
            'button',
            {
              type: 'button',
              class: isSetup ? 'selected' : '',
              onClick: () => this.handleModeChange('setup'),
            },
            t('Setup'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: !isSetup ? 'selected' : '',
              onClick: () => this.handleModeChange('solution'),
            },
            t('Solution'),
          ),
        ),
        isSetup ? this.renderSetupSidebar() : this.renderSolutionSidebar(),
      ),
      h(
        'div',
        {class: 'tsumego-creator-navigation'},
        h(
          'button',
          {type: 'button', onClick: this.handleBack},
          `‹ ${t('Back')}`,
        ),
      ),
    )
  }

  renderSetupSidebar() {
    return [
      h('h2', {key: 'title'}, t('Setup')),
      h(
        'div',
        {key: 'size', class: 'tsumego-creator-group'},
        h('h3', {}, t('Board size')),
        h(
          'div',
          {class: 'tsumego-creator-button-row'},
          SIZES.map(({value, label}) =>
            h(
              'button',
              {
                key: value,
                type: 'button',
                class: value === this.currentSize ? 'selected' : '',
                onClick: () => this.handleSizeChange(value),
              },
              label,
            ),
          ),
        ),
      ),
      h(
        'div',
        {key: 'player', class: 'tsumego-creator-group'},
        h('h3', {}, t('First move')),
        h(
          'div',
          {class: 'tsumego-creator-button-row'},
          h(
            'button',
            {
              type: 'button',
              class: this.playerToMove === 'B' ? 'selected' : '',
              'aria-label': t('Black to play'),
              onClick: () => this.handlePlayerChange('B'),
            },
            t('Black to play'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: this.playerToMove === 'W' ? 'selected' : '',
              'aria-label': t('White to play'),
              onClick: () => this.handlePlayerChange('W'),
            },
            t('White to play'),
          ),
        ),
        h(
          'p',
          {class: 'tsumego-creator-hint'},
          t('Who plays the first move of the problem.'),
        ),
      ),
      h(
        'div',
        {key: 'comment', class: 'tsumego-creator-group'},
        h('h3', {}, t('Problem statement')),
        h('textarea', {
          class: 'tsumego-creator-comment',
          rows: 4,
          value: this.comment,
          onInput: this.handleCommentChange,
          placeholder: t('Black to play and live.'),
        }),
      ),
    ]
  }

  renderSolutionSidebar() {
    let {gameTree} = this.state
    let nextPlayer = getNextPlayer(gameTree, this.currentNodeId)
    let graphGridSize = window.sabaki.setting.get('graph.grid_size')
    let graphNodeSize = window.sabaki.setting.get('graph.node_size')
    let result = this.currentNodeResult
    let isRoot = this.isCurrentNodeRoot
    let validation = this.validation
    let validationMessage = validation.valid
      ? t('Problem valid')
      : validation.errors[0] != null
        ? `${t('Incomplete problem')} — ${t(validation.errors[0].message)}`
        : t('Incomplete problem')

    return [
      h('h2', {key: 'title'}, t('Solution')),
      h(
        'p',
        {
          key: 'validation',
          class: [
            'tsumego-creator-validation',
            validation.valid ? 'valid' : 'invalid',
          ].join(' '),
          'data-test-validation': validation.valid ? 'valid' : 'invalid',
        },
        validationMessage,
      ),
      h(
        'p',
        {
          key: 'player',
          class: 'tsumego-creator-player-to-move',
        },
        nextPlayer === 'B' ? t('Black to play') : t('White to play'),
      ),
      h(
        'div',
        {key: 'graph', class: 'tsumego-creator-graph'},
        h(GameGraph, {
          gameTree,
          gameCurrents: {},
          treePosition: this.currentNodeId,
          showGameGraph: true,
          height: 180,
          gridSize: graphGridSize,
          nodeSize: graphNodeSize,
          onNodeClick: this.handleGraphNodeClick,
          onWheelNavigation: this.handleGraphWheel,
        }),
      ),
      h(
        'div',
        {key: 'root', class: 'tsumego-creator-group'},
        h('button', {type: 'button', onClick: this.handleRootClick}, t('Root')),
      ),
      h(
        'p',
        {key: 'position', class: 'tsumego-creator-selected-position'},
        `${t('Selected position')}: ${this.selectedPositionLabel}`,
      ),
      h(
        'div',
        {key: 'result', class: 'tsumego-creator-group'},
        h('h3', {}, t('Result')),
        h(
          'div',
          {class: 'tsumego-creator-button-row'},
          h(
            'button',
            {
              type: 'button',
              class: ['result-correct', result === 'correct' ? 'selected' : '']
                .filter(Boolean)
                .join(' '),
              disabled: isRoot,
              onClick: () => this.handleNodeResultChange('correct'),
            },
            t('Correct'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: ['result-wrong', result === 'wrong' ? 'selected' : '']
                .filter(Boolean)
                .join(' '),
              disabled: isRoot,
              onClick: () => this.handleNodeResultChange('wrong'),
            },
            t('Wrong'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'result-clear',
              disabled: isRoot || result == null,
              onClick: () => this.handleNodeResultChange(null),
            },
            t('Clear'),
          ),
        ),
      ),
      isRoot
        ? h(
            'p',
            {key: 'root-hint', class: 'tsumego-creator-hint'},
            t('Select a move to edit its result or comment.'),
          )
        : h(
            'div',
            {key: 'comment', class: 'tsumego-creator-group'},
            h('h3', {}, t('Comment for selected position')),
            h('textarea', {
              class: 'tsumego-creator-comment',
              rows: 4,
              value: this.currentNodeComment,
              onInput: this.handleNodeCommentChange,
              placeholder: t('Explain this variation.'),
              'data-test-node-comment': true,
            }),
          ),
      h(
        'div',
        {key: 'delete', class: 'tsumego-creator-group'},
        h(
          'button',
          {
            type: 'button',
            class: 'tsumego-creator-delete-branch',
            disabled: isRoot,
            onClick: this.handleDeleteBranch,
          },
          t('Delete Branch'),
        ),
      ),
    ]
  }
}
