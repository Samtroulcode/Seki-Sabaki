import {h} from 'preact'

export function CheckboxGroup({
  title,
  name,
  values,
  selected,
  format = (x) => x,
  disabled,
  onChange,
}) {
  return h(
    'fieldset',
    {},
    h('legend', {}, title),
    values.map((value) =>
      h(
        'label',
        {class: 'ogs-inline-option'},
        h('input', {
          type: 'checkbox',
          name,
          value,
          checked: selected.includes(value),
          disabled,
          onChange,
        }),
        h('span', {}, format(value)),
      ),
    ),
  )
}

export function SelectField({
  label,
  name,
  value,
  values,
  format = (x) => x,
  disabled,
  onChange,
}) {
  return h(
    'label',
    {},
    h('span', {}, label),
    h(
      'select',
      {name, value, disabled, onChange},
      values.map((item) => h('option', {value: item}, format(item))),
    ),
  )
}

export function NumberField({label, name, value, disabled, onInput}) {
  return h(
    'label',
    {},
    h('span', {}, label),
    h('input', {
      name,
      type: 'number',
      min: 0,
      max: 9,
      value,
      disabled,
      onInput,
    }),
  )
}

export function RadioGroup({
  label,
  name,
  values,
  selected,
  format = (x) => x,
  disabled,
  onChange,
}) {
  return h(
    'div',
    {class: 'ogs-option-group'},
    h('span', {class: 'ogs-option-group-label'}, label),
    h(
      'div',
      {class: 'ogs-inline-options'},
      values.map((value) =>
        h(
          'label',
          {class: 'ogs-inline-option'},
          h('input', {
            type: 'radio',
            name,
            value,
            checked: selected === value,
            disabled,
            onChange,
          }),
          h('span', {}, format(value)),
        ),
      ),
    ),
  )
}
