import {h, Component} from 'preact'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import {
  getLibraryConfig,
  listBuiltinLibraryEntries,
  listLibraryEntries,
} from '../modules/library.js'

const t = i18n.context('HomeDashboard')

const MAX_FOLDERS = 4
const BUILTIN_FALLBACK_ROOT = 'games'

// Library preview pane shown inside the Local card. Shows up to four folders
// from the User Library root and up to four folders from the built-in
// Library's `games/` collection, side by side. Clicking a folder opens the
// Library workspace at that source and folder.
export default class HomeLibraryPane extends Component {
  constructor(props) {
    super(props)
    this.state = {
      userFolders: [],
      builtinFolders: [],
      userBusy: true,
      builtinBusy: true,
      userError: null,
      builtinError: null,
    }
  }

  componentDidMount() {
    this.refresh()
  }

  async refresh() {
    this.setState({
      userBusy: true,
      builtinBusy: true,
      userError: null,
      builtinError: null,
    })
    await Promise.all([this.refreshUser(), this.refreshBuiltin()])
  }

  async refreshUser() {
    try {
      let config = await getLibraryConfig()
      if (!config.configured) {
        this.setState({userFolders: [], userBusy: false, userError: null})
        return
      }

      let result = await listLibraryEntries('')
      if (result?.ok !== true) {
        this.setState({
          userFolders: [],
          userBusy: false,
          userError: t('Unable to read this Library folder.'),
        })
        return
      }

      let folders = (result.entries || [])
        .filter((entry) => entry.type === 'directory')
        .slice(0, MAX_FOLDERS)
      this.setState({userFolders: folders, userBusy: false, userError: null})
    } catch (err) {
      this.setState({
        userFolders: [],
        userBusy: false,
        userError: t('Unable to load the Library.'),
      })
    }
  }

  async refreshBuiltin() {
    try {
      let result = await listBuiltinLibraryEntries(BUILTIN_FALLBACK_ROOT)
      if (result?.ok !== true) {
        this.setState({
          builtinFolders: [],
          builtinBusy: false,
          builtinError: t('Unable to read the built-in Library.'),
        })
        return
      }

      let folders = (result.entries || [])
        .filter((entry) => entry.type === 'directory')
        .slice(0, MAX_FOLDERS)
      this.setState({
        builtinFolders: folders,
        builtinBusy: false,
        builtinError: null,
      })
    } catch (err) {
      this.setState({
        builtinFolders: [],
        builtinBusy: false,
        builtinError: t('Unable to load the built-in Library.'),
      })
    }
  }

  handleFolderClick(source, entry) {
    sabaki.openWorkspaceTab('library', {
      libraryRequest: {source, currentPath: entry.relativePath},
    })
  }

  render() {
    let {
      userFolders,
      builtinFolders,
      userBusy,
      builtinBusy,
      userError,
      builtinError,
    } = this.state

    return h(
      'section',
      {class: 'home-pane home-library-pane'},
      h('h3', {}, t('Library')),
      h(
        'div',
        {class: 'home-library-sections'},
        this.renderSection(
          'user',
          t('My Library'),
          userFolders,
          userBusy,
          userError,
        ),
        this.renderSection(
          'builtin',
          t('Built-in'),
          builtinFolders,
          builtinBusy,
          builtinError,
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

  renderSection(source, title, folders, busy, error) {
    return h(
      'div',
      {class: 'home-library-section'},
      h('h4', {}, title),
      busy
        ? h('p', {class: 'home-library-empty'}, t('Loading…'))
        : error != null
          ? h('p', {class: 'home-library-empty'}, error)
          : folders.length === 0
            ? h('p', {class: 'home-library-empty'}, t('No folders yet.'))
            : h(
                'div',
                {class: 'home-library-folder-grid'},
                folders.map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.relativePath,
                      type: 'button',
                      class: 'home-library-folder-card',
                      title: entry.name,
                      onClick: () => this.handleFolderClick(source, entry),
                    },
                    h('img', {
                      class: 'home-library-folder-icon',
                      src: './node_modules/@primer/octicons/build/svg/file-directory-24.svg',
                      alt: '',
                      'aria-hidden': 'true',
                    }),
                    h('span', {class: 'home-library-folder-name'}, entry.name),
                  ),
                ),
              ),
    )
  }
}
