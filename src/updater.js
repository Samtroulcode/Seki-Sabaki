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

// Exposes parseVersion and compareVersions for use by tests and other modules.
exports.parseVersion = parseVersion
exports.compareVersions = compareVersions

// Exposes pure release-selection and asset-selection helpers for unit tests.
exports.isSekiRelease = isSekiRelease
exports.getEligibleReleases = getEligibleReleases
exports.selectLatestRelease = selectLatestRelease
exports.selectPlatformDownloadUrl = selectPlatformDownloadUrl

// --- Pure release selection helpers ---

/**
 * Determines if a GitHub release belongs to the Seki project.
 * A release is considered Seki if:
 *   - Its tag_name starts with 'v' followed by a valid SemVer
 *   - Its title starts with 'Seki '
 *   - At least one asset name contains 'seki-'
 * Drafts, malformed tags, and unrelated releases are excluded.
 */
function isSekiRelease(release) {
  if (!release || !release.tag_name) return false
  if (release.draft === true) return false

  let tag = release.tag_name
  // Tag must start with 'v' followed by SemVer pattern
  if (!/^v\d+\.\d+\.\d+/.test(tag)) return false
  // Title must start with 'Seki '
  if (!release.title || !release.title.startsWith('Seki ')) return false
  // Must have at least one asset, and some must include 'seki-' in the name
  if (!release.assets || release.assets.length === 0) return false
  return release.assets.some((a) => a.name && a.name.includes('seki-'))
}

/**
 * Extracts the SemVer string from a release tag (removes leading 'v').
 */
function getReleaseVersionStr(release) {
  let tag = release.tag_name
  if (tag.startsWith('v')) tag = tag.slice(1)
  return tag
}

/**
 * Checks if a version string represents a prerelease.
 * Returns true if the version has a non-empty prerelease segment.
 */
function isPrereleaseVersion(versionStr) {
  let parts = versionStr.split('-')
  return parts.length > 1 && parts[1].length > 0
}

/**
 * Filters a list of GitHub releases to those eligible for updates,
 * based on the currently installed version.
 *
 * If the current version is a prerelease, eligible releases include
 * both newer prereleases and stable releases.
 * If the current version is stable, only stable releases (no prerelease)
 * are eligible; prereleases are ignored.
 */
function getEligibleReleases(allReleases, currentVersion) {
  // Filter to Seki releases only
  let sekiReleases = allReleases.filter(isSekiRelease)

  if (sekiReleases.length === 0) return []

  // Parse current version to determine update channel
  let currentVer
  try {
    currentVer = parseVersion(currentVersion)
  } catch {
    // If we can't parse the current version, return all Seki releases
    return sekiReleases
  }

  let currentIsPrerelease =
    currentVer.prerelease.length > 0 || isPrereleaseVersion(currentVersion)

  return sekiReleases.filter((release) => {
    let releaseVerStr = getReleaseVersionStr(release)
    let releaseVer
    try {
      releaseVer = parseVersion(releaseVerStr)
    } catch {
      return false // malformed tag, ignore
    }

    // If current is stable, ignore prereleases
    if (!currentIsPrerelease && releaseVer.prerelease.length > 0) {
      return false
    }

    // If current is prerelease, allow prereleases and stable
    return true
  })
}

/**
 * Selects the highest SemVer release from a list of eligible releases.
 * Uses the existing compareVersions logic for precedence.
 * Returns null if the list is empty.
 */
function selectLatestRelease(eligibleReleases) {
  if (eligibleReleases.length === 0) return null

  let latest = eligibleReleases[0]
  let latestVer = getReleaseVersionStr(latest)

  for (let i = 1; i < eligibleReleases.length; i++) {
    let candidateVer = getReleaseVersionStr(eligibleReleases[i])
    let cmp = compareVersions(candidateVer, latestVer)
    if (cmp > 0) {
      latest = eligibleReleases[i]
      latestVer = candidateVer
    }
  }
  return latest
}

// --- Asset selection helpers ---

