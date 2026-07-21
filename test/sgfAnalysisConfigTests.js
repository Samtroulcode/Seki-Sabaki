import assert from 'assert'

import {
  buildAnalyzeSgfArguments,
  buildKatagoArguments,
  createDefaultSgfAnalysisConfig,
  normalizeSgfAnalysisConfig,
  serializeAnalyzeSgfOptions,
  validateSgfAnalysisConfig,
} from '../src/modules/sgfanalysisconfig.js'

function validConfig(overrides = {}) {
  return {
    ...createDefaultSgfAnalysisConfig(),
    analyzeSgfPath: '/usr/local/bin/analyze-sgf',
    katagoPath: '/usr/local/bin/katago',
    katagoModelPath: '/models/model.bin.gz',
    katagoConfigPath: '/configs/analysis.cfg',
    outputDirectory: '/analysis',
    ...overrides,
  }
}

describe('SGF analysis config', () => {
  it('defines Seki defaults for analyze-sgf integration', () => {
    assert.deepStrictEqual(createDefaultSgfAnalysisConfig(), {
      analyzeSgfPath: 'analyze-sgf',
      analyzeSgfStatus: 'path',
      analyzeSgfArgs: [],
      katagoPath: '',
      katagoModelPath: '',
      katagoConfigPath: '',
      katagoShellQuoting: process.platform === 'win32' ? 'cmd' : 'posix',
      katagoArguments: 'analysis',
      outputDirectory: '',
      maxVisits: 1600,
      rules: 'tromp-taylor',
      komi: 7.5,
      commentStyle: 'compact',
      language: 'fr',
      annotationStyle: 'auto',
      maxVariationsForEachMove: 10,
      minWinrateDropForVariations: 5,
    })
  })

  it('normalizes numeric fields and ignores unknown keys', () => {
    assert.deepStrictEqual(
      normalizeSgfAnalysisConfig({maxVisits: '3200', komi: '6.5', extra: true}),
      {
        ...createDefaultSgfAnalysisConfig(),
        maxVisits: 3200,
        komi: 6.5,
      },
    )
  })

  it('validates required paths and option domains', () => {
    let errors = validateSgfAnalysisConfig({
      maxVisits: 'abc',
      komi: 'abc',
      language: 'ko',
      commentStyle: 'unknown',
      annotationStyle: 'bad',
      maxVariationsForEachMove: -1,
      minWinrateDropForVariations: 'bad',
    })

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      [
        'katago-not-configured',
        'katago-model-not-configured',
        'katago-config-not-configured',
        'output-directory-not-configured',
        'invalid-max-visits',
        'invalid-komi',
        'unsupported-language',
        'unsupported-comment-style',
        'unsupported-annotation-style',
        'invalid-max-variations',
        'invalid-variation-threshold',
      ],
    )
  })

  it('validates filesystem-backed paths when checkers are provided', () => {
    let errors = validateSgfAnalysisConfig(validConfig(), {
      fileExists: () => false,
      directoryExists: (path) => path !== '/analysis',
    })

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      [
        'analyze-sgf-not-found',
        'katago-not-found',
        'katago-model-not-found',
        'katago-config-not-found',
        'output-directory-not-found',
      ],
    )
  })

  it('allows PATH lookup for the default analyze-sgf executable', () => {
    let errors = validateSgfAnalysisConfig(
      validConfig({analyzeSgfPath: 'analyze-sgf'}),
      {
        fileExists: () => false,
        directoryExists: () => true,
      },
    )

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      ['katago-not-found', 'katago-model-not-found', 'katago-config-not-found'],
    )
  })

  it('validates custom analyze-sgf executable names', () => {
    let errors = validateSgfAnalysisConfig(
      validConfig({analyzeSgfPath: 'missing-analyze-sgf'}),
      {
        fileExists: (path) => path !== 'missing-analyze-sgf',
        directoryExists: () => true,
      },
    )

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      ['analyze-sgf-not-found'],
    )
  })

  it('rejects option strings that cannot be represented for analyze-sgf', () => {
    let errors = validateSgfAnalysisConfig(
      validConfig({rules: `tromp"taylor's`}),
    )

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      ['unsupported-option-quotes'],
    )
  })

  it('generates KataGo analysis arguments from model and config paths', () => {
    assert.strictEqual(
      buildKatagoArguments({
        katagoModelPath: '/models/model path.bin.gz',
        katagoConfigPath: '/configs/analysis.cfg',
      }),
      "analysis -model '/models/model path.bin.gz' -config '/configs/analysis.cfg'",
    )
  })

  it('rejects shell-active characters in generated KataGo path fields', () => {
    let errors = validateSgfAnalysisConfig(
      validConfig({katagoModelPath: '/models/$(touch pwn).bin.gz'}),
    )

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      ['unsupported-katago-path-characters'],
    )
  })

  it('rejects backticks, percents, and command separators in KataGo paths', () => {
    for (let katagoModelPath of [
      '/models/`touch pwn`.bin.gz',
      '/models/%TEMP%.bin.gz',
      "/models/model's.bin.gz",
      '/models/model&touch-pwn.bin.gz',
      '/models/model;touch-pwn.bin.gz',
      '/models/model#comment.bin.gz',
      '/models/trailing-slash\\',
      `/models/model
.bin.gz`,
    ]) {
      assert.deepStrictEqual(
        validateSgfAnalysisConfig(validConfig({katagoModelPath})).map(
          (error) => error.code,
        ),
        ['unsupported-katago-path-characters'],
      )
    }
  })

  it('serializes options in analyze-sgf bad-json format', () => {
    assert.strictEqual(
      serializeAnalyzeSgfOptions({
        commentStyle: 'compact',
        language: 'fr',
        maxVisits: 1600,
        analyzeTurns: [0, 5],
      }),
      'commentStyle:"compact",language:"fr",maxVisits:1600,analyzeTurns:[0,5]',
    )
  })

  it('serializes strings with embedded double quotes for analyze-sgf', () => {
    assert.strictEqual(
      serializeAnalyzeSgfOptions({
        arguments: 'analysis -model "model path.bin.gz"',
      }),
      `arguments:'analysis -model "model path.bin.gz"'`,
    )
  })

  it('does not serialize strings unsupported by analyze-sgf bad-json', () => {
    assert.throws(
      () =>
        serializeAnalyzeSgfOptions({arguments: `analysis "model's.bin.gz"`}),
      /Cannot serialize/,
    )
    assert.throws(
      () =>
        buildAnalyzeSgfArguments({
          inputPath: '/tmp/source.sgf',
          fileSuffix: `.partial"'`,
          config: validConfig(),
        }),
      /Cannot serialize/,
    )
  })

  it('builds analyze-sgf arguments without shell concatenation', () => {
    assert.deepStrictEqual(
      buildAnalyzeSgfArguments({
        inputPath: '/tmp/source.sgf',
        fileSuffix: '.partial',
        config: validConfig({maxVisits: 800, language: 'en'}),
      }),
      [
        '-k',
        `path:"'/usr/local/bin/katago'",arguments:"analysis -model '/models/model.bin.gz' -config '/configs/analysis.cfg'"`,
        '-a',
        'rules:"tromp-taylor",komi:7.5,maxVisits:800',
        '-g',
        'commentStyle:"compact",language:"en",annotationStyle:"auto",maxVariationsForEachMove:10,minWinrateDropForVariations:5,fileSuffix:".partial"',
        '/tmp/source.sgf',
      ],
    )
  })

  it('quotes KataGo executable, model, and config paths with spaces on POSIX', () => {
    assert.strictEqual(
      buildAnalyzeSgfArguments({
        inputPath: '/tmp/source.sgf',
        fileSuffix: '.partial',
        config: validConfig({
          katagoPath: '/tmp/KataGo/katago path',
          katagoModelPath: '/tmp/KataGo/model file.bin.gz',
          katagoConfigPath: '/tmp/KataGo/analysis config.cfg',
        }),
      })[1],
      `path:"'/tmp/KataGo/katago path'",arguments:"analysis -model '/tmp/KataGo/model file.bin.gz' -config '/tmp/KataGo/analysis config.cfg'"`,
    )
  })

  it('supports unquoted cmd KataGo arguments for paths without whitespace', () => {
    assert.deepStrictEqual(
      buildAnalyzeSgfArguments({
        inputPath: 'C:/games/source.sgf',
        config: validConfig({
          katagoShellQuoting: 'cmd',
          katagoPath: 'C:/KataGo/katago.exe',
          katagoModelPath: 'C:/KataGo/model.bin.gz',
          katagoConfigPath: 'C:/KataGo/analysis.cfg',
        }),
      }).slice(0, 2),
      [
        '-k',
        'path:"C:/KataGo/katago.exe",arguments:"analysis -model C:/KataGo/model.bin.gz -config C:/KataGo/analysis.cfg"',
      ],
    )

    assert.deepStrictEqual(
      validateSgfAnalysisConfig(
        validConfig({
          katagoShellQuoting: 'cmd',
          katagoPath: 'C:/Program Files/katago.exe',
        }),
      ).map((error) => error.code),
      ['unsupported-katago-path-whitespace'],
    )
  })
})
