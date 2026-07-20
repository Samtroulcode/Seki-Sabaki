import {basename, extname, join, resolve} from 'path'
import {existsSync, statSync, readdirSync, readFileSync} from 'fs'

import * as sgf from './fileformats/sgf.js'
import * as gametree from './gametree.js'

const DEFAULT_ANALYSIS_NAME = 'partie'
const MAX_SLUG_LENGTH = 80

export function slugifyAnalysisName(value, fallback = DEFAULT_ANALYSIS_NAME) {
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

export function normalizeAnalysisDate(value, now = new Date()) {
  let text = String(value || '').trim()
  let match = text.match(/\d{4}(?:-\d{2}(?:-\d{2})?)?/)

  if (match != null) return match[0]

  return now.toISOString().slice(0, 10)
}

export function getAnalysisBoardSize(metadata = {}) {
  let width = Number(metadata.boardWidth ?? metadata.width ?? 19)
  let height = Number(metadata.boardHeight ?? metadata.height ?? width)

  width = Number.isInteger(width) && width > 0 ? width : 19
  height = Number.isInteger(height) && height > 0 ? height : width

  return {width, height}
}

export function buildAnalysisFilename(metadata = {}, {now = new Date()} = {}) {
  let {width, height} = getAnalysisBoardSize(metadata)
  let name =
    metadata.name ||
    metadata.gameName ||
    [metadata.blackPlayer, metadata.whitePlayer].filter(Boolean).join(' vs ')
  let slug = slugifyAnalysisName(name)
  let date = normalizeAnalysisDate(metadata.date, now)

  return `${width}x${height}-${slug}-${date}.sgf`
}

export function getUniqueAnalysisOutputPath(
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

export function getPartialAnalysisOutputPath(outputPath) {
  return `${outputPath}.partial`
}

export function extractSgfAnalysisMetadata(content) {
  let [tree] = sgf.parse(content)
  if (tree == null) return null
  if (Object.keys(tree.root.data).length === 0) return null

  let info = gametree.getGameInfo(tree)
  let [width, height] = info.size || [19, 19]

  return {
    gameName: info.gameName || '',
    blackPlayer: info.blackName || '',
    whitePlayer: info.whiteName || '',
    blackRank: info.blackRank || '',
    whiteRank: info.whiteRank || '',
    result: info.result || '',
    date: info.date || '',
    boardWidth: width || 19,
    boardHeight: height || width || 19,
    komi: info.komi,
    summary: gametree.getRootProperty(tree, 'C', '') || '',
  }
}

export function readSgfAnalysisMetadata(filePath) {
  try {
    return extractSgfAnalysisMetadata(readFileSync(filePath, 'utf8'))
  } catch (err) {
    return null
  }
}

export function createAnalyzedGame(filePath, {stat = null} = {}) {
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

export function listAnalyzedGames(directory) {
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
