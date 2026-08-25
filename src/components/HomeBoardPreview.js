import {h, Component} from 'preact'

import {MiniGoban} from './sidebars/OgsGameHistory.js'

export default class HomeBoardPreview extends Component {
  render({width, height}) {
    let signMap = Array.from({length: height}, () =>
      Array.from({length: width}, () => 0),
    )

    let board = {width, height, signMap}

    return h(MiniGoban, {board, preview: null, status: 'idle'})
  }
}
