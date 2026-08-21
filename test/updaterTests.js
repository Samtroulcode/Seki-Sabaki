const assert = require('assert')

const {parseVersion, compareVersions} = require('../src/updater')

describe('parseVersion', () => {
  it('parses stable versions', () => {
    assert.deepStrictEqual(parseVersion('0.1.0'), {
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: [],
      build: [],
    })
  })

  it('parses Seki-style alpha.N prereleases', () => {
    assert.deepStrictEqual(parseVersion('0.1.0-alpha.2'), {
      major: 0,
      minor: 1,
      patch: 0,
      prerelease: ['alpha', '2'],
      build: [],
    })
  })

  it('parses build metadata', () => {
    assert.deepStrictEqual(parseVersion('1.0.0+build.1'), {
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: [],
      build: ['build', '1'],
    })
  })

  it('parses combined prerelease and build metadata', () => {
    assert.deepStrictEqual(parseVersion('1.0.0-alpha.1+build.5'), {
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: ['alpha', '1'],
      build: ['build', '5'],
    })
  })

  it('rejects malformed versions', () => {
    for (let version of [
      '',
      'abc',
      '1.0',
      '1.0.0.1',
      '1.0.0-',
      '1.0.0+',
      '1.0.0-alpha..1',
      '0.1.NaN',
      '0.1.0-alpha.1+',
    ]) {
      assert.throws(() => parseVersion(version), /Invalid SemVer version/)
    }
  })
})

describe('compareVersions', () => {
  it('orders stable versions by major, minor, patch', () => {
    assert.strictEqual(compareVersions('0.1.9', '0.2.0'), -1)
    assert.strictEqual(compareVersions('0.9.9', '1.0.0'), -1)
    assert.strictEqual(compareVersions('1.0.0', '1.0.1'), -1)
    assert.strictEqual(compareVersions('0.2.0', '0.1.9'), 1)
  })

  it('orders later prereleases after earlier ones', () => {
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.0-alpha.2'), -1)
    assert.strictEqual(compareVersions('0.1.0-alpha.2', '0.1.0-beta.1'), -1)
  })

  it('treats a stable version as newer than a prerelease of the same core', () => {
    assert.strictEqual(compareVersions('0.1.0-beta.1', '0.1.0'), -1)
    assert.strictEqual(compareVersions('0.1.0', '0.1.0-beta.1'), 1)
  })

  it('detects updates from current Seki-style alpha.N versions', () => {
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.0-alpha.2'), -1)
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.1'), -1)
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.0'), -1)
  })

  it('compares numeric prerelease identifiers numerically', () => {
    assert.strictEqual(compareVersions('0.1.0-alpha.2', '0.1.0-alpha.10'), -1)
  })

  it('gives numeric prerelease identifiers lower precedence than textual ones', () => {
    assert.strictEqual(compareVersions('1.0.0-1', '1.0.0-alpha'), -1)
    assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-1'), 1)
  })

  it('compares textual prerelease identifiers lexically', () => {
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.0-beta.1'), -1)
    assert.strictEqual(compareVersions('0.1.0-beta.1', '0.1.0-alpha.1'), 1)
  })

  it('prefers more prerelease identifiers when all compared are equal', () => {
    assert.strictEqual(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1)
    assert.strictEqual(compareVersions('1.0.0-alpha.1', '1.0.0-alpha'), 1)
  })

  it('ignores build metadata for precedence', () => {
    assert.strictEqual(compareVersions('1.0.0', '1.0.0+build.1'), 0)
    assert.strictEqual(compareVersions('1.0.0+build.1', '1.0.0'), 0)
    assert.strictEqual(
      compareVersions('1.0.0-alpha.1+build.5', '1.0.0-alpha.1'),
      0,
    )
  })

  it('treats equal versions as equal', () => {
    assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0)
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.0-alpha.1'), 0)
  })

  it('rejects malformed versions instead of producing NaN ordering', () => {
    assert.throws(() => compareVersions('0.1.NaN', '0.1.0'), /Invalid SemVer/)
    assert.throws(() => compareVersions('0.1.0', '0.1.NaN'), /Invalid SemVer/)
  })

  it('regression: current 0.1.0-alpha.1 is updated by latest 0.1.0', () => {
    assert.strictEqual(compareVersions('0.1.0-alpha.1', '0.1.0'), -1)
    assert.ok(compareVersions('0.1.0', '0.1.0-alpha.1') > 0)
  })
})

// --- Release selection tests ---

