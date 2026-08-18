import {h, Component} from 'preact'
import natsort from 'natsort'

import i18n from '../i18n.js'
import * as gametree from '../modules/gametree.js'
import {validateTsumegoContent} from '../modules/tsumegovalidator.js'
import {
  countLibraryProblems,
  getBuiltinCollectionMetadata,
  getLibraryConfig,
  listBuiltinLibraryEntries,
  listLibraryEntries,
  openBuiltinLibraryFile,
  openLibraryFile,
  chooseLibraryRoot,
} from '../modules/library.js'
import {
  buildProgressKey,
  getTsumegoProgress,
  markTsumegoProblemCompleted,
} from '../modules/tsumegoprogress.js'
import {setLastTsumegoCollection} from '../modules/tsumegocollection.js'
import TsumegoCreator from './TsumegoCreator.js'
import TsumegoSolver from './TsumegoSolver.js'

const t = i18n.context('TsumegoPanel')
const naturalCompare = natsort({insensitive: true})

export default class TsumegoPanel extends Component {
  constructor(props) {
    super(props)
    let request = props.request
    let source = request?.source === 'user' ? 'user' : 'builtin'
    let currentPath = request?.relativePath || this.getRootPath(source)
    this.state = {
      source,
      currentPath,
      config: null,
      entries: [],
      collectionMetadata: null,
      busy: true,
      error: null,
      view: 'browser',
      problemIndex: null,
      problemCount: 0,
      relativePath: null,
      content: null,
      gameTree: null,
      problem: null,
      progress: {},
      dirTotals: {},
    }
    this.refreshId = 0
    this.problemLoadId = 0
    this.pendingProblemPath = request?.problemPath || null
  }

  componentDidMount() {
    this.loadProgress()
    let request = this.props.request
    if (request?.source != null) {
      this.applyRequest(request)
    } else {
      this.refresh()
    }
  }

  componentDidUpdate(previousProps) {
    let nextId = this.props.request?.requestId ?? null
    let previousId = previousProps.request?.requestId ?? null
    if (nextId != null && nextId !== previousId) {
      this.applyRequest(this.props.request)
    }
  }

  getRootPath(source = this.state.source) {
    return source === 'builtin' ? 'tsumego' : 'Tsumego'
  }

  getDisplayPath() {
    let root = this.getRootPath()
    let currentPath = normalizeRelativePath(this.state.currentPath)
    if (currentPath === root) return ''
    return currentPath.startsWith(`${root}/`)
      ? currentPath.slice(root.length + 1)
      : currentPath
  }

  // Loads persisted progress into module state. A read failure must not block
  // the workspace, so it degrades to an empty progress.
  async loadProgress() {
    try {
      let result = await getTsumegoProgress()
      if (result?.problems) this.setState({progress: result.problems})
    } catch (err) {
      // Non-blocking: keep the empty progress.
    }
  }

  // Computes recursive problem totals for the current folder and each
  // directory entry, without reading any SGF content.
  async loadTotals(source, currentPath, entries) {
    let paths = [
      currentPath,
      ...entries
        .filter((entry) => entry.type === 'directory')
        .map((entry) => entry.relativePath),
    ]
    let totals = {}
    await Promise.all(
      paths.map(async (relativePath) => {
        try {
          let result = await countLibraryProblems(source, relativePath)
          if (result?.ok === true) totals[relativePath] = result.count
        } catch (err) {
          // Leave this folder without a total.
        }
      }),
    )
    return totals
  }

  // Applies a targeted navigation request (collection and/or problem). Falls
  // back to the source root when the request is invalid, so a bad request
  // never crashes the workspace.
  async applyRequest(request) {
    let source = request.source === 'user' ? 'user' : 'builtin'
    let relativePath = normalizeRelativePath(request.relativePath || '')
    let parts = splitRelativePath(relativePath)
    if (
      parts.length === 0 ||
      parts.some((part) => part === '..' || part === '.')
    ) {
      relativePath = this.getRootPath(source)
    }

    this.setState({
      source,
      currentPath: relativePath,
      view: 'browser',
      problemIndex: null,
      problemCount: 0,
      relativePath: null,
      content: null,
      gameTree: null,
      problem: null,
    })
    await this.refresh(source, relativePath)

    if (request.problemPath != null) {
      await this.openProblemByPath(request.problemPath)
    }
  }

