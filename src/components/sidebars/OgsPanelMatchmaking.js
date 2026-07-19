import {h} from 'preact'

import i18n from '../../i18n.js'
import {
  CheckboxGroup,
  NumberField,
  RadioGroup,
  SelectField,
} from './OgsPanelControls.js'
import {
  boardSizes,
  conditions,
  createOgsPanelLabels,
  handicapValues,
  rules,
  speeds,
  timeSystems,
} from './ogsPanelData.js'

const t = i18n.context('OgsPanel')
const ogsPanelLabels = createOgsPanelLabels(t)

export function AutomatchForm({
  options,
  status,
  authenticated,
  busy,
  onOptionChange,
  onConditionChange,
  onMultiChange,
  onStartAutomatch,
  onCancelAutomatch,
}) {
  let searching = status === 'searching'
  let active = ['searching', 'matched'].includes(status)

  return h(
    'section',
    {class: 'ogs-matchmaking'},
    h('h3', {}, t('Play')),
    h('p', {}, t('Choose how you want to play and find an OGS opponent.')),

    h(CheckboxGroup, {
      title: t('Board size'),
      name: 'boardSizes',
      values: boardSizes,
      selected: options.boardSizes,
      format: (size) => `${size}x${size}`,
      disabled: active || busy,
      onChange: onMultiChange,
    }),

    h(CheckboxGroup, {
      title: t('Game speed'),
      name: 'speeds',
      values: speeds,
      selected: options.speeds,
      format: (speed) => ogsPanelLabels.speeds[speed] || speed,
      disabled: active || busy,
      onChange: onMultiChange,
    }),

    h(SelectField, {
      label: t('Clock'),
      name: 'timeSystem',
      value: options.timeSystem,
      values: timeSystems,
      format: (timeSystem) =>
        ogsPanelLabels.timeSystems[timeSystem] || timeSystem,
      disabled: active || busy,
      onChange: onOptionChange,
    }),

    h(NumberField, {
      label: t('Lower rank difference'),
      name: 'lowerRankDiff',
      value: options.lowerRankDiff,
      disabled: active || busy,
      onInput: onOptionChange,
    }),

    h(NumberField, {
      label: t('Upper rank difference'),
      name: 'upperRankDiff',
      value: options.upperRankDiff,
      disabled: active || busy,
      onInput: onOptionChange,
    }),

    h(ConditionValueField, {
      title: t('Rules'),
      valueLabel: t('Rule set'),
      conditionLabel: t('Preference'),
      group: 'rules',
      option: options.rules,
      values: rules,
      formatValue: (rule) => ogsPanelLabels.rules[rule] || rule,
      disabled: active || busy,
      onChange: onConditionChange,
    }),

    h(ConditionValueField, {
      title: t('Handicap games'),
      valueLabel: t('Handicap'),
      conditionLabel: t('Preference'),
      group: 'handicap',
      option: options.handicap,
      values: handicapValues,
      formatValue: (value) => ogsPanelLabels.handicap[value] || value,
      disabled: active || busy,
      onChange: onConditionChange,
    }),

    status === 'searching' &&
      h('p', {class: 'ogs-matchmaking-status'}, t('Searching for opponent…')),
    status === 'matched' &&
      h(
        'p',
        {class: 'ogs-matchmaking-status'},
        t('Match found. Opening board…'),
      ),

    searching
      ? h(
          'button',
          {
            type: 'button',
            disabled: busy,
            onClick: onCancelAutomatch,
          },
          t('Cancel search'),
        )
      : h(
          'button',
          {
            type: 'button',
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

function ConditionValueField({
  title,
  group,
  option,
  values,
  valueLabel,
  conditionLabel,
  formatValue = (x) => x,
  disabled,
  onChange,
}) {
  return h(
    'fieldset',
    {},
    h('legend', {}, title),
    h(RadioGroup, {
      label: conditionLabel,
      name: `${group}.condition`,
      selected: option.condition,
      values: conditions,
      format: (condition) => ogsPanelLabels.conditions[condition] || condition,
      disabled,
      onChange,
    }),
    h(SelectField, {
      label: valueLabel,
      name: `${group}.value`,
      value: option.value,
      values,
      format: formatValue,
      disabled,
      onChange,
    }),
  )
}
