import {h, Component} from 'preact'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('HomeView')

export default class HomeView extends Component {
  constructor(props) {
    super(props)

    this.handleOpenWorkspace = (workspace) => {
      sabaki.setState({activeWorkspace: workspace})
    }

    this.handleNewGameButtonClick = async () => {
      await sabaki.createNewBoardTab()
    }

    this.handleOpenFileButtonClick = async () => {
      await sabaki.openFileInNewBoardTab()
    }
  }

  render({onlineGameId, attachedEngineSyncers = [], boardTabs = []}) {
    let hasOnlineGame = onlineGameId != null
    let hasBoardTabs = boardTabs.length > 0
    let attachedEngineCount = attachedEngineSyncers.length

    return h(
      'section',
      {id: 'home', class: 'home-view'},
      h(
        'div',
        {class: 'home-hero'},
        h('p', {class: 'home-kicker'}, t('Seki Sabaki')),
        h('h1', {}, t('Your Go workspace')),
        h(
          'p',
          {},
          t(
            'Play, review, analyze, and continue your games from one calm starting point.',
          ),
        ),
      ),
      h(
        'section',
        {class: 'home-section home-quick-actions'},
        h('div', {class: 'home-section-heading'}, h('h2', {}, t('Start'))),
        h(
          'div',
          {class: 'home-action-grid'},
          h(ActionButton, {
            title: t('New board'),
            description: t('Start a fresh local game or review board.'),
            primary: true,
            onClick: this.handleNewGameButtonClick,
          }),
          h(ActionButton, {
            title: t('Open SGF'),
            description: t('Load a game file from your computer.'),
            onClick: this.handleOpenFileButtonClick,
          }),
          h(ActionButton, {
            title: t('Analyze'),
            description: t('Set up KataGo analysis and view analyzed games.'),
            onClick: () => this.handleOpenWorkspace('analysis'),
          }),
          h(ActionButton, {
            title: t('Online play'),
            description: t('Open OGS connection, games, and matchmaking.'),
            onClick: () => this.handleOpenWorkspace('online'),
          }),
        ),
      ),
      h(
        'section',
        {class: 'home-section home-continue'},
        h('div', {class: 'home-section-heading'}, h('h2', {}, t('Continue'))),
        h(HomePanel, {
          title: hasOnlineGame
            ? t('Online game on the board')
            : hasBoardTabs
              ? t('Local board ready')
              : t('No board open'),
          description: hasOnlineGame
            ? t('Continue game #') +
              String(onlineGameId) +
              t(' from the board workspace.')
            : hasBoardTabs
              ? t('Return to the current board without changing your position.')
              : t('Create a board or open an SGF when you are ready.'),
          meta: hasOnlineGame
            ? t('Online mode')
            : hasBoardTabs
              ? t('Local review mode')
              : t('Clean start'),
          action: hasOnlineGame
            ? t('Continue game')
            : hasBoardTabs
              ? t('Resume board')
              : t('New board'),
          onClick: () =>
            hasBoardTabs
              ? this.handleOpenWorkspace('board')
              : this.handleNewGameButtonClick(),
        }),
      ),
      h(
        'section',
        {class: 'home-section'},
        h(
          'div',
          {class: 'home-section-heading'},
          h('h2', {}, t('Status')),
          h('p', {}, t('Honest entry points for the larger Seki workspace.')),
        ),
        h(
          'div',
          {class: 'home-card-grid'},
          h(HomePanel, {
            title: t('Library'),
            description: t(
              'A dedicated game library is coming. For now, open SGF files directly.',
            ),
            meta: t('No library folder selected'),
            action: t('Open SGF'),
            onClick: this.handleOpenFileButtonClick,
          }),
          h(HomePanel, {
            title: t('Analysis'),
            description: t(
              'Prepare analysis jobs and browse generated review files.',
            ),
            meta:
              attachedEngineCount === 0
                ? t('No live engines attached')
                : String(attachedEngineCount) +
                  ' ' +
                  t('live engine(s) attached'),
            action: t('Open analysis'),
            onClick: () => this.handleOpenWorkspace('analysis'),
          }),
          h(HomePanel, {
            title: t('OGS'),
            description: hasOnlineGame
              ? t('An online game is attached to the board.')
              : t('Connect to OGS, find games, or start matchmaking.'),
            meta: hasOnlineGame
              ? t('Viewing game #') + String(onlineGameId)
              : t('No online game on the board'),
            action: t('Open OGS'),
            onClick: () => this.handleOpenWorkspace('online'),
          }),
        ),
      ),
    )
  }
}

function ActionButton({title, description, primary, onClick}) {
  return h(
    'button',
    {
      type: 'button',
      class: primary ? 'home-action primary' : 'home-action',
      onClick,
    },
    h('strong', {}, title),
    h('span', {}, description),
  )
}

function HomePanel({title, description, meta, action, onClick}) {
  return h(
    'article',
    {class: 'home-card'},
    h('h3', {}, title),
    h('p', {}, description),
    h('p', {class: 'home-card-meta'}, meta),
    h('button', {type: 'button', onClick}, action),
  )
}
