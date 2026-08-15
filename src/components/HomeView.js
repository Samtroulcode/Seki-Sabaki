import {h, Component} from 'preact'

import AnalysisPanel from './sidebars/AnalysisPanel.js'
import HomeDashboard from './HomeDashboard.js'
import HomePlaceholder from './HomePlaceholder.js'
import LibraryPanel from './LibraryPanel.js'
import OgsPanel from './sidebars/OgsPanel.js'

import i18n from '../i18n.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('HomeView')

export default class HomeView extends Component {
  constructor(props) {
    super(props)

    this.handleNavigate = (homeSection) => {
      if (['ogs', 'analysis', 'library'].includes(homeSection)) {
        sabaki.openWorkspaceTab(homeSection)
      } else {
        sabaki.setState({activeWorkspace: 'home', homeSection})
      }
    }
  }

  render(props) {
    let activeSection = props.homeSection || 'dashboard'

    return h(
      'section',
      {id: 'home', class: 'home-view'},
      h(
        'div',
        {class: 'home-content'},
        renderHomeSection(activeSection, props, this.handleNavigate),
      ),
    )
  }
}

function renderHomeSection(activeSection, props, onNavigate) {
  switch (activeSection) {
    case 'ogs':
      return h(OgsPanel)
    case 'analysis':
      return h(AnalysisPanel)
    case 'library':
      return h(LibraryPanel)
    case 'engines':
      return h(HomePlaceholder, {
        id: 'home-engines',
        title: t('Engines'),
        description: t(
          'Engine configuration and reusable engine status will live here.',
        ),
      })
    case 'dashboard':
    default:
      return h(HomeDashboard, {...props, onNavigate})
  }
}
