const {copyFileSync, existsSync, mkdirSync, readdirSync, rmSync} = require('fs')
const {join, resolve} = require('path')
const {execFileSync} = require('child_process')

const root = resolve(__dirname, '..')
const packagePath = join(root, 'node_modules', 'analyze-sgf', 'package.json')
const analyzeSgfDirectory = join(root, 'node_modules', 'analyze-sgf')
const outDir = join(root, 'build', 'analyze-sgf')
const tmpDir = join(root, 'build', 'analyze-sgf-pkg')
// pkg is a project devDependency; run its CLI entry directly through Node so
// packaging works on Windows without the platform-specific npx shim.
const pkgPackageJson = require(
  join(root, 'node_modules', 'pkg', 'package.json'),
)
const pkgCliPath = join(root, 'node_modules', 'pkg', pkgPackageJson.bin.pkg)
const forkFeatureFiles = [
  'src/comment-renderer.js',
  'src/comment-i18n.js',
  'src/move-classifier.js',
  'src/game-summary.js',
]

const targets = [
  {pkg: 'node18-linux-x64', resource: 'linux-x64', executable: 'analyze-sgf'},
  {
    pkg: 'node18-linux-arm64',
    resource: 'linux-arm64',
    executable: 'analyze-sgf',
  },
  {pkg: 'node18-macos-x64', resource: 'darwin-x64', executable: 'analyze-sgf'},
  {
    pkg: 'node18-macos-arm64',
    resource: 'darwin-arm64',
    executable: 'analyze-sgf',
  },
  {
    pkg: 'node18-win-x64',
    resource: 'win32-x64',
    executable: 'analyze-sgf.exe',
  },
  {
    pkg: 'node18-win-arm64',
    resource: 'win32-arm64',
    executable: 'analyze-sgf.exe',
  },
]

// Resolve requested resource target names (e.g. 'win32-x64') against the
// target mapping. Defaults to the current host when nothing is requested.
function resolveTargets(requested) {
  if (requested != null && !Array.isArray(requested)) {
    throw new Error(
      `Expected an array of analyze-sgf resource targets, got ${typeof requested}.`,
    )
  }

  let names =
    requested == null || requested.length === 0
      ? [`${process.platform}-${process.arch}`]
      : requested

  let unknown = names.filter(
    (name) => !targets.some((target) => target.resource === name),
  )

  if (unknown.length > 0) {
    throw new Error(
      `Unknown analyze-sgf resource target${unknown.length > 1 ? 's' : ''}: ${unknown.join(
        ', ',
      )}. Supported targets: ${targets.map((target) => target.resource).join(', ')}.`,
    )
  }

  return targets.filter((target) => names.includes(target.resource))
}

function buildPkgCommand(selectedTargets) {
  let selected = selectedTargets ?? targets

  return [
    pkgCliPath,
    packagePath,
    '--targets',
    selected.map((target) => target.pkg).join(','),
    '--out-path',
    tmpDir,
  ]
}

function prepareAnalyzeSgfBinaries(requestedTargets) {
  let selectedTargets = resolveTargets(requestedTargets)
  assertCompatibleAnalyzeSgfPackage()

  rmSync(tmpDir, {recursive: true, force: true})
  rmSync(outDir, {recursive: true, force: true})
  mkdirSync(tmpDir, {recursive: true})
  mkdirSync(outDir, {recursive: true})

  execFileSync(process.execPath, buildPkgCommand(selectedTargets), {
    stdio: 'inherit',
  })

  let generatedFiles = readdirSync(tmpDir)

  for (let target of selectedTargets) {
    let generated = generatedFiles.find((file) =>
      matchesPkgOutput(file, target),
    )
    if (generated == null) {
      throw new Error(
        `pkg did not generate an analyze-sgf binary for ${target.pkg}.`,
      )
    }

    let resourceDir = join(outDir, target.resource)
    mkdirSync(resourceDir, {recursive: true})
    copyFileSync(join(tmpDir, generated), join(resourceDir, target.executable))
  }

  rmSync(tmpDir, {recursive: true, force: true})
}

function assertCompatibleAnalyzeSgfPackage() {
  if (!existsSync(packagePath)) {
    throw new Error('Missing node_modules/analyze-sgf. Run npm install first.')
  }

  let missing = forkFeatureFiles.filter(
    (file) => !existsSync(join(analyzeSgfDirectory, file)),
  )

  if (missing.length > 0) {
    throw new Error(
      `Installed analyze-sgf package is missing readable-comment files: ${missing.join(
        ', ',
      )}.`,
    )
  }
}

function matchesPkgOutput(file, target) {
  let normalized = file.toLowerCase()
  let [, runtimePlatform, runtimeArch] = target.pkg.split('-')
  let platform = runtimePlatform === 'macos' ? 'macos' : runtimePlatform

  return normalized.includes(platform) && normalized.includes(runtimeArch)
}

if (require.main === module) prepareAnalyzeSgfBinaries(process.argv.slice(2))

module.exports = {
  analyzeSgfDirectory,
  assertCompatibleAnalyzeSgfPackage,
  buildPkgCommand,
  forkFeatureFiles,
  matchesPkgOutput,
  packagePath,
  pkgCliPath,
  prepareAnalyzeSgfBinaries,
  resolveTargets,
  targets,
}
