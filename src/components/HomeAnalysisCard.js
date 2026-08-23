import {h, Component} from 'preact'

import i18n from '../i18n.js'
import analysisStore, {
  hasRunnableAnalysisConfig,
} from '../modules/analysisstore.js'
import sabaki from '../modules/sabaki.js'

const t = i18n.context('HomeDashboard')

export default class HomeAnalysisCard extends Component {
  constructor(props) {
    super(props)

    this.state = analysisStore.getState()

    this.handleAnalysisStoreState = (state) => this.setState(state)

    this.handleViewAnalysis = () => {
      sabaki.openWorkspaceTab('analysis')
    }
  }

  async componentDidMount() {
    this.unsubscribeAnalysisStore = analysisStore.subscribe(
      this.handleAnalysisStoreState,
    )
    await analysisStore.initialize()
  }

  componentWillUnmount() {
    this.unsubscribeAnalysisStore?.()
  }

  render(props, {analysisState, config, busy}) {
    let currentJob = analysisState?.currentJob || null
    let queuedJobs = analysisState?.queuedJobs || []
    let completedJobs = analysisState?.completedJobs || []
    let configMissing = !hasRunnableAnalysisConfig(config)
    let status = configMissing
      ? 'setup'
      : currentJob != null
        ? 'running'
        : 'ready'
    let analyzedCount = completedJobs.length

    return h(
      'section',
      {class: 'home-analysis-card'},
      h(
        'header',
        {class: 'home-analysis-header'},
        h('h3', {}, t('Analysis')),
        h(
          'span',
          {class: `home-analysis-status ${status}`},
          t(statusLabel(status)),
        ),
      ),
      h(
        'div',
        {class: 'home-analysis-body'},
        currentJob != null &&
          h(
            'div',
            {class: 'home-analysis-running'},
            h('span', {class: 'home-analysis-spinner'}),
            h('span', {}, t('Analysis in progress')),
          ),
        h(
          'dl',
          {class: 'home-analysis-stats'},
          h('dt', {}, t('Analyzed')),
          h(
            'dd',
            {},
            `${analyzedCount} ${t(analyzedCount === 1 ? 'game' : 'games')}`,
          ),
          queuedJobs.length > 0 && h('dt', {}, t('Queued')),
          queuedJobs.length > 0 &&
            h(
              'dd',
              {},
              `${queuedJobs.length} ${t(queuedJobs.length === 1 ? 'job' : 'jobs')}`,
            ),
        ),
        h(
          'button',
          {
            type: 'button',
            class: `ui-button ui-button-${status === 'setup' ? 'secondary' : 'primary'}`,
            onClick: this.handleViewAnalysis,
          },
          t(actionLabel(status)),
        ),
      ),
    )
  }
}

function statusLabel(status) {
  if (status === 'setup') return 'Setup required'
  if (status === 'running') return 'Running'
  return 'Ready'
}

function actionLabel(status) {
  if (status === 'running' || status === 'ready') return 'View analysis'
  return 'Configure'
}
