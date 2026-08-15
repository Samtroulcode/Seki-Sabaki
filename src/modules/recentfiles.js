import {parseSgfPreview} from './sgfpreview.js'

export async function listRecentFiles() {
  let entries = await window.sabaki.recentFiles.list()
  if (!Array.isArray(entries)) return []

  return entries.map((entry) => ({
    ...entry,
    preview: parseSgfPreview(entry.previewContent),
  }))
}

export async function addRecentFile(filePath) {
  if (typeof filePath !== 'string' || filePath === '') return []
  try {
    return await window.sabaki.recentFiles.add(filePath)
  } catch (err) {
    return []
  }
}

export async function openRecentFile(id) {
  return window.sabaki.recentFiles.open(id)
}
