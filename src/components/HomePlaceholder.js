import {h} from 'preact'

export default function HomePlaceholder({id, title, description, children}) {
  return h(
    'section',
    {id, class: 'home-section-panel'},
    h(
      'div',
      {class: 'home-section-heading'},
      h('h1', {}, title),
      h('p', {}, description),
    ),
    children,
  )
}
