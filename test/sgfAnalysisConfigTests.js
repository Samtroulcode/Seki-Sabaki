import assert from 'assert'

import {
  buildAnalyzeSgfArguments,
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
    katagoArguments: 'analysis -model model.bin.gz -config analysis.cfg',
    outputDirectory: '/analysis',
    ...overrides,
  }
}

describe('SGF analysis config', () => {
  it('defines Seki defaults for analyze-sgf integration', () => {
    assert.deepStrictEqual(createDefaultSgfAnalysisConfig(), {
      analyzeSgfPath: 'analyze-sgf',
      analyzeSgfStatus: 'path',
      katagoPath: '',
      katagoArguments: '',
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
        'katago-arguments-missing',
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
      ['katago-not-found'],
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
      validConfig({katagoArguments: `analysis -model "model's.bin.gz"`}),
    )

    assert.deepStrictEqual(
      errors.map((error) => error.code),
      ['unsupported-option-quotes'],
    )
  })

  it('serializes options in analyze-sgf bad-json format', () => {
    assert.strictEqual(
      serializeAnalyzeSgfOptions({
        commentStyle: 'compact',
        language: 'fr',
        maxVisits: 1600,
        analyzeTurns: [0, 5],
      }),
      "commentStyle:'compact',language:'fr',maxVisits:1600,analyzeTurns:[0,5]",
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
        "path:'/usr/local/bin/katago',arguments:'analysis -model model.bin.gz -config analysis.cfg'",
        '-a',
        "rules:'tromp-taylor',komi:7.5,maxVisits:800",
        '-g',
        "commentStyle:'compact',language:'en',annotationStyle:'auto',maxVariationsForEachMove:10,minWinrateDropForVariations:5,fileSuffix:'.partial'",
        '/tmp/source.sgf',
      ],
    )
  })
})
