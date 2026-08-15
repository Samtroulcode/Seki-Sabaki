import {h, Component} from 'preact'

import i18n from '../../i18n.js'
import {
  defaultMatchmakingOptions,
  simpleHandicapOptions,
  timePresets,
} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')

export class AutomatchForm extends Component {
  constructor({options = defaultMatchmakingOptions}) {
    super()

    this.options = {...options}
    this.state = simplifyMatchmakingOptions(options)

    this.handleBoardSizeChange = (size) => {
      this.updateOptions('boardSizes', (state) => {
        let sizes = state.boardSizes.includes(size)
          ? state.boardSizes.filter((s) => s !== size)
          : [...state.boardSizes, size]

        return {...state, boardSizes: sizes.length > 0 ? sizes : [size]}
      })
    }

    this.handleTimePresetChange = (presetId) => {
      this.updateOptions('timePreset', (state) => ({
        ...state,
        timePreset: presetId,
      }))
    }

    this.handleHandicapChange = (evt) => {
      this.updateOptions('handicap', (state) => ({
        ...state,
        handicap: evt.currentTarget.value,
      }))
    }

    this.handleRankDiffChange = (delta) => {
      this.updateOptions('rankDiff', (state) => ({
        ...state,
        rankDiff: Math.min(2, Math.max(0, state.rankDiff + delta)),
      }))
    }
  }

  componentDidUpdate(previousProps) {
    if (
      previousProps.options !== this.props.options &&
      this.props.options != null
    ) {
      this.options = {...this.props.options}
      this.setState(simplifyMatchmakingOptions(this.props.options))
    }
  }

  updateOptions(changedField, producer) {
    this.setState(producer, () => {
      let options = expandMatchmakingOptions(
        this.state,
        this.options,
        changedField,
      )
      this.options = options
      this.props.onChange?.(options)
    })
  }

  render({status, authenticated, busy, onStartAutomatch, onCancelAutomatch}) {
    let searching = status === 'searching'
    let active = ['searching', 'matched'].includes(status)
    let {boardSizes, timePreset, handicap, rankDiff} = this.state
    let selectedPreset = timePresets.find((preset) => preset.id === timePreset)

    return h(
      'section',
      {class: 'ogs-matchmaking'},
      h('h3', {}, t('Play')),
      h('p', {}, t('Choose a board size and time setting, then find a game.')),

      h(
        'fieldset',
        {class: 'ogs-matchmaking-group'},
        h('legend', {}, t('Board size')),
        h(
          'div',
          {class: 'ogs-matchmaking-board-sizes'},
          [9, 13, 19].map((size) =>
            h(
              'button',
              {
                key: size,
                type: 'button',
                class: [
                  'ogs-matchmaking-chip',
                  boardSizes.includes(size) ? 'selected' : null,
                ]
                  .filter(Boolean)
                  .join(' '),
                disabled: active || busy,
                'aria-pressed': boardSizes.includes(size),
                onClick: () => this.handleBoardSizeChange(size),
              },
              `${size}x${size}`,
            ),
          ),
        ),
      ),

      h(
        'fieldset',
        {class: 'ogs-matchmaking-group'},
        h('legend', {}, t('Clock')),
        h(
          'div',
          {class: 'ogs-matchmaking-time-presets'},
          timePresets.map((preset) =>
            h(
              'button',
              {
                key: preset.id,
                type: 'button',
                class: [
                  'ogs-matchmaking-preset',
                  selectedPreset?.id === preset.id ? 'selected' : null,
                ]
                  .filter(Boolean)
                  .join(' '),
                disabled: active || busy,
                'aria-pressed': selectedPreset?.id === preset.id,
                onClick: () => this.handleTimePresetChange(preset.id),
              },
              h(
                'span',
                {class: 'ogs-matchmaking-preset-label'},
                t(preset.label),
              ),
              h('span', {class: 'ogs-matchmaking-preset-hint'}, t(preset.hint)),
            ),
          ),
        ),
      ),

      h(
        'fieldset',
        {class: 'ogs-matchmaking-group ogs-matchmaking-row'},
        h('legend', {}, t('Handicap')),
        h(
          'select',
          {
            class: 'ogs-matchmaking-select',
            value: handicap,
            disabled: active || busy,
            onChange: this.handleHandicapChange,
          },
          simpleHandicapOptions.map((option) =>
            h('option', {key: option.id, value: option.id}, t(option.label)),
          ),
        ),
      ),

      h(
        'fieldset',
        {class: 'ogs-matchmaking-group ogs-matchmaking-row'},
        h('legend', {}, t('Opponent rank')),
        h(
          'div',
          {class: 'ogs-matchmaking-rank-diff'},
          h(
            'button',
            {
              type: 'button',
              disabled: active || busy || rankDiff <= 0,
              onClick: () => this.handleRankDiffChange(-1),
            },
            '-',
          ),
          h(
            'span',
            {},
            rankDiff === 0 ? t('Same rank') : `±${rankDiff} ${t('ranks')}`,
          ),
          h(
            'button',
            {
              type: 'button',
              disabled: active || busy || rankDiff >= 2,
              onClick: () => this.handleRankDiffChange(1),
            },
            '+',
          ),
        ),
      ),

      searching
        ? h(
            'button',
            {
              type: 'button',
              class: 'ogs-matchmaking-action cancel',
              disabled: busy,
              onClick: onCancelAutomatch,
            },
            t('Cancel search'),
          )
        : status === 'matched'
          ? h(
              'p',
              {class: 'ogs-matchmaking-status'},
              t('Match found. Opening board…'),
            )
          : h(
              'button',
              {
                type: 'button',
                class: 'ogs-matchmaking-action',
                disabled: busy || !authenticated || active,
                title: !authenticated
                  ? t('OGS socket must be authenticated first.')
                  : t('Find an OGS opponent.'),
                onClick: onStartAutomatch,
              },
              t('Find opponent'),
            ),
    )
  }
}

