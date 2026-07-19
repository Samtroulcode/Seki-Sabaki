import {h, Component} from 'preact'
import classnames from 'classnames'

export class ToolBarButton extends Component {
  constructor(props) {
    super(props)

    this.handleClick = (evt) => {
      evt.preventDefault()

      if (this.props.disabled) return

      let {onClick = () => {}} = this.props
      onClick(evt)
    }
  }

  render() {
    let {tooltip, icon, checked, menu, disabled} = this.props

    return h(
      'li',
      {
        class: classnames('tool-bar-button', {menu, checked, disabled}),
      },

      h(
        'a',
        {
          href: '#',
          title: tooltip,
          'aria-disabled': disabled ? 'true' : undefined,
          onClick: this.handleClick,
        },

        h('img', {
          class: 'icon',
          height: 16,
          src: icon,
          alt: tooltip,
        }),

        menu &&
          h('img', {
            class: 'dropdown',
            height: 8,
            src: './node_modules/@primer/octicons/build/svg/triangle-down-16.svg',
            alt: '',
          }),
      ),
    )
  }
}

export default class ToolBar extends Component {
  render() {
    return h('div', {class: 'tool-bar'}, h('ul', {}, this.props.children))
  }
}
