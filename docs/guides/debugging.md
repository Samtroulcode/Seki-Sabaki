# Debugging

Seki is a desktop application built with web technologies, HTML, CSS and
JavaScript, using [Electron](http://electron.atom.io). Since Electron is built
on Chrome, it ships with the exact same developer tools Chrome has. To activate
the developer tools in Seki, follow these steps:

1. Close Seki if necessary
2. First, determine where Seki saves its settings:
   - `%APPDATA%\Seki` on Windows
   - `$XDG_CONFIG_HOME/Seki` or `~/.config/Seki` on Linux
   - `~/Library/Application Support/Seki` on macOS
   - `<portable executable directory>\Seki` for Windows portable builds
3. Open `settings.json` and search for the key `debug.dev_tools`
4. Set the value to `true` and save `settings.json`
5. When you start Seki, it has an extra main menu item named 'Developer'
6. Click on 'Toggle Developer Tools' in the menu