  // Opens a problem by its relative path using the existing problem workflow.
  async openProblemByPath(problemPath) {
    let entry = this.state.entries.find(
      (candidate) => candidate.relativePath === problemPath,
    )
    if (entry == null || entry.type !== 'file') return
    await this.handleProblemClick(entry)
  }

  // Persists the currently displayed collection (a folder containing SGF
  // problems) as the last opened Tsumego collection. The root and folders
  // without any SGF file are not remembered.
  rememberCollection(source, currentPath, entries) {
    let root = this.getRootPath(source)
    let normalizedPath = normalizeRelativePath(currentPath)
    if (normalizedPath === root) return
    let hasSgf = entries.some((entry) => entry.type === 'file')
    if (!hasSgf) return
    setLastTsumegoCollection({source, relativePath: normalizedPath})
  }

  handleProblemSolved() {
    let {source, relativePath} = this.state
    let key = buildProgressKey(source, relativePath)
    if (key == null) return
    let completedAt = new Date().toISOString()
    this.setState((prev) => ({
      progress: {...prev.progress, [key]: {completed: true, completedAt}},
    }))
    markTsumegoProblemCompleted(source, relativePath).catch(() => {})
  }

  isProblemCompleted(source, relativePath) {
    let key = buildProgressKey(source, relativePath)
    return key != null && this.state.progress[key]?.completed === true
  }

  countSolvedForFolder(source, folderPath) {
    let prefix = `${source}:${folderPath}/`
    let count = 0
    for (let key of Object.keys(this.state.progress)) {
      if (key.startsWith(prefix)) count += 1
    }
    return count
  }

  async refresh(
    source = this.state.source,
    currentPath = this.state.currentPath,
  ) {
    let refreshId = ++this.refreshId
    this.setState({busy: true, error: null})
    try {
      let config = await getLibraryConfig()
      if (refreshId !== this.refreshId) return
      if (source === 'user' && !config.configured) {
        this.setState({
          source,
          config,
          entries: [],
          collectionMetadata: null,
          busy: false,
          error: null,
        })
        return
      }

      let result =
        source === 'builtin'
          ? await listBuiltinLibraryEntries(currentPath)
          : await listLibraryEntries(currentPath)
      if (refreshId !== this.refreshId) return
      if (result?.ok !== true) {
        this.setState({
          source,
          config,
          entries: [],
          collectionMetadata: null,
          busy: false,
          error: t('Unable to read this Tsumego folder.'),
        })
        return
      }

      let entries = await this.filterEntries(source, result.entries || [])
      if (refreshId !== this.refreshId) return
      let collectionMetadata = null
      if (source === 'builtin') {
        let metadata = await getBuiltinCollectionMetadata(currentPath)
        if (refreshId !== this.refreshId) return
        if (metadata?.ok === true) collectionMetadata = metadata.metadata
      }

      this.setState({
        source,
        currentPath,
        config,
        entries,
        collectionMetadata,
        busy: false,
        error: null,
      })
      this.rememberCollection(source, currentPath, entries)

      let totals = await this.loadTotals(source, currentPath, entries)
      if (refreshId !== this.refreshId) return
      this.setState({dirTotals: totals})
    } catch (err) {
      if (refreshId !== this.refreshId) return
      this.setState({
        source,
        config: this.state.config,
        entries: [],
        collectionMetadata: null,
        busy: false,
        error: t('Unable to load this Tsumego folder.'),
      })
    }
  }

  async filterEntries(source, entries) {
    let directories = entries.filter((entry) => entry.type === 'directory')
    if (source !== 'builtin' || directories.length === 0) return entries

    let metadata = await Promise.all(
      directories.map(async (entry) => {
        try {
          return await getBuiltinCollectionMetadata(entry.relativePath)
        } catch (err) {
          return null
        }
      }),
    )
    let gamesDirectories = new Set(
      directories
        .map((entry, index) =>
          metadata[index]?.ok === true &&
          metadata[index].metadata?.type === 'games'
            ? entry.relativePath
            : null,
        )
        .filter(Boolean),
    )
    return entries.filter((entry) => !gamesDirectories.has(entry.relativePath))
  }