describe('release selection', () => {
  const {
    parseVersion,
    compareVersions,
    isSekiRelease,
    getEligibleReleases,
    selectLatestRelease,
  } = require('../src/updater')

  // Helper to create a mock release object
  function makeRelease(opts = {}) {
    return {
      tag_name: opts.tag_name || 'v0.1.0',
      title: opts.title || 'Seki v0.1.0',
      html_url:
        opts.html_url || 'https://github.com/owner/repo/releases/tag/v0.1.0',
      draft: opts.draft || false,
      assets: opts.assets || [],
    }
  }

  it('parses isSekiRelease correctly', () => {
    // Valid Seki release
    assert.strictEqual(
      isSekiRelease(
        makeRelease({
          tag_name: 'v0.1.0',
          title: 'Seki v0.1.0',
          assets: [{name: 'seki-v0.1.0'}],
        }),
      ),
      true,
    )

    // Tag without 'v' prefix
    assert.strictEqual(
      isSekiRelease(
        makeRelease({
          tag_name: '0.1.0',
          title: 'Seki v0.1.0',
          assets: [{name: 'seki-v0.1.0'}],
        }),
      ),
      false,
    )

    // Title not starting with 'Seki '
    assert.strictEqual(
      isSekiRelease(
        makeRelease({
          tag_name: 'v0.1.0',
          title: 'Other v0.1.0',
          assets: [{name: 'seki-v0.1.0'}],
        }),
      ),
      false,
    )

    // No seki- in assets
    assert.strictEqual(
      isSekiRelease(
        makeRelease({
          tag_name: 'v0.1.0',
          title: 'Seki v0.1.0',
          assets: [{name: 'other-v0.1.0'}],
        }),
      ),
      false,
    )

    // No assets
    assert.strictEqual(
      isSekiRelease(
        makeRelease({tag_name: 'v0.1.0', title: 'Seki v0.1.0', assets: []}),
      ),
      false,
    )
  })

  it('getEligibleReleases includes newer prereleases when current is alpha', () => {
    let allReleases = [
      makeRelease({
        tag_name: 'v0.2.0-alpha.6',
        title: 'Seki v0.2.0-alpha.6',
        assets: [{name: 'seki-v0.2.0-alpha.6'}],
      }),
      makeRelease({
        tag_name: 'v0.2.0',
        title: 'Seki v0.2.0',
        assets: [{name: 'seki-v0.2.0'}],
      }),
    ]
    let eligible = getEligibleReleases(allReleases, '0.2.0-alpha.5')
    assert.strictEqual(eligible.length, 2)
  })

  it('getEligibleReleases includes stable when current is alpha', () => {
    let allReleases = [
      makeRelease({
        tag_name: 'v0.2.0',
        title: 'Seki v0.2.0',
        assets: [{name: 'seki-v0.2.0'}],
      }),
    ]
    let eligible = getEligibleReleases(allReleases, '0.2.0-alpha.5')
    assert.strictEqual(eligible.length, 1)
    assert.strictEqual(eligible[0].tag_name, 'v0.2.0')
  })

  it('getEligibleReleases ignores prereleases when current is stable', () => {
    let allReleases = [
      makeRelease({
        tag_name: 'v0.2.1-alpha.1',
        title: 'Seki v0.2.1-alpha.1',
        assets: [{name: 'seki-v0.2.1-alpha.1'}],
      }),
      makeRelease({
        tag_name: 'v0.2.1',
        title: 'Seki v0.2.1',
        assets: [{name: 'seki-v0.2.1'}],
      }),
    ]
    let eligible = getEligibleReleases(allReleases, '0.2.0')
    assert.strictEqual(eligible.length, 1)
    assert.strictEqual(eligible[0].tag_name, 'v0.2.1')
  })

  it('selectLatestRelease uses SemVer precedence not order', () => {
    let releases = [
      makeRelease({
        tag_name: 'v0.2.0',
        title: 'Seki v0.2.0',
        assets: [{name: 'seki-v0.2.0'}],
      }),
      makeRelease({
        tag_name: 'v0.1.0',
        title: 'Seki v0.1.0',
        assets: [{name: 'seki-v0.1.0'}],
      }),
      makeRelease({
        tag_name: 'v0.3.0',
        title: 'Seki v0.3.0',
        assets: [{name: 'seki-v0.3.0'}],
      }),
    ]
    let latest = selectLatestRelease(releases)
    assert.strictEqual(latest.tag_name, 'v0.3.0')
  })

  it('selectLatestRelease ignores drafts', () => {
    let releases = [
      makeRelease({
        tag_name: 'v0.1.0',
        title: 'Seki v0.1.0',
        assets: [{name: 'seki-v0.1.0'}],
        draft: true,
      }),
      makeRelease({
        tag_name: 'v0.2.0',
        title: 'Seki v0.2.0',
        assets: [{name: 'seki-v0.2.0'}],
      }),
    ]
    let filtered = releases.filter(isSekiRelease)
    assert.strictEqual(filtered.length, 1)
    assert.strictEqual(filtered[0].tag_name, 'v0.2.0')
  })

  it('getEligibleReleases ignores malformed tags', () => {
    let allReleases = [
      makeRelease({
        tag_name: 'v0.1.0',
        title: 'Seki v0.1.0',
        assets: [{name: 'seki-v0.1.0'}],
      }),
      makeRelease({
        tag_name: 'not-a-version',
        title: 'Seki not-a-version',
        assets: [{name: 'seki-not-a-version'}],
      }),
      makeRelease({
        tag_name: 'v0.2.0',
        title: 'Seki v0.2.0',
        assets: [{name: 'seki-v0.2.0'}],
      }),
    ]
    let eligible = getEligibleReleases(allReleases, '0.1.0')
    assert.strictEqual(eligible.length, 2)
  })

  it('getEligibleReleases ignores unrelated upstream releases', () => {
    let allReleases = [
      makeRelease({
        tag_name: 'v0.60.0',
        title: 'Seki v0.60.0',
        assets: [{name: 'other-v0.60.0'}],
      }),
      makeRelease({
        tag_name: 'v0.2.0',
        title: 'Seki v0.2.0',
        assets: [{name: 'seki-v0.2.0'}],
      }),
    ]
    let eligible = getEligibleReleases(allReleases, '0.1.0')
    // v0.60.0 is filtered out because its assets don't include 'seki-'
    assert.strictEqual(eligible.length, 1)
    assert.strictEqual(eligible[0].tag_name, 'v0.2.0')
  })

  it('empty eligible list leads to no version information path', () => {
    let eligible = getEligibleReleases([], '0.1.0')
    assert.strictEqual(eligible.length, 0)
    assert.strictEqual(selectLatestRelease(eligible), null)
  })
})

