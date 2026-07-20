import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import analysisStore from '../../modules/analysisstore.js'

const t = i18n.context('AnalysisPanel')

export default class AnalysisPanel extends Component {
  constructor(props) {
    super(props)

    this.state = analysisStore.getState()

    this.handleAnalysisStoreState = (state) => this.setState(state)

    this.handleSelectInputFile = async () => {
      await analysisStore.selectInputFile()
    }

    this.handleInputPathChange = (evt) => {
      analysisStore.setSelectedInputPath(evt.currentTarget.value)
    }

    this.handleStartAnalysis = async () => {
      await analysisStore.startAnalysis()
    }

    this.handleRefreshButtonClick = async () => {
      await analysisStore.refreshGames()
    }

    this.handleOutputDirectoryButtonClick = async () => {
      await analysisStore.selectOutputDirectory()
    }

    this.handleConfigInput = async (evt) => {
      let {name, value} = evt.currentTarget

      if (name === 'maxVisits') value = Number.parseInt(value, 10)
      if (name === 'komi') value = Number.parseFloat(value)

      await analysisStore.updateConfig({[name]: value})
    }

    this.handleOpenGame = async (path) => {
      await analysisStore.openAnalyzedGame(path)
    }
  }

  async componentDidMount() {
    this.unsubscribeAnalysisStore = analysisStore.subscribe(
      this.handleAnalysisStoreState,
    )
    this.pollTimer = setInterval(() => this.refreshAnalysisStateIfDue(), 2000)
    await this.refreshAnalysisState()
  }

  componentWillUnmount() {
    this.unsubscribeAnalysisStore?.()
    clearInterval(this.pollTimer)
  }

  async refreshAnalysisState() {
    try {
      await analysisStore.initialize()
    } catch (err) {
      return
    }

    this.lastFallbackRefreshAt = Date.now()
  }

  async refreshAnalysisStateIfDue() {
    let now = Date.now()
    if (
      analysisStore.isUsingCurrentAnalysisStateChangeEvents() &&
      now - this.lastFallbackRefreshAt < 60000
    ) {
      return
    }

    this.lastFallbackRefreshAt = now
    await analysisStore.refresh()
  }

  render(_, state) {
    let {analysisState, config, analyzedGames, selectedInputPath, busy, error} =
      state
    let currentJob = analysisState?.currentJob || null
    let queuedJobs = analysisState?.queuedJobs || []
    let configMissing = getMissingConfigFields(config).length > 0
    let canStart = !busy && !configMissing && selectedInputPath.trim() !== ''

    return h(
      'section',
      {id: 'analysis-dashboard', class: 'analysis-panel analysis-dashboard'},

      h(
        'div',
        {class: 'analysis-dashboard-hero', role: 'banner'},
        h(
          'div',
          {class: 'analysis-dashboard-title'},
          h('div', {class: 'analysis-panel-logo'}, t('SGF')),
          h(
            'div',
            {},
            h('p', {class: 'analysis-dashboard-kicker'}, t('SGF analysis')),
            h('h2', {}, t('Analysis Manager')),
            h(
              'p',
              {},
              t('Run KataGo analysis jobs and reopen analyzed SGF files.'),
            ),
          ),
        ),
        h(
          'div',
          {class: 'analysis-dashboard-hero-actions'},
          h(
            'span',
            {
              class: `analysis-dashboard-status-pill ${currentJob ? 'running' : ''}`,
            },
            getStatusLabel({currentJob, queuedJobs, configMissing}),
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: busy,
              onClick: this.handleRefreshButtonClick,
            },
            t('Refresh'),
          ),
        ),
      ),

      error && h('p', {class: 'analysis-error', role: 'alert'}, error),

      h(
        'div',
        {class: 'analysis-dashboard-grid'},
        h(SourceCard, {
          busy,
          canStart,
          configMissing,
          config,
          selectedInputPath,
          onInputPathChange: this.handleInputPathChange,
          onSelectInputFile: this.handleSelectInputFile,
          onStartAnalysis: this.handleStartAnalysis,
          onOutputDirectoryClick: this.handleOutputDirectoryButtonClick,
          onConfigInput: this.handleConfigInput,
        }),
        h(QueueCard, {analysisState, busy}),
        h(ResultsCard, {
          games: analyzedGames,
          busy,
          onOpenGame: this.handleOpenGame,
        }),
      ),
    )
  }
}