  async handleSourceChange(source) {
    this.problemLoadId += 1
    let currentPath = this.getRootPath(source)
    this.setState({
      source,
      currentPath,
      view: 'browser',
      problemIndex: null,
      problemCount: 0,
      relativePath: null,
      content: null,
      gameTree: null,
      problem: null,
    })
    await this.refresh(source, currentPath)
  }

  async handleEntryClick(entry) {
    if (entry.type === 'directory') {
      this.problemLoadId += 1
      this.setState({currentPath: entry.relativePath, busy: true, error: null})
      await this.refresh(this.state.source, entry.relativePath)
      return
    }

    await this.handleProblemClick(entry)
  }

  async handleProblemClick(entry) {
    let problemLoadId = ++this.problemLoadId
    this.setState({busy: true, error: null})
    try {
      let result =
        this.state.source === 'builtin'
          ? await openBuiltinLibraryFile(entry.relativePath)
          : await openLibraryFile(entry.relativePath)
      if (problemLoadId !== this.problemLoadId) return
      if (result?.ok !== true) {
        this.setState({busy: false, error: t('Unable to open this tsumego.')})
        return
      }

      let validation = validateTsumegoContent(result.content)
      if (problemLoadId !== this.problemLoadId) return
      if (!validation.valid) {
        this.setState({
          busy: false,
          error: this.getValidationErrorMessage(validation),
        })
        return
      }

      let gameTree = validation.gameTree
      let problem = validation.problem

      let problemEntries = this.state.entries
        .filter((candidate) => candidate.type === 'file')
        .sort((a, b) => naturalCompare(a.name, b.name))
      let problemIndex = problemEntries.findIndex(
        (candidate) => candidate.relativePath === entry.relativePath,
      )
      this.setState({
        busy: false,
        view: 'problem',
        error: null,
        problemIndex: problemIndex < 0 ? 0 : problemIndex,
        problemCount: problemEntries.length,
        relativePath: entry.relativePath,
        content: result.content,
        gameTree,
        problem,
      })
    } catch (err) {
      if (problemLoadId !== this.problemLoadId) return
      this.setState({busy: false, error: t('Unsupported or invalid tsumego.')})
    }
  }

  async handleBack() {
    this.problemLoadId += 1
    this.setState({view: 'browser', error: null})
  }

  // Maps the first validation error to a user-facing message. Unknown codes
  // fall back to the generic message so a new diagnostic never crashes the UI.
  getValidationErrorMessage(validation) {
    let first = validation.errors[0]
    if (first == null) return t('Unsupported or invalid tsumego.')
    switch (first.code) {
      case 'INVALID_SGF':
        return t('This file is not a valid SGF.')
      case 'NO_MOVES':
        return t('This SGF does not contain a Tsumego solution.')
      case 'NO_PLAYABLE_SOLUTION':
        return t('No playable Tsumego solution could be detected.')
      case 'NO_GAME_TREE':
        return t('No SGF game tree was found.')
      default:
        return t('Unsupported or invalid tsumego.')
    }
  }

  handleCreateProblem() {
    this.problemLoadId += 1
    this.setState({view: 'creator', error: null})
  }

  handleCreatorBack() {
    this.setState({view: 'browser'})
  }

  // After a successful save the browser switches to My Library and shows the
  // folder that received the file, so the new problem is visible without
  // restarting Seki. The Creator itself stays open.
  handleCreatorSaved(relativePath) {
    let parts = splitRelativePath(relativePath)
    parts.pop()
    let folder = parts.join('/') || 'Tsumego'
    this.problemLoadId += 1
    this.setState({source: 'user', currentPath: folder})
    this.refresh('user', folder)
  }

  async handleAdjacentProblem(offset) {
    let problemEntries = this.state.entries
      .filter((entry) => entry.type === 'file')
      .sort((a, b) => naturalCompare(a.name, b.name))
    let currentIndex = problemEntries.findIndex(
      (entry) => entry.relativePath === this.state.relativePath,
    )
    let nextEntry = problemEntries[currentIndex + offset]
    if (nextEntry != null) await this.handleProblemClick(nextEntry)
  }

