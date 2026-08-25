import {h, Component} from 'preact'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import {getRecentLibraryFiles, openLibraryFile} from '../modules/library.js'
import {parseSgfPreview} from '../modules/sgfpreview.js'
import {MiniGoban} from './sidebars/OgsGameHistory.js'

const t = i18n.context('HomeDashboard')
const MAX_RECENT_FILES = 3

function formatRelativeDate(timestamp) {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return ''
  let date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  let now = new Date()
  let diffMs = now - date
  let diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return t('Today')
  if (diffDays === 1) return t('Yesterday')
  if (diffDays < 7) return `${diffDays} ${t('days ago')}`
  return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'})
}

function getRelativeFolder(relativePath) {
  if (typeof relativePath !== 'string') return ''
  let parts = relativePath.split(/[/\\]/)
  // Remove the filename (last part)
  parts.pop()
  return parts.join(' / ')
}

export default class HomeRecentCard extends Component {
  constructor(props) {
    super(props)
    this.state = {busy: false, error: null, entries: [], loaded: false}
  }

  async componentDidMount() {
    await this.loadRecentFiles()
  }

  async loadRecentFiles() {
    this.setState({busy: true, error: null})
    try {
      let result = await getRecentLibraryFiles(MAX_RECENT_FILES)
      if (result?.ok) {
        this.setState({
          entries: result.entries || [],
          loaded: true,
          busy: false,
        })
      } else if (result?.code === 'not-configured') {
        // Library not configured — render nothing
        this.setState({entries: [], loaded: true, busy: false})
      } else {
        this.setState({entries: [], loaded: true, busy: false})
      }
    } catch (err) {
      this.setState({entries: [], loaded: true, busy: false, error: null})
    }
  }

  async handleOpen(entry) {
    try {
      let result = await openLibraryFile(entry.relativePath)
      if (!result?.ok) return
      await sabaki.openContentInNewBoardTab(result.content, 'sgf', {
        gotoEnd: true,
        representedFilename: result.path,
      })
    } catch (err) {
      // Silently fail — the file may have been moved or deleted
    }
  }

  render() {
    let {busy, error, entries, loaded} = this.state

    // Don't render if not loaded yet or no entries
    if (!loaded || busy || entries.length === 0) return null
    if (error != null) return null

    return h(
      'section',
      {class: 'home-recent-card'},
      h('header', {class: 'home-recent-header'}, h('h3', {}, t('Recent'))),
      h(
        'ul',
        {class: 'home-recent-list'},
        entries.map((entry) => {
          let preview = parseSgfPreview(entry.previewContent)
          return h(
            'li',
            {key: entry.relativePath, class: 'home-recent-item'},
            h(MiniGoban, {
              board: preview,
              preview,
              status: preview == null ? 'error' : 'idle',
            }),
            h(
              'div',
              {class: 'home-recent-info'},
              h('span', {class: 'home-recent-filename'}, entry.name),
              getRelativeFolder(entry.relativePath) !== '' &&
                h(
                  'span',
                  {class: 'home-recent-path'},
                  getRelativeFolder(entry.relativePath),
                ),
              h(
                'span',
                {class: 'home-recent-date'},
                formatRelativeDate(entry.modifiedAt),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'ui-button ui-button-secondary home-recent-action',
                onClick: () => this.handleOpen(entry),
              },
              t('Open'),
            ),
          )
        }),
      ),
    )
  }
}