function SourceCard({
  busy,
  canStart,
  configMissing,
  config,
  selectedInputPath,
  onInputPathChange,
  onSelectInputFile,
  onStartAnalysis,
  onOutputDirectoryClick,
  onConfigInput,
}) {
  return h(
    'section',
    {class: 'analysis-dashboard-card analysis-source-card'},
    h('h3', {}, t('New analysis')),
    h(
      'label',
      {},
      h('span', {}, t('SGF file')),
      h('input', {
        type: 'text',
        value: selectedInputPath,
        placeholder: t('Choose or paste an SGF path...'),
        onInput: onInputPathChange,
      }),
    ),
    h(
      'div',
      {class: 'analysis-actions'},
      h(
        'button',
        {type: 'button', disabled: busy, onClick: onSelectInputFile},
        t('Choose SGF...'),
      ),
      h(
        'button',
        {type: 'button', disabled: !canStart, onClick: onStartAnalysis},
        t('Start analysis'),
      ),
    ),
    configMissing &&
      h(
        'p',
        {class: 'analysis-warning'},
        t('Configure KataGo and an output folder before starting.'),
      ),
    h(ConfigSummary, {config, busy, onOutputDirectoryClick, onConfigInput}),
  )
}

function ConfigSummary({config, busy, onOutputDirectoryClick, onConfigInput}) {
  return h(
    'div',
    {class: 'analysis-config'},
    h('h4', {}, t('Settings')),
    h(
      'label',
      {},
      h('span', {}, t('KataGo executable')),
      h('input', {
        type: 'text',
        name: 'katagoPath',
        value: config?.katagoPath || '',
        placeholder: t('Path to katago'),
        onChange: onConfigInput,
      }),
    ),
    h(
      'label',
      {},
      h('span', {}, t('KataGo arguments')),
      h('input', {
        type: 'text',
        name: 'katagoArguments',
        value: config?.katagoArguments || '',
        placeholder: t('analysis -config ... -model ...'),
        onChange: onConfigInput,
      }),
    ),
    h(
      'label',
      {},
      h('span', {}, t('Output folder')),
      h('input', {
        type: 'text',
        name: 'outputDirectory',
        value: config?.outputDirectory || '',
        placeholder: t('Folder for analyzed SGF files'),
        onChange: onConfigInput,
      }),
    ),
    h(
      'button',
      {type: 'button', disabled: busy, onClick: onOutputDirectoryClick},
      t('Choose output folder...'),
    ),
    h(
      'div',
      {class: 'analysis-config-inline'},
      h(
        'label',
        {},
        h('span', {}, t('Visits')),
        h('input', {
          type: 'number',
          min: '1',
          name: 'maxVisits',
          value: config?.maxVisits || 1600,
          onChange: onConfigInput,
        }),
      ),
      h(
        'label',
        {},
        h('span', {}, t('Komi')),
        h('input', {
          type: 'number',
          step: '0.5',
          name: 'komi',
          value: config?.komi ?? 7.5,
          onChange: onConfigInput,
        }),
      ),
    ),
  )
}

function QueueCard({analysisState, busy}) {
  let currentJob = analysisState?.currentJob || null
  let queuedJobs = analysisState?.queuedJobs || []
  let completedJobs = analysisState?.completedJobs || []

  return h(
    'section',
    {class: 'analysis-dashboard-card analysis-queue-card'},
    h('h3', {}, t('Queue')),
    currentJob == null
      ? h('p', {class: 'analysis-empty'}, t('No analysis is running.'))
      : h(JobSummary, {job: currentJob, busy}),
    queuedJobs.length > 0 && h('h4', {}, t('Queued')),
    queuedJobs.length > 0 &&
      h(
        'ul',
        {class: 'analysis-job-list'},
        queuedJobs.map((job) => h(JobListItem, {key: job.id, job, busy})),
      ),
    completedJobs.length > 0 && h('h4', {}, t('Recent jobs')),
    completedJobs.length > 0 &&
      h(
        'ul',
        {class: 'analysis-job-list'},
        completedJobs
          .slice(0, 5)
          .map((job) =>
            h(
              'li',
              {key: job.id},
              getJobTitle(job),
              h('span', {}, getJobStateLabel(job)),
            ),
          ),
      ),
  )
}