  async handleParentClick() {
    this.problemLoadId += 1
    let root = this.getRootPath()
    let currentPath = normalizeRelativePath(this.state.currentPath)
    if (currentPath === root) return
    let parts = splitRelativePath(currentPath)
    parts.pop()
    let parentPath = parts.join('/') || root
    this.setState({currentPath: parentPath, busy: true, error: null})
    await this.refresh(this.state.source, parentPath)
  }

  async handleChooseRoot() {
    this.problemLoadId += 1
    this.setState({busy: true, error: null})
    try {
      let result = await chooseLibraryRoot()
      if (result?.ok === true) {
        let currentPath = this.getRootPath('user')
        this.setState({source: 'user', currentPath})
        await this.refresh('user', currentPath)
      } else if (!result?.cancelled) {
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
    let {source, config, busy, error, view} = this.state
    let isProblemView = view === 'problem' || view === 'creator'
    return h(
      'section',
      {
        id: 'tsumego-dashboard',
        class: `tsumego-panel ${isProblemView ? 'is-problem' : ''}`,
      },
      h('h1', {}, t('Tsumego')),
      error != null && h('p', {class: 'ogs-error'}, error),
      view === 'problem'
        ? this.renderProblem()
        : view === 'creator'
          ? this.renderCreator()
          : this.renderBrowser(),
      source === 'user' && config?.configured !== true && !isProblemView
        ? h(
            'p',
            {class: 'tsumego-panel-status'},
            t('My Library is not configured.'),
          )
        : null,
      busy && !isProblemView
        ? h('p', {class: 'tsumego-panel-status'}, t('Loading Tsumego…'))
        : null,
    )
  }

  renderBrowser() {
    let {source, config, entries, collectionMetadata, currentPath, busy} =
      this.state
    let displayPath = this.getDisplayPath()
    let configured = config?.configured === true
    let sortedEntries = sortEntries(entries)

    return h(
      'div',
      {class: 'tsumego-browser'},
      h(
        'div',
        {class: 'tsumego-browser-actions'},
        h(
          'button',
          {
            type: 'button',
            class: 'tsumego-create-problem-button',
            onClick: () => this.handleCreateProblem(),
          },
          t('Create Problem'),
        ),
      ),
      h(
        'div',
        {class: 'tsumego-source-tabs', role: 'tablist'},
        h(
          'button',
          {
            type: 'button',
            class: source === 'builtin' ? 'selected' : '',
            role: 'tab',
            'aria-selected': source === 'builtin',
            onClick: () => this.handleSourceChange('builtin'),
          },
          t('Built-in'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: source === 'user' ? 'selected' : '',
            role: 'tab',
            'aria-selected': source === 'user',
            onClick: () => this.handleSourceChange('user'),
          },
          t('My Library'),
        ),
      ),
      source === 'user' && !configured
        ? h(
            'article',
            {class: 'tsumego-setup-card'},
            h('h2', {}, t('My Library')),
            h('p', {}, t('Choose a Library folder to browse your Tsumego.')),
            h(
              'button',
              {
                type: 'button',
                disabled: busy,
                onClick: () => this.handleChooseRoot(),
              },
              t('Configure Library'),
            ),
          )
        : h(
            'article',
            {class: 'tsumego-browser-card'},
            h(
              'div',
              {class: 'tsumego-browser-toolbar'},
              displayPath !== '' &&
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'tsumego-back-button',
                    disabled: busy,
                    onClick: () => this.handleParentClick(),
                  },
                  `‹ ${t('Back')}`,
                ),
              h(
                'div',
                {},
                h(
                  'h2',
                  {},
                  collectionMetadata?.title || getFolderTitle(currentPath),
                ),
                h(
                  'p',
                  {class: 'tsumego-source-label'},
                  source === 'builtin' ? t('Built-in') : t('My Library'),
                ),
              ),
            ),
            collectionMetadata != null &&
              h(
                'div',
                {class: 'tsumego-collection-metadata'},
                collectionMetadata.author &&
                  h('p', {}, collectionMetadata.author),
                collectionMetadata.description &&
                  h('p', {}, collectionMetadata.description),
                h(
                  'p',
                  {},
                  [collectionMetadata.source, collectionMetadata.license]
                    .filter(Boolean)
                    .join(' · '),
                ),
              ),
            h(
              'p',
              {class: 'tsumego-breadcrumb'},
              displayPath === '' ? t('Collections') : displayPath,
            ),
            !busy && sortedEntries.length === 0
              ? h('p', {class: 'tsumego-empty'}, t('This folder is empty.'))
              : h(
                  'div',
                  {class: 'tsumego-entry-grid'},
                  sortedEntries.map((entry) =>
                    h(
                      'button',
                      {
                        key: entry.relativePath,
                        type: 'button',
                        class: `tsumego-entry tsumego-entry-${entry.type}`,
                        onClick: () => this.handleEntryClick(entry),
                      },
                      h('img', {
                        class: 'tsumego-entry-icon',
                        src:
                          entry.type === 'directory'
                            ? './node_modules/@primer/octicons/build/svg/file-directory-16.svg'
                            : './node_modules/@primer/octicons/build/svg/file-16.svg',
                        alt: '',
                        'aria-hidden': 'true',
                      }),
                      entry.type === 'file' &&
                        this.isProblemCompleted(source, entry.relativePath) &&
                        h('img', {
                          class: 'tsumego-entry-check',
                          src: './node_modules/@primer/octicons/build/svg/check-16.svg',
                          alt: '',
                          'aria-hidden': 'true',
                        }),
                      h('span', {class: 'tsumego-entry-name'}, entry.name),
                      entry.type === 'file' &&
                        h('span', {class: 'tsumego-entry-meta'}, t('Problem')),
                      entry.type === 'directory' &&
                        this.state.dirTotals[entry.relativePath] != null &&
                        h(
                          'span',
                          {class: 'tsumego-entry-progress'},
                          `${this.countSolvedForFolder(
                            source,
                            entry.relativePath,
                          )} / ${this.state.dirTotals[entry.relativePath]} ${t(
                            'solved',
                          )}`,
                        ),
                    ),
                  ),
                ),
            this.state.dirTotals[currentPath] != null &&
              h(
                'p',
                {class: 'tsumego-problem-count'},
                `${this.countSolvedForFolder(
                  source,
                  currentPath,
                )} / ${this.state.dirTotals[currentPath]} ${t('solved')}`,
              ),
          ),
    )
  }

