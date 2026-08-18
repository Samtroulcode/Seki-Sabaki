import {h, Component} from 'preact'

import i18n from '../i18n.js'
import {createLibraryDirectory, listLibraryEntries} from '../modules/library.js'

const t = i18n.context('TsumegoSaveDialog')
const TSUMEGO_ROOT = 'Tsumego'

// Normalizes a directory to a safe path inside `Tsumego`. Anything outside
// (traversal, absolute path, unknown root) falls back to the Tsumego root.
function normalizeDirectory(directory) {
  let parts = String(directory || '')
    .split(/[\\/]/)
    .filter((part) => part !== '' && part !== '.' && part !== '..')
  if (parts[0] !== TSUMEGO_ROOT) return TSUMEGO_ROOT
  return parts.join('/')
}

function joinPath(directory, name) {
  return directory === '' ? name : `${directory}/${name}`
}

// Validates a single folder or file name: trimmed, non-empty, no path
// separators, no `.`/`..`, no drive letter. Returns the trimmed name or null.
function validateName(name) {
  if (typeof name !== 'string') return null
  let trimmed = name.trim()
  if (trimmed === '') return null
  if (trimmed === '.' || trimmed === '..') return null
  if (trimmed.includes('/') || trimmed.includes('\\')) return null
  if (/^[a-zA-Z]:/.test(trimmed)) return null
  return trimmed
}

export default class TsumegoSaveDialog extends Component {
  constructor(props) {
    super(props)
    this.state = {
      directory: normalizeDirectory(props.initialDirectory),
      entries: [],
      name: '',
      folderName: '',
      busy: true,
      saving: false,
      error: null,
    }
  }

  componentDidMount() {
    this.loadDirectory(this.state.directory)
  }

  async loadDirectory(directory) {
    this.setState({busy: true, error: null})
    try {
      let result = await listLibraryEntries(directory)
      if (result?.ok !== true) {
        if (directory !== TSUMEGO_ROOT) {
          this.loadDirectory(TSUMEGO_ROOT)
          return
        }
        this.setState({
          busy: false,
          entries: [],
          error: t('Unable to read this folder.'),
        })
        return
      }
      let folders = (result.entries || []).filter(
        (entry) => entry.type === 'directory',
      )
      this.setState({busy: false, entries: folders, directory})
    } catch (err) {
      this.setState({busy: false, error: t('Unable to read this folder.')})
    }
  }

  handleEnterFolder(entry) {
    this.loadDirectory(entry.relativePath)
  }

  handleParent = () => {
    let {directory} = this.state
    if (directory === TSUMEGO_ROOT) return
    let parts = directory.split('/')
    parts.pop()
    this.loadDirectory(parts.join('/') || TSUMEGO_ROOT)
  }

  handleBreadcrumbClick = (parts) => {
    this.loadDirectory(parts.join('/'))
  }

  handleFolderNameChange = (evt) => {
    this.setState({folderName: evt.target.value, error: null})
  }

  handleCreateFolder = async () => {
    if (this.state.busy) return

    let name = validateName(this.state.folderName)
    if (name == null) {
      this.setState({error: t('Enter a valid folder name.')})
      return
    }

    this.setState({busy: true, error: null})
    try {
      let result = await createLibraryDirectory(
        joinPath(this.state.directory, name),
      )
      if (result?.ok === true) {
        this.setState({folderName: '', busy: false})
        await this.loadDirectory(this.state.directory)
        return
      }
      if (result?.exists === true) {
        this.setState({
          busy: false,
          error: t('A folder with this name already exists.'),
        })
        return
      }
      this.setState({busy: false, error: t('Unable to create this folder.')})
    } catch (err) {
      this.setState({busy: false, error: t('Unable to create this folder.')})
    }
  }

  handleNameChange = (evt) => {
    this.setState({name: evt.target.value, error: null})
  }