function JobSummary({job, busy}) {
  let progress = Math.round((job.progress || 0) * 100)

  return h(
    'div',
    {class: 'analysis-current-job'},
    h('strong', {}, getJobTitle(job)),
    h('progress', {max: '100', value: progress}),
    h(
      'dl',
      {},
      h('dt', {}, t('Status')),
      h('dd', {}, getJobStateLabel(job)),
      h('dt', {}, t('Progress')),
      h('dd', {}, `${progress}%`),
      h('dt', {}, t('Move')),
      h('dd', {}, formatMoveProgress(job)),
      h('dt', {}, t('Visits')),
      h('dd', {}, job.visits == null ? t('Unknown') : job.visits),
    ),
    h(
      'button',
      {
        type: 'button',
        disabled: busy,
        onClick: () => analysisStore.cancelAnalysis(job.id),
      },
      t('Cancel'),
    ),
  )
}

function JobListItem({job, busy}) {
  return h(
    'li',
    {},
    h('span', {}, getJobTitle(job)),
    h(
      'button',
      {
        type: 'button',
        disabled: busy,
        onClick: () => analysisStore.cancelAnalysis(job.id),
      },
      t('Cancel'),
    ),
  )
}

function ResultsCard({games, busy, onOpenGame}) {
  return h(
    'section',
    {class: 'analysis-dashboard-card analysis-results-card'},
    h('h3', {}, t('Analyzed games')),
    games.length === 0
      ? h('p', {class: 'analysis-empty'}, t('No analyzed games found.'))
      : h(
          'ul',
          {class: 'analysis-result-list'},
          games.map((game) =>
            h(ResultListItem, {key: game.id, game, busy, onOpenGame}),
          ),
        ),
  )
}

function ResultListItem({game, busy, onOpenGame}) {
  return h(
    'li',
    {},
    h(
      'div',
      {class: 'analysis-result-summary'},
      h('strong', {}, game.gameName || game.filename),
      h('span', {}, formatPlayers(game)),
      h('span', {}, formatGameMetadata(game)),
    ),
    h(
      'div',
      {class: 'analysis-actions'},
      h(
        'button',
        {
          type: 'button',
          disabled: busy,
          onClick: () => onOpenGame(game.path),
        },
        t('Open'),
      ),
      h(
        'button',
        {
          type: 'button',
          disabled: busy,
          onClick: () => analysisStore.showInFolder(game.path),
        },
        t('Show in folder'),
      ),
    ),
  )
}

function getMissingConfigFields(config) {
  if (config == null) return ['config']

  return ['katagoPath', 'katagoArguments', 'outputDirectory'].filter(
    (field) => typeof config[field] !== 'string' || config[field].trim() === '',
  )
}

function getStatusLabel({currentJob, queuedJobs, configMissing}) {
  if (configMissing) return t('Needs configuration')
  if (currentJob != null) return t('Running')
  if (queuedJobs.length > 0) {
    return t((p) => `Queued: ${p.count}`, {count: queuedJobs.length})
  }

  return t('Idle')
}

function getJobTitle(job) {
  return job.displayName || job.sourcePath || job.id || t('Analysis job')
}

function getJobStateLabel(job) {
  return job.error?.message || job.status || t('Unknown')
}

function formatMoveProgress(job) {
  if (job.currentMove == null || job.totalMoves == null) return t('Unknown')
  return `${job.currentMove}/${job.totalMoves}`
}

function formatPlayers(game) {
  let black = game.blackPlayer || t('Black')
  let white = game.whitePlayer || t('White')

  return `${black} vs. ${white}`
}

function formatGameMetadata(game) {
  let boardSize =
    game.boardWidth != null && game.boardHeight != null
      ? `${game.boardWidth}x${game.boardHeight}`
      : t('Unknown board')
  let details = [boardSize, game.result, game.date].filter(Boolean)

  return details.join(' - ')
}
