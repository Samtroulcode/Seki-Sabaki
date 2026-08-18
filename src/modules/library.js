export async function getLibraryConfig() {
  return window.sabaki.library.getConfig()
}

export async function chooseLibraryRoot() {
  return window.sabaki.library.chooseRoot()
}

export async function listLibraryEntries(relativePath = '') {
  return window.sabaki.library.list(relativePath)
}

export async function openLibraryFile(relativePath) {
  return window.sabaki.library.open(relativePath)
}

export async function listBuiltinLibraryEntries(relativePath = '') {
  return window.sabaki.library.listBuiltin(relativePath)
}

export async function openBuiltinLibraryFile(relativePath) {
  return window.sabaki.library.openBuiltin(relativePath)
}

export async function getBuiltinCollectionMetadata(relativePath) {
  return window.sabaki.library.getBuiltinCollectionMetadata(relativePath)
}

export async function countLibraryProblems(source, relativePath = '') {
  return window.sabaki.library.countProblems(source, relativePath)
}

export async function saveLibraryFile(relativePath, content, options = {}) {
  return window.sabaki.library.saveFile(relativePath, content, options)
}

export async function createLibraryDirectory(relativePath) {
  return window.sabaki.library.createDirectory(relativePath)
}
