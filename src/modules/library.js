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
