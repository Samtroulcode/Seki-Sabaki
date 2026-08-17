const SOURCES = ['builtin', 'user']

// Builds the canonical progress key used by the main-process store. Mirrors
// `normalizeProblemKey` in `src/tsumegoprogress.js` so the renderer can update
// its local state optimistically before the IPC round-trip. Returns `null` for
// an invalid source or path.
export function buildProgressKey(source, relativePath) {
  if (typeof source !== 'string' || !SOURCES.includes(source)) return null
  if (typeof relativePath !== 'string' || relativePath === '') return null
  if (relativePath.includes('\0')) return null

  let segments = relativePath.split(/[\\/]/)
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    return null
  }

  let normalized = segments.join('/')
  if (/^[a-zA-Z]:/.test(normalized)) return null
  return `${source}:${normalized}`
}

export async function getTsumegoProgress() {
  return window.sabaki.tsumegoProgress.getAll()
}

export async function markTsumegoProblemCompleted(source, relativePath) {
  return window.sabaki.tsumegoProgress.markCompleted(source, relativePath)
}
