import assert from 'assert'

import {buildElectronArgs} from '../scripts/start.js'

const waylandEnv = {WAYLAND_DISPLAY: ':0'}

describe('buildElectronArgs', () => {
  it('adds the historical XWayland fallback on a plain Wayland dev launch', () => {
    assert.deepStrictEqual(
      buildElectronArgs({platform: 'linux', env: waylandEnv, userArgs: []}),
      ['.', '--ozone-platform=x11', '--disable-gpu'],
    )
  })

  it('preserves explicit native Wayland + GPU flags without fallbacks', () => {
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: waylandEnv,
        userArgs: ['--ozone-platform=wayland', '--enable-gpu'],
      }),
      ['.', '--ozone-platform=wayland', '--enable-gpu'],
    )
  })

  it('does not duplicate an explicit ozone-platform choice', () => {
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: waylandEnv,
        userArgs: ['--ozone-platform=x11'],
      }),
      ['.', '--ozone-platform=x11', '--disable-gpu'],
    )
  })

  it('adds the x11 fallback but no disable-gpu when --enable-gpu is explicit', () => {
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: waylandEnv,
        userArgs: ['--enable-gpu'],
      }),
      ['.', '--enable-gpu', '--ozone-platform=x11'],
    )
  })

  it('adds the x11 fallback but does not duplicate --disable-gpu', () => {
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: waylandEnv,
        userArgs: ['--disable-gpu'],
      }),
      ['.', '--disable-gpu', '--ozone-platform=x11'],
    )
  })

  it('adds no display/GPU defaults on Linux without WAYLAND_DISPLAY', () => {
    assert.deepStrictEqual(
      buildElectronArgs({platform: 'linux', env: {}, userArgs: []}),
      ['.'],
    )
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: {},
        userArgs: ['--ozone-platform=wayland'],
      }),
      ['.', '--ozone-platform=wayland'],
    )
  })

  it('preserves explicit native Wayland + disable-gpu without fallbacks', () => {
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: waylandEnv,
        userArgs: ['--ozone-platform=wayland', '--disable-gpu'],
      }),
      ['.', '--ozone-platform=wayland', '--disable-gpu'],
    )
  })

  it('adds no display/GPU defaults on non-Linux platforms', () => {
    for (const platform of ['darwin', 'win32']) {
      assert.deepStrictEqual(
        buildElectronArgs({platform, env: waylandEnv, userArgs: []}),
        ['.'],
      )
    }
  })

  it('forwards unrelated user arguments unchanged', () => {
    assert.deepStrictEqual(
      buildElectronArgs({
        platform: 'linux',
        env: waylandEnv,
        userArgs: ['--inspect=9229', '--no-sandbox', 'game.sgf'],
      }),
      [
        '.',
        '--inspect=9229',
        '--no-sandbox',
        'game.sgf',
        '--ozone-platform=x11',
        '--disable-gpu',
      ],
    )
  })
})
