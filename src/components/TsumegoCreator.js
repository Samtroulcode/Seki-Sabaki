import {h, Component} from 'preact'

import i18n from '../i18n.js'
import * as sound from '../modules/sound.js'
import {
  createDraft,
  getBoard,
  hasStones,
  serialize,
  setBoardSize,
  setComment,
  setPlayerToMove,
  setSetupStone,
} from '../modules/tsumegocreator.js'
import Goban from './Goban.js'

const t = i18n.context('TsumegoCreator')
const SIZES = [
  {value: 9, label: '9x9'},
  {value: 13, label: '13x13'},
  {value: 19, label: '19x19'},
]

export default class TsumegoCreator extends Component {
  constructor(props) {
    super(props)
    this.state = {
      gameTree: createDraft(19),
      tool: 'B',
      dirty: false,
    }
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

  handleSizeChange = (size) => {
    if (size === this.currentSize) return

    if (hasStones(this.state.gameTree)) {
      let confirmed = window.confirm(
        t('Changing board size will clear the current setup. Continue?'),
      )
      if (!confirmed) return
    }

    this.setState({
      gameTree: setBoardSize(this.state.gameTree, size),
      dirty: true,
    })
  }

  handleToolChange = (tool) => {
    if (tool === this.state.tool) return
    this.setState({tool, dirty: true})
  }

  handlePlayerChange = (color) => {
    if (color === this.playerToMove) return
    this.setState({
      gameTree: setPlayerToMove(this.state.gameTree, color),
      dirty: true,
    })
  }

  handleCommentChange = (evt) => {
    this.setState({
      gameTree: setComment(this.state.gameTree, evt.target.value),
      dirty: true,
    })
  }

  handleVertexClick = (evt) => {
    if (evt.vertex == null) return

    let {gameTree, tool} = this.state
    let previousBoard = getBoard(gameTree)
    let hadStone = previousBoard.get(evt.vertex) !== 0

    let nextTree = setSetupStone(gameTree, evt.vertex, tool)
    let changed = nextTree !== gameTree

    if (changed) {
      let nextBoard = getBoard(nextTree)
      let hasStone = nextBoard.get(evt.vertex) !== 0
      if (tool !== null && hasStone && !hadStone) sound.playPachi()

      this.setState({gameTree: nextTree, dirty: true})
    }
  }

  handleBack = () => {
    if (this.state.dirty) {
      let confirmed = window.confirm(t('Your draft will be lost. Go back?'))
      if (!confirmed) return
    }

    this.props.onBack()
  }

  render() {
    let {gameTree, tool} = this.state
    let board = getBoard(gameTree)
    let currentThemeId = window.sabaki.setting.get('theme.current')

    return h(
      'div',
      {class: 'tsumego-creator', 'data-test-sgf': serialize(gameTree)},
      h(
        'div',
        {class: 'tsumego-creator-board'},
        h(Goban, {
          gameTree,
          treePosition: gameTree.root.id,
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
        {class: 'tsumego-creator-sidebar'},
        h('h2', {}, t('Setup')),
        h(
          'div',
          {class: 'tsumego-creator-group'},
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
          {class: 'tsumego-creator-group'},
          h('h3', {}, t('Stones')),
          h(
            'div',
            {class: 'tsumego-creator-button-row'},
            h(
              'button',
              {
                type: 'button',
                class: tool === 'B' ? 'selected' : '',
                'aria-label': t('Black stone'),
                onClick: () => this.handleToolChange('B'),
              },
              t('Black'),
            ),
            h(
              'button',
              {
                type: 'button',
                class: tool === 'W' ? 'selected' : '',
                'aria-label': t('White stone'),
                onClick: () => this.handleToolChange('W'),
              },
              t('White'),
            ),
            h(
              'button',
              {
                type: 'button',
                class: tool === null ? 'selected' : '',
                'aria-label': t('Erase stone'),
                onClick: () => this.handleToolChange(null),
              },
              t('Erase'),
            ),
          ),
        ),
        h(
          'div',
          {class: 'tsumego-creator-group'},
          h('h3', {}, t('Player to move')),
          h(
            'div',
            {class: 'tsumego-creator-button-row'},
            h(
              'button',
              {
                type: 'button',
                class: this.playerToMove === 'B' ? 'selected' : '',
                'aria-label': t('Black to move'),
                onClick: () => this.handlePlayerChange('B'),
              },
              t('Black'),
            ),
            h(
              'button',
              {
                type: 'button',
                class: this.playerToMove === 'W' ? 'selected' : '',
                'aria-label': t('White to move'),
                onClick: () => this.handlePlayerChange('W'),
              },
              t('White'),
            ),
          ),
        ),
        h(
          'div',
          {class: 'tsumego-creator-group'},
          h('h3', {}, t('Problem statement')),
          h('textarea', {
            class: 'tsumego-creator-comment',
            rows: 4,
            value: this.comment,
            onInput: this.handleCommentChange,
            placeholder: t('Black to play and live.'),
          }),
        ),
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
}
