import {h, Component} from 'preact'

import i18n from '../i18n.js'
import {chooseLibraryRoot, getLibraryConfig} from '../modules/library.js'

const t = i18n.context('HomeView')

export default class LibraryPanel extends Component {
  constructor(props) {
    super(props)
    this.state = {config: null, busy: true, error: null}
  }

  componentDidMount() {
    this.refresh()
  }

  async refresh() {
    try {
      this.setState({config: await getLibraryConfig(), busy: false})
    } catch (err) {
      this.setState({
        config: {configured: false},
        busy: false,
        error: t('Unable to load Library settings.'),
      })
    }
  }

  async handleChooseRoot() {
    this.setState({busy: true, error: null})
    try {
      let result = await chooseLibraryRoot()
      if (result.ok) {
        this.setState({
          config: {configured: true, root: result.root},
          busy: false,
        })
      } else if (!result.cancelled) {
        this.setState({
          busy: false,
          error: t('This folder cannot be used as a Library.'),
        })
      } else {
        this.setState({busy: false})
      }
    } catch (err) {
      this.setState({
        busy: false,
        error: t('Unable to choose a Library folder.'),
      })
    }
  }

  render() {
    let {config, busy, error} = this.state
    let configured = config?.configured === true

    return h(
      'section',
      {id: 'library-dashboard', class: 'library-panel'},
      h('h1', {}, t('Library')),
      h(
        'p',
        {class: 'library-panel-intro'},
        t('Keep your local SGF games organized and easy to reopen.'),
      ),
      error != null && h('p', {class: 'ogs-error'}, error),
      busy && config == null
        ? h('p', {class: 'library-panel-status'}, t('Loading Library…'))
        : !configured
          ? h(
              'article',
              {class: 'library-setup-card'},
              h('h2', {}, t('Choose your Library folder')),
              h(
                'p',
                {},
                t('Seki will use this folder to read and save your SGF games.'),
              ),
              h(
                'p',
                {class: 'library-setup-warning'},
                t(
                  'Later, Seki may create a Tsumego folder at its root for tsumego SGF files. Existing files will not be moved or copied automatically.',
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: busy,
                  onClick: () => this.handleChooseRoot(),
                },
                busy ? t('Checking folder…') : t('Choose folder'),
              ),
            )
          : h(
              'article',
              {class: 'library-configured-card'},
              h('h2', {}, t('Library folder')),
              h('p', {class: 'library-root-path'}, config.root),
              h(
                'p',
                {class: 'library-setup-warning'},
                t(
                  'A Tsumego folder may be created here later when you first save a tsumego.',
                ),
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: busy,
                  onClick: () => this.handleChooseRoot(),
                },
                t('Change folder'),
              ),
            ),
    )
  }
}
