const {spawn} = require('child_process')

// Builds the Electron argv for the development launcher. On Linux with
// WAYLAND_DISPLAY present, a plain `npm start` keeps the historical XWayland
// fallback (--ozone-platform=x11 --disable-gpu) that fixed first-paint hangs.
// Explicit user flags always win: an ozone-platform choice suppresses the x11
// fallback, and any GPU choice suppresses the disable-gpu fallback.
function buildElectronArgs({platform, env, userArgs}) {
  let args = ['.', ...userArgs]

  let isWayland = platform === 'linux' && !!env.WAYLAND_DISPLAY

  if (
    isWayland &&
    !userArgs.some((arg) => arg.startsWith('--ozone-platform='))
  ) {
    args.push('--ozone-platform=x11')
  }

  if (
    isWayland &&
    !userArgs.includes('--disable-gpu') &&
    !userArgs.includes('--enable-gpu')
  ) {
    args.push('--disable-gpu')
  }

  return args
}

module.exports = {buildElectronArgs}

if (require.main === module) {
  let args = buildElectronArgs({
    platform: process.platform,
    env: process.env,
    userArgs: process.argv.slice(2),
  })

  let child = spawn('electron', args, {stdio: 'inherit', shell: false})

  child.on('exit', (code, signal) => {
    if (signal != null) process.kill(process.pid, signal)
    else process.exit(code ?? 1)
  })
}
