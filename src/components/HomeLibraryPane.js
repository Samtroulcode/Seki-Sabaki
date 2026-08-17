import {h, Component} from 'preact'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import {
  getLibraryConfig,
  listBuiltinLibraryEntries,
  listLibraryEntries,
  openBuiltinLibraryFile,
  openLibraryFile,
} from '../modules/library.js'

const t = i18n.context('HomeDashboard')

const MAX_ENTRIES = 5
const BUILTIN_FALLBACK_ROOT = 'games'

// Compact Library browser pane shown inside the Local card. Lists the root of
// the User Library, or falls back to the built-in Library's `games/` folder
// when no User Library is configured. Entries come pre-sorted by the Library
// backend (directories first, then files, locale-aware).
export default class HomeLibraryPane extends Component {
  constructor(props) {
    super(props)
    this.state = {
      source: null, // 'user' | 'builtin'
      sourceLabel: null,
      entries: [],
      busy: true,
      error: null,
    }
  }

  componentDidMount() {
    this.refresh()
  }

  async refresh() {
    this.setState({busy: true, error: null})
    try {
      let config = await getLibraryConfig()
      let result
      let source
      let sourceLabel

      if (config.configured) {
        result = await listLibraryEntries('')
        source = 'user'
        sourceLabel = t('My Library')
      } else {
        result = await listBuiltinLibraryEntries(BUILTIN_FALLBACK_ROOT)
        source = 'builtin'
        sourceLabel = t('Pro Games')
      }

      if (result?.ok !== true) {
        this.setState({
          source,
          sourceLabel,
          entries: [],
          busy: false,
          error: t('Unable to read this Library folder.'),
        })
        return
      }

      this.setState({
        source,
        sourceLabel,
        entries: result.entries || [],
        busy: false,
        error: null,
      })
    } catch (err) {
      this.setState({
        entries: [],
        busy: false,
        error: t('Unable to load the Library.'),
      })
    }
  }

  async handleEntryClick(entry) {
    if (entry.type === 'directory') {
      // The Home preview does not inline folder navigation; hand off to the
      // Library workspace instead.
      sabaki.openWorkspaceTab('library')
      return
    }

    this.setState({error: null})
    let result =
      this.state.source === 'builtin'
        ? await openBuiltinLibraryFile(entry.relativePath)
        : await openLibraryFile(entry.relativePath)

    if (result?.ok !== true) {
      this.setState({error: t('Unable to open this SGF file.')})
      return
    }

    await sabaki.openContentInNewBoardTab(result.content, 'sgf', {
      gotoEnd: true,
      representedFilename: result.path,
    })
  }

  render() {
    let {sourceLabel, entries, busy, error} = this.state
    let visibleEntries = entries.slice(0, MAX_ENTRIES)

    return h(
      'section',
      {class: 'home-pane home-library-pane'},
      h('h3', {}, t('Library')),
      sourceLabel != null &&
        h('p', {class: 'home-library-source'}, sourceLabel),
      busy
        ? h('p', {class: 'home-library-empty'}, t('Loading Library…'))
        : error != null
          ? h('p', {class: 'home-library-empty'}, error)
          : visibleEntries.length === 0
            ? h('p', {class: 'home-library-empty'}, t('This Library is empty.'))
            : h(
                'div',
                {class: 'home-library-list'},
                visibleEntries.map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.relativePath,
                      type: 'button',
                      class: `home-library-entry home-library-entry-${entry.type}`,
                      onClick: () => this.handleEntryClick(entry),
                    },
                    h('img', {
                      class: 'home-library-entry-icon',
                      src: `./node_modules/@primer/octicons/build/svg/${
                        entry.type === 'directory'
                          ? 'file-directory-16.svg'
                          : 'file-16.svg'
                      }`,
                      alt: '',
                      'aria-hidden': 'true',
                    }),
                    h('span', {class: 'home-library-entry-name'}, entry.name),
                  ),
                ),
              ),
      h(
        'button',
        {
          type: 'button',
          class: 'home-library-open',
          onClick: () => sabaki.openWorkspaceTab('library'),
        },
        t('Open Library'),
      ),
    )
  }
}
