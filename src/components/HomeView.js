import {h, Component} from 'preact'

import AnalysisPanel from './sidebars/AnalysisPanel.js'
import HomeDashboard from './HomeDashboard.js'
import HomePlaceholder from './HomePlaceholder.js'
import LibraryPanel from './LibraryPanel.js'
import OgsPanel from './sidebars/OgsPanel.js'
import TsumegoPanel from './TsumegoPanel.js'

import i18n from '../i18n.js'

const t = i18n.context('HomeView')

export default class HomeView extends Component {
  render(props) {
    let activeSection = props.homeSection || 'dashboard'

    return h(
      'section',
      {id: 'home', class: 'home-view'},
      h(
        'div',
        {class: 'home-content'},
        renderHomeSection(activeSection, props),
      ),
    )
  }
}

function renderHomeSection(activeSection, props) {
  switch (activeSection) {
    case 'ogs':
      return h(OgsPanel)
    case 'analysis':
      return h(AnalysisPanel)
    case 'library':
      return h(LibraryPanel)
    case 'tsumego':
      return h(TsumegoPanel)
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
      return h(HomeDashboard, props)
  }
}
