import {h, Component} from 'preact'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import {parseSgfPreview} from '../modules/sgfpreview.js'
import {
  chooseLibraryRoot,
  getLibraryConfig,
  listLibraryEntries,
  openLibraryFile,
} from '../modules/library.js'
import {MiniGoban} from './sidebars/OgsGameHistory.js'

const t = i18n.context('HomeView')

export default class LibraryPanel extends Component {
  constructor(props) {
    super(props)
    this.state = {
      config: null,
      entries: [],
      currentPath: '',
      truncated: false,
      busy: true,
      error: null,
      changingRoot: false,
    }
  }

  componentDidMount() {
    this.refresh()
  }

  async refresh(relativePath = this.state.currentPath) {
    try {
      let config = await getLibraryConfig()
      if (relativePath !== this.state.currentPath) return
      if (!config.configured) {
        this.setState({
          config,
          entries: [],
          truncated: false,
          busy: false,
          error: null,
        })
        return
      }

      let result = await listLibraryEntries(relativePath)
      if (relativePath !== this.state.currentPath) return
      if (!result.ok) {
        this.setState({
          config,
          entries: [],
          truncated: false,
          busy: false,
          error: t('Unable to read this Library folder.'),
        })
        return
      }
      this.setState({
        config,
        entries: result.entries || [],
        truncated: result.truncated === true,
        busy: false,
        error: null,
      })
    } catch (err) {
      let configured = this.state.config?.configured === true
      this.setState({
        config: configured ? this.state.config : {configured: false},
        entries: [],
        truncated: false,
        busy: false,
        error: configured
          ? t('Unable to read this Library folder.')
          : t('Unable to load Library settings.'),
      })
    }
  }

  async handleChooseRoot() {
    this.setState({busy: true, error: null})
    try {
      let result = await chooseLibraryRoot()
      if (result.ok) {
        this.setState({
          config: {configured: true, root: result.root},
          currentPath: '',
          truncated: false,
          busy: true,
          changingRoot: false,
        })
        await this.refresh('')
      } else if (!result.cancelled) {
        this.setState({
          busy: false,
          changingRoot: false,
          error: t('This folder cannot be used as a Library.'),
        })
      } else {
        this.setState({busy: false, changingRoot: false})
      }
    } catch (err) {
      this.setState({
        busy: false,
        changingRoot: false,
        error: t('Unable to choose a Library folder.'),
      })
    }
  }

  async handleEntryClick(entry) {
    try {
      if (entry.type === 'directory') {
        this.setState({currentPath: entry.relativePath, busy: true})
        await this.refresh(entry.relativePath)
        return
      }

      this.setState({error: null})
      let result = await openLibraryFile(entry.relativePath)
      if (!result?.ok) {
        this.setState({error: t('Unable to open this SGF file.')})
        return
      }

      await sabaki.openContentInNewBoardTab(result.content, 'sgf', {
        gotoEnd: true,
        representedFilename: result.path,
      })
    } catch (err) {
      this.setState({
        busy: false,
        error: t('Unable to open this Library item.'),
      })
    }
  }

  async handleParentClick() {
    try {
      let parts = this.state.currentPath.split(/[\\/]/).filter(Boolean)
      parts.pop()
      let parentPath = parts.join('/')
      this.setState({currentPath: parentPath, busy: true})
      await this.refresh(parentPath)
    } catch (err) {
      this.setState({
        busy: false,
        error: t('Unable to open this Library folder.'),
      })
    }
  }

  render() {
    let {config, entries, currentPath, truncated, busy, error, changingRoot} =
      this.state
    let configured = config?.configured === true

    return h(
      'section',
      {
        id: 'library-dashboard',
        class: `library-panel ${configured ? 'is-configured' : ''}`,
      },
      h('h1', {}, t('Library')),
      h(
        'p',
        {class: 'library-panel-intro'},
        t('Keep your local SGF games organized and easy to reopen.'),
      ),
      error != null && h('p', {class: 'ogs-error'}, error),
      busy && config == null
        ? h('p', {class: 'library-panel-status'}, t('Loading Library…'))
        : !configured
          ? h(
              'article',
              {class: 'library-setup-card'},
              h('h2', {}, t('Choose your Library folder')),
              h(
                'p',
                {},
                t('Seki will use this folder to read and save your SGF games.'),
              ),
              h(
                'p',
                {class: 'library-setup-warning'},
                t(
                  'Later, Seki may create a Tsumego folder at its root for tsumego SGF files. Existing files will not be moved or copied automatically.',
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: busy,
                  onClick: () => this.handleChooseRoot(),
                },
                busy ? t('Checking folder…') : t('Choose folder'),
              ),
            )
          : h(
              'article',
              {class: 'library-browser-card'},
              h(
                'div',
                {class: 'library-browser-toolbar'},
                h(
                  'div',
                  {},
                  h('h2', {}, t('Library folder')),
                  h('p', {class: 'library-root-path'}, config.root),
                ),
                h(
                  'div',
                  {class: 'library-change-folder-action'},
                  changingRoot &&
                    h(
                      'p',
                      {class: 'library-setup-warning'},
                      t(
                        'Changing the Library folder will create its Tsumego folder if needed.',
                      ),
                    ),
                  h(
                    'button',
                    {
                      type: 'button',
                      disabled: busy,
                      onClick: () =>
                        this.setState({changingRoot: true}, () =>
                          this.handleChooseRoot(),
                        ),
                    },
                    t('Change folder'),
                  ),
                ),
              ),
              h(
                'p',
                {class: 'library-current-path'},
                currentPath === '' ? t('Library root') : currentPath,
              ),
              truncated &&
                h(
                  'p',
                  {class: 'library-list-warning'},
                  t('Only the first 256 entries are shown.'),
                ),
              currentPath !== '' &&
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'library-parent-button',
                    disabled: busy,
                    onClick: () => this.handleParentClick(),
                  },
                  t('Up one folder'),
                ),
              busy
                ? h('p', {class: 'library-panel-status'}, t('Loading…'))
                : entries.length === 0
                  ? h('p', {class: 'library-empty'}, t('This folder is empty.'))
                  : h(
                      'div',
                      {class: 'library-entry-grid'},
                      entries.map((entry) =>
                        renderLibraryEntry(entry, (value) =>
                          this.handleEntryClick(value),
                        ),
                      ),
                    ),
            ),
    )
  }
}

function renderLibraryEntry(entry, onClick) {
  let preview =
    entry.type === 'file' ? parseSgfPreview(entry.previewContent) : null

  return h(
    'button',
    {
      key: entry.relativePath,
      type: 'button',
      class: `library-entry library-entry-${entry.type}`,
      onClick: () => onClick(entry),
    },
    entry.type === 'directory'
      ? h('img', {
          class: 'library-folder-icon',
          src: './node_modules/@primer/octicons/build/svg/file-directory-16.svg',
          alt: '',
          'aria-hidden': 'true',
        })
      : h(MiniGoban, {
          board: preview,
          preview,
          status: preview == null ? 'error' : 'idle',
        }),
    h('span', {class: 'library-entry-name'}, entry.name),
  )
}
