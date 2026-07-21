const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('fs')
const {join} = require('path')
const {tmpdir} = require('os')
const {spawnSync} = require('child_process')

const root = join(__dirname, '..')
const analyzeSgfScript = join(
  root,
  'node_modules',
  'analyze-sgf',
  'src',
  'index.js',
)

if (!existsSync(analyzeSgfScript)) {
  throw new Error('Missing node_modules/analyze-sgf. Run npm install first.')
}

let directory = mkdtempSync(join(tmpdir(), 'seki-analyze-sgf-diagnostic-'))
let inputPath = join(directory, 'partie.json')
let outputPath = join(directory, 'partie.seki-readable.sgf')
let homePath = join(directory, 'home')

try {
  mkdirSync(homePath, {recursive: true})
  writeFileSync(inputPath, createFixtureJson())

  let result = spawnSync(
    process.execPath,
    [
      analyzeSgfScript,
      '-f',
      '-g',
      'commentStyle:"compact",language:"fr",annotationStyle:"classification",fileSuffix:".seki-readable",maxVariationsForEachMove:2,minWinrateDropForVariations:5',
      inputPath,
    ],
    {
      encoding: 'utf8',
      shell: false,
      env: {...process.env, HOME: homePath, USERPROFILE: homePath},
    },
  )

  if (result.status !== 0) {
    throw new Error(
      `analyze-sgf failed with code ${result.status}: ${result.stderr || result.stdout}`,
    )
  }

  if (!existsSync(outputPath)) {
    throw new Error(`Expected generated SGF was not created: ${outputPath}`)
  }

  let content = readFileSync(outputPath, 'utf8')
  for (let expected of [
    "Résumé de l'analyse",
    'Coup 1 - Noir',
    'Perte estimée',
    'Variations proposées',
  ]) {
    if (!content.includes(expected)) {
      throw new Error(
        `Generated SGF is missing readable French text: ${expected}`,
      )
    }
  }

  console.log(`analyze-sgf diagnostic passed: ${outputPath}`)
} finally {
  rmSync(directory, {recursive: true, force: true})
}

function createFixtureJson() {
  return [
    '(;GM[1]FF[4]CA[UTF-8]SZ[9]KM[7.5]PB[Noir]PW[Blanc];B[ee])',
    JSON.stringify({
      id: 'seki-diagnostic:0',
      isDuringSearch: false,
      turnNumber: 0,
      rootInfo: {winrate: 0.55, scoreLead: 1.5, visits: 12},
      moveInfos: [
        {
          move: 'E5',
          pv: ['E5', 'D5'],
          winrate: 0.55,
          scoreLead: 1.5,
          visits: 8,
        },
        {move: 'D5', pv: ['D5', 'E5'], winrate: 0.5, scoreLead: 0, visits: 4},
      ],
    }),
    JSON.stringify({
      id: 'seki-diagnostic:1',
      isDuringSearch: false,
      turnNumber: 1,
      rootInfo: {winrate: 0.52, scoreLead: 0.8, visits: 12},
      moveInfos: [
        {
          move: 'D5',
          pv: ['D5', 'E6'],
          winrate: 0.52,
          scoreLead: 0.8,
          visits: 7,
        },
        {
          move: 'E6',
          pv: ['E6', 'D5'],
          winrate: 0.48,
          scoreLead: -0.4,
          visits: 5,
        },
      ],
    }),
    '',
  ].join('\n')
}
