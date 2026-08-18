import {h, Component} from 'preact'

import i18n from '../i18n.js'

const t = i18n.context('TsumegoCreator')

const MARKUP_TOOLS = [
  {id: 'cross', title: 'Cross Tool', icon: './img/edit/cross.svg'},
  {id: 'triangle', title: 'Triangle Tool', icon: './img/edit/triangle.svg'},
  {id: 'square', title: 'Square Tool', icon: './img/edit/square.svg'},
  {id: 'circle', title: 'Circle Tool', icon: './img/edit/circle.svg'},
]

export default class TsumegoCreatorToolbar extends Component {
  render({mode, selectedTool, onToolChange}) {
    let isSetup = mode === 'setup'
    let positionTools = isSetup
      ? [
          {id: 'B', title: t('Place Black'), stone: 'black'},
          {id: 'W', title: t('Place White'), stone: 'white'},
          {id: 'erase', title: t('Erase'), label: t('Erase')},
        ]
      : [{id: 'move', title: t('Move'), label: t('Move')}]

    return h(
      'div',
      {
        class: 'tsumego-creator-toolbar',
        role: 'toolbar',
        'aria-label': t('Tools'),
      },
      h(
        'div',
        {class: 'tsumego-creator-toolbar-group'},
        positionTools.map((tool) =>
          this.renderButton(tool, selectedTool, onToolChange),
        ),
      ),
      h('div', {
        class: 'tsumego-creator-toolbar-separator',
        'aria-hidden': 'true',
      }),
      h(
        'div',
        {class: 'tsumego-creator-toolbar-group'},
        MARKUP_TOOLS.map((tool) =>
          this.renderButton(tool, selectedTool, onToolChange),
        ),
      ),
    )
  }

  renderButton(tool, selectedTool, onToolChange) {
    let selected = tool.id === selectedTool
    let content

    if (tool.stone != null) {
      content = h('span', {
        class: `tsumego-creator-toolbar-stone stone-${tool.stone}`,
      })
    } else if (tool.icon != null) {
      content = h(
        'span',
        {class: 'tsumego-creator-toolbar-icon markup'},
        h('img', {src: tool.icon, alt: ''}),
      )
    } else {
      content = h('span', {class: 'tsumego-creator-toolbar-label'}, tool.label)
    }

    return h(
      'button',
      {
        key: tool.id,
        type: 'button',
        class: selected ? 'selected' : '',
        title: tool.title,
        'aria-label': tool.title,
        'aria-pressed': selected,
        onClick: () => onToolChange(tool.id),
      },
      content,
    )
  }
}
