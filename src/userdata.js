const fs = require('fs')
const path = require('path')

const PROFILE_DIRECTORY_NAME = 'Seki'

function resolveUserDataDirectory({app, env = process.env}) {
  if (app.commandLine.hasSwitch('user-data-dir')) {
    return app.getPath('userData')
  }

  if (env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(env.PORTABLE_EXECUTABLE_DIR, PROFILE_DIRECTORY_NAME)
  }

  return path.join(app.getPath('appData'), PROFILE_DIRECTORY_NAME)
}

function configureUserDataDirectory(options) {
  let {app} = options
  let userDataDirectory = resolveUserDataDirectory(options)

  fs.mkdirSync(userDataDirectory, {recursive: true})
  app.setPath('userData', userDataDirectory)
  app.setPath('sessionData', userDataDirectory)

  return userDataDirectory
}

module.exports = {
  PROFILE_DIRECTORY_NAME,
  resolveUserDataDirectory,
  configureUserDataDirectory,
}
