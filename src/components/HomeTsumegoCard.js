import {h, Component} from 'preact'
import natsort from 'natsort'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import * as gametree from '../modules/gametree.js'
import {analyzeProblem} from '../modules/tsumego.js'
import * as sgfFileFormat from '../modules/fileformats/sgf.js'
import {
  getBuiltinCollectionMetadata,
  listBuiltinLibraryEntries,
  listLibraryEntries,
  openBuiltinLibraryFile,
  openLibraryFile,
} from '../modules/library.js'
import {getLastTsumegoCollection} from '../modules/tsumegocollection.js'
import {
  buildProgressKey,
  getTsumegoProgress,
} from '../modules/tsumegoprogress.js'
import {MiniGoban} from './sidebars/OgsGameHistory.js'

const t = i18n.context('HomeDashboard')
const naturalCompare = natsort({insensitive: true})

const FALLBACK_SOURCE = 'builtin'
const FALLBACK_PATH = 'tsumego/easy'

// Full-width "Continue Tsumego" card shown below the Local/Online cards on the
// Home. Loads the last opened Tsumego collection (falling back to the built-in
// `tsumego/easy`), picks the first unfinished problem, and shows a read-only
// preview of its initial position (never the solution).
export default class HomeTsumegoCard extends Component {
  constructor(props) {
    super(props)
    this.state = {
      busy: true,
      error: null,
      source: null,
      collectionPath: null,
      collectionTitle: null,
      problems: [],
      progress: {},
      selectedIndex: 0,
      preview: null,
      complete: false,
    }
  }

  componentDidMount() {
    this.load()
  }

  async load() {
    this.setState({busy: true, error: null})
    try {
      let progress = {}
      try {
        let result = await getTsumegoProgress()
        progress = result?.problems || {}
      } catch (err) {
        // Non-blocking: keep an empty progress.
      }

      let resolved = await this.resolveCollection()
      if (resolved == null) {
        this.setState({busy: false, error: t('No Tsumego available')})
        return
      }
      let {source, relativePath} = resolved

      let entries = await this.listCollection(source, relativePath)
      let problems = entries
        .filter((entry) => entry.type === 'file')
        .sort((a, b) => naturalCompare(a.name, b.name))
      if (problems.length === 0) {
        this.setState({busy: false, error: t('No Tsumego available')})
        return
      }

      let collectionTitle = await this.getCollectionTitle(source, relativePath)
      let selectedIndex = this.selectProblem(problems, progress, source)
      let complete = this.isComplete(problems, progress, source)
      let parsed = await this.parsePreview(
        source,
        problems[selectedIndex].relativePath,
      )

      this.setState({
        busy: false,
        error: null,
        source,
        collectionPath: relativePath,
        collectionTitle,
        problems,
        progress,
        selectedIndex,
        complete,
        preview: parsed?.preview || null,
      })
    } catch (err) {
      this.setState({busy: false, error: t('No Tsumego available')})
    }
  }

  // Resolves the collection to display: the remembered one when it still
  // exists, otherwise the built-in fallback. Returns null when even the
  // fallback is unavailable.
  async resolveCollection() {
    let last = getLastTsumegoCollection()
    if (
      last != null &&
      (await this.collectionExists(last.source, last.relativePath))
    ) {
      return last
    }
    if (await this.collectionExists(FALLBACK_SOURCE, FALLBACK_PATH)) {
      return {source: FALLBACK_SOURCE, relativePath: FALLBACK_PATH}
    }
    return null
  }

  async collectionExists(source, relativePath) {
    try {
      let result =
        source === 'builtin'
          ? await listBuiltinLibraryEntries(relativePath)
          : await listLibraryEntries(relativePath)
      return result?.ok === true
    } catch (err) {
      return false
    }
  }

  async listCollection(source, relativePath) {
    let result =
      source === 'builtin'
        ? await listBuiltinLibraryEntries(relativePath)
        : await listLibraryEntries(relativePath)
    if (result?.ok !== true) return []
    return result.entries || []
  }

  async getCollectionTitle(source, relativePath) {
    if (source === 'builtin') {
      try {
        let metadata = await getBuiltinCollectionMetadata(relativePath)
        if (metadata?.ok === true && metadata.metadata?.title) {
          return metadata.metadata.title
        }
      } catch (err) {
        // Fall through to the basename.
      }
    }
    let parts = String(relativePath || '')
      .split(/[\\/]/)
      .filter(Boolean)
    return parts[parts.length - 1] || relativePath
  }

  selectProblem(problems, progress, source) {
    let index = problems.findIndex((entry) => {
      let key = buildProgressKey(source, entry.relativePath)
      return key == null || progress[key]?.completed !== true
    })
    return index < 0 ? 0 : index
  }

  isComplete(problems, progress, source) {
    return problems.every((entry) => {
      let key = buildProgressKey(source, entry.relativePath)
      return key != null && progress[key]?.completed === true
    })
  }