  renderProblem() {
    let {problem, problemIndex, problemCount, relativePath, source, gameTree} =
      this.state
    let initialComment = gametree.getRootProperty(gameTree, 'C', '') || ''
    return h(TsumegoSolver, {
      key: relativePath,
      gameTree,
      problem,
      problemIndex,
      problemCount,
      relativePath,
      source,
      initialComment,
      onBack: () => this.handleBack(),
      onPrevious: () => this.handleAdjacentProblem(-1),
      onNext: () => this.handleAdjacentProblem(1),
      onSolved: () => this.handleProblemSolved(),
    })
  }

  renderCreator() {
    // The save picker starts in the folder the user was browsing when it is
    // inside My Library/Tsumego; otherwise it starts at the Tsumego root.
    // A Built-in path is never offered as a save destination.
    let initialSaveDirectory = 'Tsumego'
    if (
      this.state.source === 'user' &&
      this.state.currentPath.startsWith('Tsumego/')
    ) {
      initialSaveDirectory = this.state.currentPath
    }
    return h(TsumegoCreator, {
      onBack: () => this.handleCreatorBack(),
      initialSaveDirectory,
      onSaved: (relativePath) => this.handleCreatorSaved(relativePath),
    })
  }
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => naturalCompare(a.name, b.name))
}

function getFolderTitle(relativePath) {
  let parts = splitRelativePath(relativePath)
  return parts[parts.length - 1] || 'Tsumego'
}

function splitRelativePath(relativePath) {
  return String(relativePath || '')
    .split(/[\\/]/)
    .filter(Boolean)
}

function normalizeRelativePath(relativePath) {
  return splitRelativePath(relativePath).join('/')
}
