const {basename, extname, join, resolve} = require('path')
const {existsSync, statSync, readdirSync, readFileSync} = require('fs')
const sgf = require('@sabaki/sgf')

const DEFAULT_ANALYSIS_NAME = 'partie'
const MAX_SLUG_LENGTH = 80

function slugifyAnalysisName(value, fallback = DEFAULT_ANALYSIS_NAME) {
  let slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.\.+/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/g, '')

  return slug || fallback
}

function normalizeAnalysisDate(value, now = new Date()) {
  let text = String(value || '').trim()
  let match = text.match(/\d{4}(?:-\d{2}(?:-\d{2})?)?/)

  if (match != null) return match[0]

  return now.toISOString().slice(0, 10)
}

function getAnalysisBoardSize(metadata = {}) {
  let width = Number(metadata.boardWidth ?? metadata.width ?? 19)
  let height = Number(metadata.boardHeight ?? metadata.height ?? width)

  width = Number.isInteger(width) && width > 0 ? width : 19
  height = Number.isInteger(height) && height > 0 ? height : width

  return {width, height}
}

function buildAnalysisFilename(metadata = {}, {now = new Date()} = {}) {
  let {width, height} = getAnalysisBoardSize(metadata)
  let name =
    metadata.name ||
    metadata.gameName ||
    [metadata.blackPlayer, metadata.whitePlayer].filter(Boolean).join(' vs ')
  let slug = slugifyAnalysisName(name)
  let date = normalizeAnalysisDate(metadata.date, now)

  return `${width}x${height}-${slug}-${date}.sgf`
}

function getUniqueAnalysisOutputPath(
  directory,
  metadata = {},
  {exists = null, now = new Date()} = {},
) {
  if (typeof exists !== 'function') {
    exists = existsSync
  }

  let filename = buildAnalysisFilename(metadata, {now})
  let extension = extname(filename)
  let stem = filename.slice(0, -extension.length)
  let index = 1

  while (true) {
    let candidate = join(
      directory,
      index === 1 ? filename : `${stem}-${index}${extension}`,
    )

    if (!exists(candidate) && !exists(`${candidate}.partial`)) {
      return candidate
    }

    index++
  }
}

function getPartialAnalysisOutputPath(outputPath) {
  return `${outputPath}.partial`
}

function extractSgfAnalysisMetadata(content) {
  let [root] = sgf.parse(content)
  if (root == null) return null
  if (Object.keys(root.data).length === 0) return null

  let size = parseSgfSize(getRootProperty(root, 'SZ'))

  return {
    gameName: getRootProperty(root, 'GN', '') || '',
    blackPlayer:
      getRootProperty(root, 'PB', '') || getRootProperty(root, 'BT', '') || '',
    whitePlayer:
      getRootProperty(root, 'PW', '') || getRootProperty(root, 'WT', '') || '',
    blackRank: getRootProperty(root, 'BR', '') || '',
    whiteRank: getRootProperty(root, 'WR', '') || '',
    result: getRootProperty(root, 'RE', '') || '',
    date: getRootProperty(root, 'DT', '') || '',
    boardWidth: size[0],
    boardHeight: size[1],
    komi: parseKomi(getRootProperty(root, 'KM')),
    rules: parseRules(getRootProperty(root, 'RU')),
    summary: getRootProperty(root, 'C', '') || '',
  }
}

function readSgfAnalysisMetadata(filePath) {
  try {
    return extractSgfAnalysisMetadata(readFileSync(filePath, 'utf8'))
  } catch (err) {
    return null
  }
}

function createAnalyzedGame(filePath, {stat = null} = {}) {
  let metadata = readSgfAnalysisMetadata(filePath)
  if (metadata == null) return null

  let fileStat = stat

  if (fileStat == null) {
    try {
      fileStat = statSync(filePath)
    } catch (err) {
      fileStat = null
    }
  }

  return {
    id: resolve(filePath),
    path: resolve(filePath),
    filename: basename(filePath),
    ...metadata,
    modifiedAt: fileStat?.mtimeMs ?? 0,
  }
}

function listAnalyzedGames(directory) {
  let entries

  try {
    entries = readdirSync(directory, {withFileTypes: true})
  } catch (err) {
    return []
  }

  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sgf'),
    )
    .map((entry) => createAnalyzedGame(join(directory, entry.name)))
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.modifiedAt - a.modifiedAt || a.filename.localeCompare(b.filename),
    )
}

function getRootProperty(root, property, fallback = null) {
  let result = ''
  if (property in root.data) result = root.data[property][0]

  return result === '' ? fallback : result
}

function parseSgfSize(value) {
  if (value == null) return [19, 19]

  let parts = value.toString().split(':')
  let width = Number(parts[0])
  let height = Number(parts[parts.length - 1])

  width = Number.isInteger(width) && width > 0 ? width : 19
  height = Number.isInteger(height) && height > 0 ? height : width

  return [width, height]
}

function parseKomi(value) {
  if (value == null) return null
  let komi = Number(value)
  return Number.isFinite(komi) ? komi : null
}

function parseRules(value) {
  if (typeof value !== 'string' || value.trim() === '') return null

  let normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  let rules = {
    japanese: 'japanese',
    chinese: 'chinese',
    korean: 'korean',
    aga: 'aga',
    'tromp-taylor': 'tromp-taylor',
    tromptaylor: 'tromp-taylor',
    'new-zealand': 'new-zealand',
    newzealand: 'new-zealand',
    nz: 'new-zealand',
  }

  return rules[normalized] || null
}

exports.slugifyAnalysisName = slugifyAnalysisName
exports.normalizeAnalysisDate = normalizeAnalysisDate
exports.getAnalysisBoardSize = getAnalysisBoardSize
exports.buildAnalysisFilename = buildAnalysisFilename
exports.getUniqueAnalysisOutputPath = getUniqueAnalysisOutputPath
exports.getPartialAnalysisOutputPath = getPartialAnalysisOutputPath
exports.extractSgfAnalysisMetadata = extractSgfAnalysisMetadata
exports.parseRules = parseRules
exports.readSgfAnalysisMetadata = readSgfAnalysisMetadata
exports.createAnalyzedGame = createAnalyzedGame
exports.listAnalyzedGames = listAnalyzedGames