  handleSave = async () => {
    if (this.state.saving || this.state.busy) return

    let name = validateName(this.state.name)
    if (name == null) {
      this.setState({error: t('Enter a valid problem name.')})
      return
    }
    let filename = name.toLowerCase().endsWith('.sgf') ? name : `${name}.sgf`
    let relativePath = joinPath(this.state.directory, filename)

    this.setState({saving: true, error: null})
    try {
      let result = await this.props.onSave(relativePath)
      if (result?.ok === true) {
        this.props.onClose()
        return
      }
      if (result?.error != null) {
        this.setState({saving: false, error: result.error})
        return
      }
      // Cancelled (e.g. the user declined to replace an existing file).
      this.setState({saving: false})
    } catch (err) {
      this.setState({saving: false, error: t('Unable to save this problem.')})
    }
  }

  handleKeyDown = (evt) => {
    if (evt.key === 'Escape') this.props.onClose()
  }

  render() {
    let {directory, entries, name, folderName, busy, saving, error} = this.state
    let parts = directory.split('/')
    let isRoot = directory === TSUMEGO_ROOT

    return h(
      'div',
      {class: 'tsumego-save-dialog', onKeyDown: this.handleKeyDown},
      h(
        'div',
        {class: 'tsumego-save-dialog-card'},
        h('h2', {}, t('Save Tsumego')),
        h('p', {class: 'tsumego-save-dialog-label'}, t('Location')),
        h(
          'div',
          {class: 'tsumego-save-dialog-breadcrumb'},
          h('span', {}, t('My Library')),
          parts.map((part, index) =>
            h(
              'button',
              {
                key: index,
                type: 'button',
                class: index === parts.length - 1 ? 'current' : '',
                disabled: index === parts.length - 1,
                onClick: () =>
                  this.handleBreadcrumbClick(parts.slice(0, index + 1)),
              },
              part,
            ),
          ),
        ),
        h(
          'div',
          {class: 'tsumego-save-dialog-toolbar'},
          h(
            'button',
            {
              type: 'button',
              class: 'tsumego-save-dialog-parent',
              disabled: isRoot || busy,
              onClick: this.handleParent,
              'aria-label': t('Go to parent folder'),
            },
            '↑',
          ),
        ),
        h(
          'div',
          {class: 'tsumego-save-dialog-folders'},
          busy
            ? h('p', {class: 'tsumego-save-dialog-status'}, t('Loading…'))
            : entries.length === 0
              ? h(
                  'p',
                  {class: 'tsumego-save-dialog-empty'},
                  t('No subfolders.'),
                )
              : entries.map((entry) =>
                  h(
                    'button',
                    {
                      key: entry.relativePath,
                      type: 'button',
                      class: 'tsumego-save-dialog-folder',
                      onClick: () => this.handleEnterFolder(entry),
                    },
                    h('img', {
                      class: 'tsumego-save-dialog-folder-icon',
                      src: './node_modules/@primer/octicons/build/svg/file-directory-16.svg',
                      alt: '',
                      'aria-hidden': 'true',
                    }),
                    h('span', {}, entry.name),
                  ),
                ),
        ),
        h(
          'div',
          {class: 'tsumego-save-dialog-new-folder'},
          h('input', {
            type: 'text',
            value: folderName,
            placeholder: t('New folder name'),
            onInput: this.handleFolderNameChange,
            onKeyDown: (evt) => {
              if (evt.key === 'Enter') this.handleCreateFolder()
            },
          }),
          h(
            'button',
            {
              type: 'button',
              disabled: busy,
              onClick: this.handleCreateFolder,
            },
            t('+ New Folder'),
          ),
        ),
        h(
          'div',
          {class: 'tsumego-save-dialog-name'},
          h('label', {for: 'tsumego-save-name'}, t('Problem name')),
          h('input', {
            id: 'tsumego-save-name',
            type: 'text',
            value: name,
            placeholder: t('Snapback 01'),
            onInput: this.handleNameChange,
            onKeyDown: (evt) => {
              if (evt.key === 'Enter') this.handleSave()
            },
          }),
        ),
        error != null && h('p', {class: 'ogs-error'}, error),
        h(
          'div',
          {class: 'tsumego-save-dialog-actions'},
          h(
            'button',
            {type: 'button', disabled: saving, onClick: this.props.onClose},
            t('Cancel'),
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'tsumego-save-dialog-save',
              disabled: saving || busy,
              onClick: this.handleSave,
            },
            t('Save'),
          ),
        ),
      ),
    )
  }
}
