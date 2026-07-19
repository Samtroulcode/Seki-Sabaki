import {h, Component} from 'preact'
import classNames from 'classnames'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('AppRail')

const workspaces = [
  {id: 'home', label: t('Home'), shortLabel: 'H'},
  {id: 'board', label: t('Board'), shortLabel: 'B'},
  {id: 'online', label: t('OGS'), shortLabel: 'O'},
  {id: 'sgf-explorer', label: t('SGF Explorer'), shortLabel: 'S'},
  {id: 'analysis', label: t('Analysis'), shortLabel: 'A'},
]

export default class AppRail extends Component {
  constructor(props) {
    super(props)

    this.handleWorkspaceButtonClick = (workspace) => {
      sabaki.setState({activeWorkspace: workspace})
    }
  }

  render({activeWorkspace}) {
    return h(
      'nav',
      {id: 'apprail', 'aria-label': t('Workspace navigation')},
      h(
        'ul',
        {},
        workspaces.map((workspace) =>
          h(
            'li',
            {key: workspace.id},
            h(
              'button',
              {
                type: 'button',
                class: classNames({selected: activeWorkspace === workspace.id}),
                title: workspace.label,
                'aria-label': workspace.label,
                'aria-current':
                  activeWorkspace === workspace.id ? 'page' : undefined,
                onClick: () => this.handleWorkspaceButtonClick(workspace.id),
              },
              h('span', {class: 'apprail-short-label'}, workspace.shortLabel),
              h('span', {class: 'apprail-label'}, workspace.label),
            ),
          ),
        ),
      ),
    )
  }
}