/**
 * Selects the direct download URL for the current platform from a release's assets.
 * Uses asset name matching rather than broad URL substring rules.
 *
 * Priority per platform:
 *   - Linux: AppImage (never Flatpak beta)
 *   - Windows: setup executable (not portable)
 *   - macOS: may be absent (product policy)
 *
 * Returns the browser_download_url string, or undefined if no matching artifact.
 */
function selectPlatformDownloadUrl(release, platform, arch) {
  if (!release || !release.assets) return undefined

  // macOS has no official public prebuilt artifact.
  if (platform === 'darwin') return undefined

  let needles = {
    linux: ['linux'],
    win32: ['win'],
  }[platform]

  if (!needles) return undefined

  let archAliases = {
    x64: ['x64', 'x86_64'],
    x86_64: ['x64', 'x86_64'],
    arm64: ['arm64', 'aarch64'],
    aarch64: ['arm64', 'aarch64'],
  }

  let archNeedles = arch ? archAliases[arch.toLowerCase()] : null

  let matchingAssets = release.assets.filter((a) => {
    if (!a.browser_download_url || !a.name) return false

    let nameLower = a.name.toLowerCase()

    // Match platform (case-insensitive)
    if (!needles.every((needle) => nameLower.includes(needle))) return false

    // Match architecture when requested (case-insensitive, with aliases)
    if (
      archNeedles &&
      !archNeedles.some((needle) => nameLower.includes(needle))
    ) {
      return false
    }

    return true
  })

  if (matchingAssets.length === 0) return undefined

  // Linux: prefer AppImage, never select Flatpak beta as the direct update.
  if (platform === 'linux') {
    let appimage = matchingAssets.find(
      (a) =>
        a.name.toLowerCase().includes('appimage') &&
        !a.name.toLowerCase().includes('flatpak'),
    )
    if (appimage) return appimage.browser_download_url

    return matchingAssets[0].browser_download_url
  }

  // Windows: prefer setup executable, never portable.
  if (platform === 'win32') {
    let setup = matchingAssets.find((a) =>
      a.name.toLowerCase().includes('setup'),
    )
    if (setup) return setup.browser_download_url

    return matchingAssets[0].browser_download_url
  }

  return undefined
}

// --- Main check function ---

/**
 * Checks GitHub for available Seki updates.
 *
 * Fetches the full releases list (excluding /releases/latest which ignores
 * prereleases) and applies the Seki release selection policy:
 *   - Only releases clearly belonging to Seki (title "Seki <tag>", assets with
 *     'seki-' namespace) are considered
 *   - Drafts, malformed tags, and unrelated releases are ignored
 *   - Prerelease-channel behavior depends on the currently installed version:
 *     * If running a prerelease (e.g. 0.2.0-alpha.5): newer prereleases and
 *       stable releases are eligible
 *     * If running stable: only stable releases are eligible; prereleases are
 *       ignored
 *   - Among eligible releases, the highest SemVer is selected using
 *     compareVersions (not creation order)
 *   - The selected release's actual html_url is returned as the release page
 *     URL
 *   - Platform-specific direct download URLs are selected via
 *     selectPlatformDownloadUrl
 *
 * @param {string} repo - GitHub repository in 'owner/name' format
 * @returns {Promise<Object>} - Information about the latest release
 */
exports.check = async function (repo) {
  let address = `https://api.github.com/repos/${repo}/releases?per_page=100`

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
  if (!Array.isArray(data)) throw new Error('No version information found.')

  let currentVersion = app.getVersion()

  // Filter to eligible Seki releases based on current version channel
  let eligible = getEligibleReleases(data, currentVersion)

  let latestRelease = selectLatestRelease(eligible)

  if (!latestRelease) {
    throw new Error('No version information found.')
  }

  let latestVersion = getReleaseVersionStr(latestRelease)
  let downloadUrl = selectPlatformDownloadUrl(
    latestRelease,
    os.platform(),
    os.arch(),
  )

  return {
    url:
      latestRelease.html_url ||
      `https://github.com/${repo}/releases/${latestRelease.tag_name}`,
    downloadUrl,
    latestVersion,
    hasUpdates: compareVersions(latestVersion, currentVersion) > 0,
  }
}
