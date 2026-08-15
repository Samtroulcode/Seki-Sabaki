import {h, Component} from 'preact'

import i18n from '../i18n.js'
import onlineStore from '../modules/onlinestore.js'

const t = i18n.context('HomeDashboard')

export default class MatchmakingToast extends Component {
  constructor(props) {
    super(props)
    this.state = onlineStore.getState()
    this.handleOnlineStoreState = (state) => this.setState(state)
  }

  componentDidMount() {
    this.unsubscribeOnlineStore = onlineStore.subscribe(
      this.handleOnlineStoreState,
    )
  }

  componentWillUnmount() {
    this.unsubscribeOnlineStore?.()
  }

  render() {
    let status = this.state.matchmaking?.status
    if (!['searching', 'matched'].includes(status)) return null

    return h(
      'div',
      {class: 'home-matchmaking-toast', role: 'status'},
      h(
        'span',
        {},
        status === 'matched'
          ? t('Match found. Opening board…')
          : t('Searching for an opponent…'),
      ),
      status === 'searching' &&
        h(
          'button',
          {
            type: 'button',
            disabled: this.state.busy,
            onClick: () => onlineStore.cancelAutomatch(),
          },
          t('Cancel'),
        ),
    )
  }
}
