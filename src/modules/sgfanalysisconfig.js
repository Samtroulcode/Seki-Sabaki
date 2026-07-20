const SUPPORTED_LANGUAGES = ['en', 'fr']
const COMMENT_STYLES = ['legacy', 'compact', 'detailed']
const ANNOTATION_STYLES = ['auto', 'legacy', 'classification', 'none']

export function createDefaultSgfAnalysisConfig() {
  return {
    analyzeSgfPath: 'analyze-sgf',
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
  }
}

export function normalizeSgfAnalysisConfig(config = {}) {
  let defaults = createDefaultSgfAnalysisConfig()

  return {
    ...defaults,
    ...pickKnownConfigKeys(config),
    maxVisits: normalizeInteger(config.maxVisits, defaults.maxVisits),
    komi: normalizeNumber(config.komi, defaults.komi),
    maxVariationsForEachMove: normalizeInteger(
      config.maxVariationsForEachMove,
      defaults.maxVariationsForEachMove,
    ),
    minWinrateDropForVariations: normalizeNumber(
      config.minWinrateDropForVariations,
      defaults.minWinrateDropForVariations,
    ),
  }
}

export function validateSgfAnalysisConfig(
  config = {},
  {fileExists = null, directoryExists = null} = {},
) {
  let normalized = normalizeSgfAnalysisConfig(config)
  let errors = []

  requireNonEmptyString(errors, normalized.analyzeSgfPath, {
    field: 'analyzeSgfPath',
    code: 'analyze-sgf-not-configured',
    message: 'analyze-sgf executable is not configured.',
  })
  requireNonEmptyString(errors, normalized.katagoPath, {
    field: 'katagoPath',
    code: 'katago-not-configured',
    message: 'KataGo executable is not configured.',
  })
  requireNonEmptyString(errors, normalized.katagoArguments, {
    field: 'katagoArguments',
    code: 'katago-arguments-missing',
    message: 'KataGo arguments are not configured.',
  })
  requireNonEmptyString(errors, normalized.outputDirectory, {
    field: 'outputDirectory',
    code: 'output-directory-not-configured',
    message: 'Analysis output directory is not configured.',
  })

  if (shouldValidateAnalyzeSgfPath(normalized.analyzeSgfPath)) {
    validateFileExists(errors, normalized.analyzeSgfPath, fileExists, {
      field: 'analyzeSgfPath',
      code: 'analyze-sgf-not-found',
      message: 'analyze-sgf executable was not found.',
    })
  }

  validateFileExists(errors, normalized.katagoPath, fileExists, {
    field: 'katagoPath',
    code: 'katago-not-found',
    message: 'KataGo executable was not found.',
  })

  validateBadJsonString(errors, normalized.katagoPath, 'katagoPath')
  validateBadJsonString(errors, normalized.katagoArguments, 'katagoArguments')
  validateBadJsonString(errors, normalized.rules, 'rules')

  if (
    typeof directoryExists === 'function' &&
    normalized.outputDirectory !== '' &&
    !directoryExists(normalized.outputDirectory)
  ) {
    errors.push({
      field: 'outputDirectory',
      code: 'output-directory-not-found',
      message: 'Analysis output directory was not found.',
    })
  }

  if (
    isInvalidIntegerInput(config, 'maxVisits') ||
    !Number.isInteger(normalized.maxVisits) ||
    normalized.maxVisits <= 0
  ) {
    errors.push({
      field: 'maxVisits',
      code: 'invalid-max-visits',
      message: 'Maximum visits must be a positive integer.',
    })
  }

  if (
    isInvalidNumberInput(config, 'komi') ||
    !Number.isFinite(normalized.komi)
  ) {
    errors.push({
      field: 'komi',
      code: 'invalid-komi',
      message: 'Komi must be a valid number.',
    })
  }

  if (!SUPPORTED_LANGUAGES.includes(normalized.language)) {
    errors.push({
      field: 'language',
      code: 'unsupported-language',
      message: 'Analysis comment language is not supported.',
    })
  }

  if (!COMMENT_STYLES.includes(normalized.commentStyle)) {
    errors.push({
      field: 'commentStyle',
      code: 'unsupported-comment-style',
      message: 'Analysis comment style is not supported.',
    })
  }

  if (!ANNOTATION_STYLES.includes(normalized.annotationStyle)) {
    errors.push({
      field: 'annotationStyle',
      code: 'unsupported-annotation-style',
      message: 'Analysis annotation style is not supported.',
    })
  }

  if (
    isInvalidIntegerInput(config, 'maxVariationsForEachMove') ||
    !Number.isInteger(normalized.maxVariationsForEachMove) ||
    normalized.maxVariationsForEachMove <= 0
  ) {
    errors.push({
      field: 'maxVariationsForEachMove',
      code: 'invalid-max-variations',
      message: 'Maximum variations must be a positive integer.',
    })
  }

  if (
    isInvalidNumberInput(config, 'minWinrateDropForVariations') ||
    !Number.isFinite(normalized.minWinrateDropForVariations) ||
    normalized.minWinrateDropForVariations < 0
  ) {
    errors.push({
      field: 'minWinrateDropForVariations',
      code: 'invalid-variation-threshold',
      message: 'Variation threshold must be a non-negative number.',
    })
  }

  return errors
}

