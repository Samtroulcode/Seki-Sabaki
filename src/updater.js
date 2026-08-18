const os = require('os')
const {app, net} = require('electron')

// Parses a SemVer version string (MAJOR.MINOR.PATCH[-prerelease][+build])
// into its components. Throws on versions that are not valid supported
// SemVer so invalid release tags fail explicitly instead of producing
// NaN-based ordering.
function parseVersion(version) {
  let match =
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version,
    )

  if (!match) throw new Error(`Invalid SemVer version: ${version}`)

  return {
    major: +match[1],
    minor: +match[2],
    patch: +match[3],
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
  }
}

// Compares two SemVer version strings per SemVer precedence rules.
// Returns -1, 0, or 1.
function compareVersions(a, b) {
  let va = parseVersion(a)
  let vb = parseVersion(b)

  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1

  // A stable version is newer than a prerelease with the same core version.
  if (!va.prerelease.length && !vb.prerelease.length) return 0
  if (!va.prerelease.length) return 1
  if (!vb.prerelease.length) return -1

  // Compare prerelease identifiers left-to-right.
  let length = Math.max(va.prerelease.length, vb.prerelease.length)
  for (let i = 0; i < length; i++) {
    let aId = va.prerelease[i]
    let bId = vb.prerelease[i]

    // When all compared identifiers are equal, the version with more
    // identifiers has higher precedence.
    if (aId === undefined) return -1
    if (bId === undefined) return 1

    let aNumeric = /^\d+$/.test(aId)
    let bNumeric = /^\d+$/.test(bId)

    if (aNumeric && bNumeric) {
      let an = +aId
      let bn = +bId
      if (an !== bn) return an < bn ? -1 : 1
    } else if (aNumeric !== bNumeric) {
      // Numeric identifiers have lower precedence than non-numeric ones.
      return aNumeric ? -1 : 1
    } else if (aId !== bId) {
      return aId < bId ? -1 : 1
    }
  }

  // Build metadata does not affect precedence.
  return 0
}

exports.parseVersion = parseVersion
exports.compareVersions = compareVersions

exports.check = async function (repo) {
  let address = `https://api.github.com/repos/${repo}/releases/latest`

  let response = await new Promise((resolve, reject) => {
    let request = net.request(address)

    request
      .on('response', (response) => {
        let content = ''

        response
          .on('data', (chunk) => {
            content += chunk
          })
          .on('end', () => {
            resolve(content)
          })
      })
      .on('error', reject)

    request.end()
  })

  let data = JSON.parse(response)
  if (!('tag_name' in data) || !('assets' in data))
    throw new Error('No version information found.')

  let latestVersion = data.tag_name.slice(1)
  let currentVersion = app.getVersion()
  let downloadUrls = data.assets.map((x) => x.browser_download_url)

  let arch = os.arch()
  let needles = {
    linux: ['linux'],
    win32: ['win', 'setup'],
    darwin: ['mac'],
  }[os.platform()]

  return {
    url: `https://github.com/${repo}/releases/latest`,
    downloadUrl:
      arch &&
      needles &&
      downloadUrls.find(
        (url) =>
          url.includes(arch) && needles.every((needle) => url.includes(needle)),
      ),
    latestVersion,
    hasUpdates: compareVersions(latestVersion, currentVersion) > 0,
  }
}
