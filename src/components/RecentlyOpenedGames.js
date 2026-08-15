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
      {class: 'home-section home-recent-local-games'},
      h(
        'div',
        {class: 'home-section-heading'},
        h('h2', {}, t('Recently opened games')),
        h('p', {}, t('Your latest local SGF games.')),
      ),
      h(
        'article',
        {class: 'home-card home-recent-local-games-card'},
        busy
          ? h('p', {class: 'home-empty-state'}, t('Loading recent games…'))
          : entries.length === 0
            ? h(
                'p',
                {class: 'home-empty-state'},
                t('No recently opened games.'),
              )
            : h(
                'div',
                {class: 'home-recent-local-games-list'},
                entries.slice(0, 4).map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.id,
                      type: 'button',
                      class: 'home-recent-local-game',
                      onClick: () => this.handleOpen(entry),
                    },
                    h(MiniGoban, {
                      board: entry.preview,
                      preview: entry.preview,
                      status: entry.preview == null ? 'error' : 'idle',
                    }),
                    h(
                      'span',
                      {class: 'home-recent-local-game-info'},
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
            onClick: () => sabaki.openWorkspaceTab('library'),
          },
          t('Open Library'),
        ),
      ),
    )
  }
}
