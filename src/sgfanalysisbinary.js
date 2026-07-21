const {existsSync} = require('fs')
const {join, resolve} = require('path')

const ANALYZE_SGF_COMMAND = 'analyze-sgf'

function getAnalyzeSgfExecutableName(platform = process.platform) {
  return platform === 'win32' ? 'analyze-sgf.exe' : 'analyze-sgf'
}

function getAnalyzeSgfResourcePath({
  resourcesPath = process.resourcesPath,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (typeof resourcesPath !== 'string' || resourcesPath === '') return null

  return join(
    resourcesPath,
    'analyze-sgf',
    `${platform}-${arch}`,
    getAnalyzeSgfExecutableName(platform),
  )
}

function resolveAnalyzeSgfPath({
  isPackaged = false,
  resourcesPath = process.resourcesPath,
  appPath = resolve(__dirname, '..'),
  platform = process.platform,
  arch = process.arch,
  exists = existsSync,
} = {}) {
  let bundledPath = getAnalyzeSgfResourcePath({resourcesPath, platform, arch})

  if (bundledPath != null && (isPackaged || exists(bundledPath))) {
    return {path: bundledPath, status: 'bundled', args: []}
  }

  let localPath = getAnalyzeSgfLocalPath({appPath, platform})
  if (exists(localPath.displayPath)) {
    return {path: localPath.path, status: 'local', args: localPath.args}
  }

  return {path: ANALYZE_SGF_COMMAND, status: 'path', args: []}
}

function getAnalyzeSgfLocalPath({
  appPath = resolve(__dirname, '..'),
  platform = process.platform,
  nodeExecutable = process.execPath,
} = {}) {
  if (platform === 'win32') {
    let scriptPath = join(
      appPath,
      'node_modules',
      'analyze-sgf',
      'src',
      'index.js',
    )
    return {path: nodeExecutable, displayPath: scriptPath, args: [scriptPath]}
  }

  let binPath = join(appPath, 'node_modules', '.bin', ANALYZE_SGF_COMMAND)
  return {path: binPath, displayPath: binPath, args: []}
}

function getAnalyzeSgfStatus({
  analyzeSgfPath,
  exists = existsSync,
  pathSeparator = process.platform === 'win32' ? '\\' : '/',
} = {}) {
  if (typeof analyzeSgfPath !== 'string' || analyzeSgfPath === '') {
    return 'missing'
  }

  if (analyzeSgfPath === ANALYZE_SGF_COMMAND) return 'path'
  if (
    !analyzeSgfPath.includes(pathSeparator) &&
    !analyzeSgfPath.includes('/')
  ) {
    return 'path'
  }

  return exists(analyzeSgfPath) ? 'local' : 'missing'
}

module.exports = {
  ANALYZE_SGF_COMMAND,
  getAnalyzeSgfExecutableName,
  getAnalyzeSgfLocalPath,
  getAnalyzeSgfResourcePath,
  getAnalyzeSgfStatus,
  resolveAnalyzeSgfPath,
}
