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
      sabaki.setState({activeWorkspace: 'board'})
      await sabaki.newFile()
    }

    this.handleOpenFileButtonClick = async () => {
      await sabaki.loadFile()
    }
  }

  render({onlineGameId, attachedEngineSyncers = []}) {
    return h(
      'section',
      {id: 'home', class: 'home-view'},
      h(
        'div',
        {class: 'home-hero'},
        h('p', {class: 'home-kicker'}, t('Seki Sabaki')),
        h('h1', {}, t('Home')),
        h(
          'p',
          {},
          t('Choose a workspace, resume the board, or open online play.'),
        ),
      ),
      h(
        'div',
        {class: 'home-card-grid'},
        h(HomeCard, {
          title: t('Board'),
          description: t('Return to the current goban and local SGF workflow.'),
          meta:
            onlineGameId == null
              ? t('Local board ready')
              : t('Online game #') + String(onlineGameId) + t(' loaded'),
          action: t('Resume board'),
          onClick: () => this.handleOpenWorkspace('board'),
        }),
        h(HomeCard, {
          title: t('Online Go Server'),
          description: t(
            'Manage OGS connection, active games, and matchmaking.',
          ),
          meta:
            onlineGameId == null
              ? t('No online game on the board')
              : t('Viewing game #') + String(onlineGameId),
          action: t('Open OGS'),
          onClick: () => this.handleOpenWorkspace('online'),
        }),
        h(HomeCard, {
          title: t('SGF Explorer'),
          description: t('Browse local folders and open games from a library.'),
          meta: t('Coming soon'),
          action: t('Open explorer'),
          onClick: () => this.handleOpenWorkspace('sgf-explorer'),
        }),
        h(HomeCard, {
          title: t('Analysis Manager'),
          description: t('Track batch analyses and browse analyzed games.'),
          meta:
            String(attachedEngineSyncers.length) +
            ' ' +
            t('engine(s) attached'),
          action: t('Open analysis'),
          onClick: () => this.handleOpenWorkspace('analysis'),
        }),
      ),
      h(
        'div',
        {class: 'home-actions'},
        h(
          'button',
          {type: 'button', onClick: this.handleNewGameButtonClick},
          t('New game'),
        ),
        h(
          'button',
          {type: 'button', onClick: this.handleOpenFileButtonClick},
          t('Open SGF…'),
        ),
      ),
    )
  }
}

function HomeCard({title, description, meta, action, onClick}) {
  return h(
    'article',
    {class: 'home-card'},
    h('h2', {}, title),
    h('p', {}, description),
    h('p', {class: 'home-card-meta'}, meta),
    h('button', {type: 'button', onClick}, action),
  )
}
