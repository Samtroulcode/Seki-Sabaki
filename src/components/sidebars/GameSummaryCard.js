import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import {LazyMiniGoban} from './OgsGameHistory.js'

const t = i18n.context('GameSummaryCard')

/**
 * Reusable game summary card for OGS games.
 * Owns the common presentation layout:
 *   MiniGoban | opponent
 *             | result
 *             | board metadata
 *             | actions
 *
 * Does NOT contain OGS data parsing or winner logic — those stay in
 * OgsGameHistory.js (getGameOutcome, getOpponent, getOutcomeLabel, etc.).
 * The caller passes the already-computed `outcome` and `opponent` objects.
 */
export class GameSummaryCard extends Component {
  constructor(props) {
    super(props)
    this.state = {preview: null}
    this.handlePreview = (preview) => this.setState({preview})
  }

  render(
    {
      game,
      outcome,
      opponent,
      onOpenGame,
      onAnalyzeOgs,
      onAnalyzeSeki,
      resolveOutcome,
    },
    {preview},
  ) {
    let displayGame = {...game, winnerColor: preview?.winnerColor}
    let resolvedOutcome = resolveOutcome?.(displayGame) ?? outcome
    let opponentName = opponent?.username || game.name || `#${game.id}`
    let outcomeLabel =
      resolvedOutcome.label || game.result || t('Result unknown')
    let boardLabel = this.props.formatBoard?.(game.board, t) || ''

    // Determine if this is a compact variant (used in OgsGameHistoryColumn)
    let compact = this.props.compact === true

    // Card root: article when clickable (onOpenGame), otherwise div
    let Tag = onOpenGame ? 'article' : 'div'
    let rootClass = [
      'game-summary-card',
      resolvedOutcome.status,
      compact ? 'compact' : null,
    ]
      .filter(Boolean)
      .join(' ')

    let rootProps = {
      class: rootClass,
    }

    if (onOpenGame) {
      rootProps.role = 'button'
      rootProps.tabIndex = 0
      rootProps.onClick = () => onOpenGame(game.id)
      rootProps.onKeyDown = (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault()
          onOpenGame(game.id)
        }
      }
    }

    return h(
      Tag,
      rootProps,
      h(
        'div',
        {class: 'game-summary-goban'},
        h(LazyMiniGoban, {game, onPreview: this.handlePreview}),
      ),
      h(
        'div',
        {class: 'game-summary-body'},
        h(
          'div',
          {class: 'game-summary-main'},
          h(
            'strong',
            {class: 'game-summary-opponent', title: opponentName},
            opponentName,
            opponent?.rank != null &&
              h('span', {class: 'game-summary-rank'}, ` · ${opponent.rank}`),
          ),
          this.props.userColor != null &&
            h(
              'span',
              {class: 'game-summary-color'},
              this.props.userColor === 'B'
                ? t('You played Black')
                : t('You played White'),
            ),
          h(
            'span',
            {class: `game-summary-result ${resolvedOutcome.status}`},
            this.props.resultStone?.(displayGame),
            outcomeLabel,
          ),
          h(
            'span',
            {class: 'game-summary-meta'},
            boardLabel,
            game.ended && this.props.formatEndDate
              ? ` · ${this.props.formatEndDate(game.ended)}`
              : '',
          ),
        ),
        h(
          'div',
          {class: 'game-summary-actions'},
          h(
            'button',
            {
              type: 'button',
              class: 'ui-button ui-button-primary game-summary-action',
              onClick: (evt) => {
                evt.stopPropagation()
                onAnalyzeSeki?.(game.id)
              },
              onKeyDown: (evt) => evt.stopPropagation(),
            },
            t('Analyze Seki'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'ui-button ui-button-secondary game-summary-action',
              onClick: (evt) => {
                evt.stopPropagation()
                onAnalyzeOgs?.(game.id)
              },
              onKeyDown: (evt) => evt.stopPropagation(),
            },
            t('OGS Review'),
          ),
        ),
      ),
    )
  }
}

export default GameSummaryCard
