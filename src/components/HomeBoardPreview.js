import {h} from 'preact'
import Board from '@sabaki/go-board'

export default function HomeBoardPreview({width, height = width}) {
  let board = Board.fromDimensions(width, height)
  let maxX = width - 1
  let maxY = height - 1
  let starPoints = board.getHandicapPlacement(9)

  return h(
    'svg',
    {
      viewBox: `0 0 ${maxX} ${maxY}`,
      preserveAspectRatio: 'none',
      role: 'img',
      'aria-label': `${width}x${height} board`,
    },
    [...Array(width)].map((_, index) =>
      h('line', {
        key: `x-${index}`,
        x1: index,
        y1: 0,
        x2: index,
        y2: maxY,
      }),
    ),
    [...Array(height)].map((_, index) =>
      h('line', {
        key: `y-${index}`,
        x1: 0,
        y1: index,
        x2: maxX,
        y2: index,
      }),
    ),
    starPoints.map(([x, y]) =>
      h('circle', {key: `star-${x}-${y}`, cx: x, cy: y, r: 0.14}),
    ),
  )
}