// --- Asset selection tests ---

describe('asset selection', () => {
  const {selectPlatformDownloadUrl} = require('../src/updater')

  it('Linux selects AppImage when AppImage and Flatpak beta both exist', () => {
    let release = {
      assets: [
        {
          name: 'seki-v0.2.0-linux-x86_64.AppImage',
          browser_download_url: 'http://example.com/appimage',
        },
        {
          name: 'seki-v0.2.0-linux-x86_64-beta.flatpak',
          browser_download_url: 'http://example.com/flatpak',
        },
      ],
    }
    let url = selectPlatformDownloadUrl(release, 'linux', 'x64')
    assert.strictEqual(url, 'http://example.com/appimage')
  })

  it('Linux does not select the Flatpak beta', () => {
    let release = {
      assets: [
        {
          name: 'seki-v0.2.0-linux-x86_64-beta.flatpak',
          browser_download_url: 'http://example.com/flatpak',
        },
        {
          name: 'seki-v0.2.0-linux-x86_64.AppImage',
          browser_download_url: 'http://example.com/appimage',
        },
      ],
    }
    let url = selectPlatformDownloadUrl(release, 'linux', 'x64')
    assert.strictEqual(url, 'http://example.com/appimage')
  })

  it('Windows selects -setup.exe, not -portable.exe', () => {
    let release = {
      assets: [
        {
          name: 'seki-v0.2.0-windows-x64-setup.exe',
          browser_download_url: 'http://example.com/setup',
        },
        {
          name: 'seki-v0.2.0-windows-x64-portable.exe',
          browser_download_url: 'http://example.com/portable',
        },
      ],
    }
    let url = selectPlatformDownloadUrl(release, 'win32', 'x64')
    assert.strictEqual(url, 'http://example.com/setup')
  })

  it('Wrong architecture is not selected', () => {
    let release = {
      assets: [
        {
          name: 'seki-v0.2.0-linux-x86_64.AppImage',
          browser_download_url: 'http://example.com/appimage',
        },
        {
          name: 'seki-v0.2.0-linux-aarch64.AppImage',
          browser_download_url: 'http://example.com/arm',
        },
      ],
    }
    let url = selectPlatformDownloadUrl(release, 'linux', 'x64')
    assert.strictEqual(url, 'http://example.com/appimage')
  })

  it('macOS currently returns no direct public artifact', () => {
    let release = {
      assets: [
        {
          name: 'seki-v0.2.0-darwin.yml',
          browser_download_url: 'http://example.com',
        },
      ],
    }
    let url = selectPlatformDownloadUrl(release, 'darwin', 'arm64')
    assert.strictEqual(url, undefined)
  })
})