  countSolved(problems, progress, source) {
    return problems.filter((entry) => {
      let key = buildProgressKey(source, entry.relativePath)
      return key != null && progress[key]?.completed === true
    }).length
  }

  // Opens the SGF and builds a read-only preview of a tsumego's initial
  // position from its SGF content. Unlike parseSgfPreview (which shows the
  // last main-line node), this uses analyzeProblem's start node so the
  // solution is never revealed.
  async parsePreview(source, relativePath) {
    try {
      let result =
        source === 'builtin'
          ? await openBuiltinLibraryFile(relativePath)
          : await openLibraryFile(relativePath)
      if (result?.ok !== true) return null
      return parseTsumegoPreview(result.content)
    } catch (err) {
      return null
    }
  }

  handleContinue() {
    let {source, collectionPath, problems, selectedIndex} = this.state
    let problem = problems[selectedIndex]
    sabaki.openWorkspaceTab('tsumego', {
      tsumegoRequest: {
        source,
        relativePath: collectionPath,
        problemPath: problem.relativePath,
      },
    })
  }

  handleBrowse() {
    let {source, collectionPath} = this.state
    sabaki.openWorkspaceTab('tsumego', {
      tsumegoRequest: {source, relativePath: collectionPath},
    })
  }

  handleBrowseFallback() {
    sabaki.openWorkspaceTab('tsumego', {tsumegoRequest: null})
  }

  render() {
    let {busy, error} = this.state

    return h(
      'article',
      {class: 'home-study-surface home-card-tsumego'},
      busy
        ? h('p', {class: 'home-tsumego-status'}, t('Loading Tsumego\u2026'))
        : error != null
          ? h(
              'div',
              {class: 'home-tsumego-empty'},
              h('p', {}, error),
              h(
                'button',
                {
                  type: 'button',
                  class: 'ui-button ui-button-secondary',
                  onClick: () => this.handleBrowseFallback(),
                },
                t('Browse Tsumego'),
              ),
            )
          : this.renderContent(),
    )
  }

  renderContent() {
    let {collectionTitle, problems, progress, preview, complete, source} =
      this.state
    let solved = this.countSolved(problems, progress, source)
    let total = problems.length
    let percent = total > 0 ? Math.round((solved / total) * 100) : 0
    let sourceLabel = source === 'builtin' ? t('Built-in') : t('My Library')

    return h(
      'div',
      {class: 'home-tsumego-body'},
      h(
        'div',
        {class: 'home-tsumego-goban'},
        h(MiniGoban, {
          board: {
            width: preview?.width || 19,
            height: preview?.height || 19,
          },
          preview,
          status: preview ? 'idle' : 'error',
        }),
      ),
      h(
        'div',
        {class: 'home-study-details'},
        h('strong', {class: 'home-tsumego-title'}, collectionTitle),
        h(
          'div',
          {class: 'home-tsumego-meta'},
          h(
            'span',
            {class: 'home-tsumego-source'},
            t('Collection: '),
            collectionTitle,
          ),
          h('span', {class: 'home-tsumego-source'}, t('Source: '), sourceLabel),
          h(
            'span',
            {class: 'home-tsumego-solved'},
            `${solved} / ${total} ${t('solved')}`,
          ),
        ),
        total > 0 &&
          h(
            'div',
            {
              class: 'home-tsumego-progress',
              role: 'progressbar',
              'aria-valuenow': percent,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-label': `${solved} / ${total} ${t('solved')}`,
            },
            h('div', {
              class: 'home-tsumego-progress-bar',
              style: {width: `${percent}%`},
            }),
          ),
        h(
          'div',
          {class: 'home-study-actions'},
          h(
            'button',
            {
              type: 'button',
              class: 'ui-button ui-button-primary',
              onClick: () => this.handleContinue(),
            },
            complete ? t('Review') : t('Continue'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'ui-button ui-button-secondary',
              onClick: () => this.handleBrowse(),
            },
            t('Browse Tsumego'),
          ),
        ),
      ),
    )
  }
}

// Builds a read-only preview of a tsumego's initial position from its SGF
// content. Unlike parseSgfPreview (which shows the last main-line node), this
// uses analyzeProblem's start node so the solution is never revealed.
function parseTsumegoPreview(content) {
  try {
    let [tree] = sgfFileFormat.parse(content)
    if (tree == null) return null
    let problem = analyzeProblem(tree, {
      allowTeFallback: true,
      allowMainLineFallback: true,
    })
    if (problem == null) return null
    let board = gametree.getBoard(tree, problem.startNodeId)
    return {
      preview: {
        width: board.width,
        height: board.height,
        signMap: board.signMap.map((row) => [...row]),
        currentVertex: board.currentVertex,
      },
      playerToMove: problem.playerToMove,
    }
  } catch (err) {
    return null
  }
}
