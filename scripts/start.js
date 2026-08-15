const {spawn} = require('child_process')

let args = ['.']
let isWayland = process.platform === 'linux' && process.env.WAYLAND_DISPLAY

if (isWayland) {
  args.push('--ozone-platform=x11', '--disable-gpu')
}

let child = spawn('electron', args, {stdio: 'inherit', shell: false})

child.on('exit', (code, signal) => {
  if (signal != null) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
