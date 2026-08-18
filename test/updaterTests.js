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
