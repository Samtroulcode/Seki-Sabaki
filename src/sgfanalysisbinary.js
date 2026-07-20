const {existsSync} = require('fs')
const {join} = require('path')

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
  platform = process.platform,
  arch = process.arch,
  exists = existsSync,
} = {}) {
  let bundledPath = getAnalyzeSgfResourcePath({resourcesPath, platform, arch})

  if (bundledPath != null && (isPackaged || exists(bundledPath))) {
    return bundledPath
  }

  return ANALYZE_SGF_COMMAND
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

  return exists(analyzeSgfPath) ? 'bundled' : 'missing'
}

module.exports = {
  ANALYZE_SGF_COMMAND,
  getAnalyzeSgfExecutableName,
  getAnalyzeSgfResourcePath,
  getAnalyzeSgfStatus,
  resolveAnalyzeSgfPath,
}
