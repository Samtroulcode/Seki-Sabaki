import {h} from 'preact'
import {MiniGoban} from './sidebars/OgsGameHistory.js'

export default function HomeBoardPreview({width, height = width}) {
  let signMap = [...Array(height)].map(() => [...Array(width)].fill(0))

  return h(MiniGoban, {
    preview: {width, height, signMap},
    status: 'idle',
  })
}