export function buildAnalyzeSgfArguments({inputPath, config, fileSuffix}) {
  let normalized = normalizeSgfAnalysisConfig(config)
  let sgfOptions = {
    commentStyle: normalized.commentStyle,
    language: normalized.language,
    annotationStyle: normalized.annotationStyle,
    maxVariationsForEachMove: normalized.maxVariationsForEachMove,
    minWinrateDropForVariations: normalized.minWinrateDropForVariations,
  }

  if (fileSuffix != null) sgfOptions.fileSuffix = fileSuffix

  return [
    '-k',
    serializeAnalyzeSgfOptions({
      path: normalized.katagoPath,
      arguments: normalized.katagoArguments,
    }),
    '-a',
    serializeAnalyzeSgfOptions({
      rules: normalized.rules,
      komi: normalized.komi,
      maxVisits: normalized.maxVisits,
    }),
    '-g',
    serializeAnalyzeSgfOptions(sgfOptions),
    inputPath,
  ]
}

export function serializeAnalyzeSgfOptions(options) {
  return Object.entries(options)
    .filter(([, value]) => value != null)
    .map(([key, value]) => `${key}:${serializeAnalyzeSgfValue(value)}`)
    .join(',')
}

function serializeAnalyzeSgfValue(value) {
  if (typeof value === 'string') return quoteAnalyzeSgfString(value)
  if (Array.isArray(value)) {
    return `[${value.map(serializeAnalyzeSgfValue).join(',')}]`
  }
  return String(value)
}

function quoteAnalyzeSgfString(value) {
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`

  throw new TypeError('Cannot serialize strings containing both quote types.')
}

function pickKnownConfigKeys(config) {
  let result = {}

  for (let key of Object.keys(createDefaultSgfAnalysisConfig())) {
    if (key in config) result[key] = config[key]
  }

  return result
}

function normalizeInteger(value, fallback) {
  let number = Number(value)
  return Number.isInteger(number) ? number : fallback
}

function normalizeNumber(value, fallback) {
  let number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function isInvalidIntegerInput(config, key) {
  if (!(key in config)) return false

  let number = Number(config[key])
  return config[key] === '' || !Number.isInteger(number)
}

function isInvalidNumberInput(config, key) {
  if (!(key in config)) return false

  let number = Number(config[key])
  return config[key] === '' || !Number.isFinite(number)
}

function validateFileExists(errors, path, fileExists, error) {
  if (typeof fileExists !== 'function' || path === '') return
  if (fileExists(path)) return

  errors.push(error)
}

function validateBadJsonString(errors, value, field) {
  if (typeof value !== 'string') return
  if (!value.includes("'") || !value.includes('"')) return

  errors.push({
    field,
    code: 'unsupported-option-quotes',
    message: 'Analysis option contains unsupported quote characters.',
  })
}

function shouldValidateAnalyzeSgfPath(path) {
  return path !== createDefaultSgfAnalysisConfig().analyzeSgfPath
}

function requireNonEmptyString(errors, value, error) {
  if (typeof value === 'string' && value.trim() !== '') return

  errors.push(error)
}
