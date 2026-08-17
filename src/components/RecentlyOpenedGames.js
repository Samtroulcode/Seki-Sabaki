import {h, Component} from 'preact'
import {extname} from 'path'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'
import {
  addRecentFile,
  listRecentFiles,
  openRecentFile,
} from '../modules/recentfiles.js'
import {MiniGoban} from './sidebars/OgsGameHistory.js'

const t = i18n.context('HomeDashboard')

// Compact "Library" pane shown inside the Local card. For now it reuses the
// recently opened games data as a stand-in for a full library browser.
export default class RecentlyOpenedGames extends Component {
  constructor(props) {
    super(props)
    this.state = {entries: [], busy: true}
    this.handleRefresh = () => this.refresh()
  }

  componentDidMount() {
    this.refresh()
  }

  async refresh() {
    this.setState({busy: true})
    try {
      this.setState({entries: await listRecentFiles(), busy: false})
    } catch (err) {
      this.setState({entries: [], busy: false})
    }
  }

  async handleOpen(entry) {
    let result = await openRecentFile(entry.id)
    if (result == null) {
      await this.refresh()
      return
    }

    let success = await sabaki.openContentInNewBoardTab(
      result.content,
      extname(result.path).slice(1),
      {
        gotoEnd: true,
        representedFilename: result.path,
      },
    )
    if (success) await addRecentFile(result.path)
  }

  render() {
    let {entries, busy} = this.state

    return h(
      'section',
      {class: 'home-pane home-library-pane'},
      h('h3', {}, t('Library')),
      busy
        ? h('p', {class: 'home-library-empty'}, t('Loading recent games…'))
        : entries.length === 0
          ? h(
              'p',
              {class: 'home-library-empty'},
              t('No recently opened games.'),
            )
          : h(
              'div',
              {class: 'home-library-list'},
              entries.slice(0, 3).map((entry) =>
                h(
                  'button',
                  {
                    key: entry.id,
                    type: 'button',
                    class: 'home-library-entry',
                    onClick: () => this.handleOpen(entry),
                  },
                  h(MiniGoban, {
                    board: entry.preview,
                    preview: entry.preview,
                    status: entry.preview == null ? 'error' : 'idle',
                  }),
                  h(
                    'span',
                    {class: 'home-library-entry-info'},
                    h('strong', {}, entry.filename),
                    entry.preview?.result != null &&
                      h('span', {}, entry.preview.result),
                  ),
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