function simplifyMatchmakingOptions(options) {
  let boardSizes = Array.isArray(options?.boardSizes)
    ? options.boardSizes.filter((size) => [9, 13, 19].includes(size))
    : defaultMatchmakingOptions.boardSizes

  if (boardSizes.length === 0) boardSizes = [19]

  let speed = Array.isArray(options?.speeds)
    ? options.speeds[0]
    : defaultMatchmakingOptions.speeds[0]
  let system = options?.timeSystem || defaultMatchmakingOptions.timeSystem

  let timePreset =
    timePresets.find(
      (preset) => preset.speed === speed && preset.system === system,
    )?.id || timePresets[0].id

  let handicap = mapHandicapToSimple(options?.handicap)
  let rankDiff = Math.min(
    2,
    Math.max(
      0,
      Math.min(
        options?.lowerRankDiff ?? defaultMatchmakingOptions.lowerRankDiff,
        options?.upperRankDiff ?? defaultMatchmakingOptions.upperRankDiff,
      ),
    ),
  )

  return {boardSizes, timePreset, handicap, rankDiff}
}

function expandMatchmakingOptions(simple, current, changedField) {
  let preset = timePresets.find((p) => p.id === simple.timePreset)
  let handicap = simpleHandicapOptions.find((h) => h.id === simple.handicap)
  let options = {...defaultMatchmakingOptions, ...current}

  return {
    boardSizes: [...simple.boardSizes],
    speeds: [preset?.speed || defaultMatchmakingOptions.speeds[0]],
    timeSystem: preset?.system || defaultMatchmakingOptions.timeSystem,
    lowerRankDiff: simple.rankDiff,
    upperRankDiff: simple.rankDiff,
    rules: options.rules,
    handicap:
      changedField === 'handicap'
        ? handicap?.value || defaultMatchmakingOptions.handicap
        : options.handicap,
  }
}

function mapHandicapToSimple(handicap) {
  if (handicap?.value === 'disabled') return 'none'
  if (handicap?.condition === 'required') return 'handicap'

  return 'standard'
}
