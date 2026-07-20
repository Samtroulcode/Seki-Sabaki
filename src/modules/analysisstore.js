import i18n from '../i18n.js'

const t = i18n.context('AnalysisStore')

export function createInitialAnalysisStoreState() {
  return {
    analysisState: {
      currentJob: null,
      queuedJobs: [],
      completedJobs: [],
    },
    config: null,
    analyzedGames: [],
    selectedInputPath: '',
    busy: false,
    error: null,
  }
}

export class AnalysisStore {
  constructor({analysis = () => window.sabaki.analysis} = {}) {
    this.analysis = analysis
    this.state = createInitialAnalysisStoreState()
    this.listeners = new Set()
    this.unsubscribeAnalysisStateChange = null
    this.subscribedAnalysis = null
  }

  getState() {
    return cloneObject(this.state)
  }

  setState(change) {
    this.state = {...this.state, ...change}
    this.emitChange()
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emitChange() {
    for (let listener of this.listeners) listener(this.getState())
  }

  initialize() {
    let analysis = this.analysis()

    if (
      this.unsubscribeAnalysisStateChange == null &&
      typeof analysis?.onStateChange === 'function'
    ) {
      this.unsubscribeAnalysisStateChange = analysis.onStateChange((state) => {
        this.applyAnalysisState(state)
      })
      this.subscribedAnalysis = analysis
    }

    return this.refresh()
  }

  dispose() {
    this.unsubscribeAnalysisStateChange?.()
    this.unsubscribeAnalysisStateChange = null
    this.subscribedAnalysis = null
  }

  isUsingCurrentAnalysisStateChangeEvents() {
    let analysis = this.analysis()

    return (
      this.subscribedAnalysis === analysis &&
      this.unsubscribeAnalysisStateChange != null &&
      typeof analysis?.onStateChange === 'function'
    )
  }

  async refresh() {
    this.setState({busy: true, error: null})

    try {
      let [analysisState, config, analyzedGames] = await Promise.all([
        this.analysis().getState(),
        this.analysis().getConfig(),
        this.analysis().listAnalyzedGames(),
      ])

      this.setState({analysisState, config, analyzedGames, busy: false})

      return {analysisState, config, analyzedGames}
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to refresh analysis state.')),
      })
      return null
    }
  }

  setSelectedInputPath(selectedInputPath) {
    this.setState({selectedInputPath: selectedInputPath || ''})
  }

  async selectInputFile() {
    this.setState({busy: true, error: null})

    try {
      let selectedInputPath = await this.analysis().selectInputFile()

      this.setState({
        selectedInputPath: selectedInputPath || this.state.selectedInputPath,
        busy: false,
      })

      return selectedInputPath
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to choose SGF file.')),
      })
      return null
    }
  }

  async selectOutputDirectory() {
    this.setState({busy: true, error: null})

    try {
      let outputDirectory = await this.analysis().selectOutputDirectory()
      if (outputDirectory == null || outputDirectory === '') {
        this.setState({busy: false})
        return null
      }

      return await this.updateConfig({outputDirectory})
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to choose output folder.')),
      })
      return null
    }
  }

  async updateConfig(change) {
    let config = {...(this.state.config || {}), ...change}
    this.setState({busy: true, error: null, config})

    try {
      let result = await this.analysis().setConfig(config)

      if (result?.ok) {
        let analyzedGames = this.state.analyzedGames

        if (Object.prototype.hasOwnProperty.call(change, 'outputDirectory')) {
          analyzedGames = await this.analysis().refreshAnalyzedGames()
        }

        this.setState({busy: false, config: result.config, analyzedGames})
      } else {
        this.setState({
          busy: false,
          error:
            result?.error?.message || t('Unable to update analysis settings.'),
        })
      }

      return result
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to update analysis settings.')),
      })
      return null
    }
  }

  async startAnalysis() {
    let path = this.state.selectedInputPath.trim()
    if (path === '') return null

    this.setState({busy: true, error: null})

    try {
      let result = await this.analysis().start({source: {type: 'file', path}})

      if (result?.state != null) this.applyAnalysisState(result.state)

      if (!result?.ok) {
        this.setState({
          busy: false,
          error: result?.error?.message || t('Unable to start analysis.'),
        })
      } else {
        this.setState({busy: false})
      }

      return result
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to start analysis.')),
      })
      return null
    }
  }

  async cancelAnalysis(jobId) {
    if (jobId == null || jobId === '') return null

    this.setState({busy: true, error: null})

    try {
      let result = await this.analysis().cancel(jobId)

      if (result?.state != null) this.applyAnalysisState(result.state)

      this.setState({busy: false})

      return result
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to cancel analysis.')),
      })
      return null
    }
  }

  async refreshGames() {
    this.setState({busy: true, error: null})

    try {
      let analyzedGames = await this.analysis().refreshAnalyzedGames()
      this.setState({busy: false, analyzedGames})
      return analyzedGames
    } catch (err) {
      this.setState({
        busy: false,
        error: getErrorMessage(err, t('Unable to refresh analyzed games.')),
      })
      return null
    }
  }

  async showInFolder(path) {
    try {
      return await this.analysis().showInFolder(path)
    } catch (err) {
      this.setState({
        error: getErrorMessage(err, t('Unable to show analyzed game.')),
      })
      return false
    }
  }

  async openAnalyzedGame(path) {
    try {
      return await this.analysis().openAnalyzedGame(path)
    } catch (err) {
      this.setState({
        error: getErrorMessage(err, t('Unable to open analyzed game.')),
      })
      return false
    }
  }

  applyAnalysisState(analysisState) {
    if (analysisState == null) return
    this.setState({analysisState})

    if (analysisState.currentJob == null) {
      this.refreshGames()
    }
  }
}

function getErrorMessage(err, fallback) {
  return typeof err?.message === 'string' && err.message !== ''
    ? err.message
    : fallback
}

function cloneObject(value) {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneObject)

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, cloneObject(child)]),
  )
}

export default new AnalysisStore()
