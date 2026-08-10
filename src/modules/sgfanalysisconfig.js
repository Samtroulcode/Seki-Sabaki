const SUPPORTED_LANGUAGES = ['en', 'fr']
const COMMENT_STYLES = ['legacy', 'compact', 'detailed']
const ANNOTATION_STYLES = ['auto', 'legacy', 'classification', 'none']

function createDefaultSgfAnalysisConfig() {
  return {
    analyzeSgfPath: 'analyze-sgf',
    analyzeSgfStatus: 'path',
    analyzeSgfArgs: [],
    katagoPath: '',
    katagoModelPath: '',
    katagoConfigPath: '',
    katagoShellQuoting: process.platform === 'win32' ? 'cmd' : 'posix',
    katagoArguments: 'analysis',
    outputDirectory: '',
    inferGameSettingsFromSgf: true,
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

function normalizeSgfAnalysisConfig(config = {}) {
  let defaults = createDefaultSgfAnalysisConfig()

  let normalized = {
    ...defaults,
    ...pickKnownConfigKeys(config),
    maxVisits: normalizeInteger(config.maxVisits, defaults.maxVisits),
    inferGameSettingsFromSgf: normalizeBoolean(
      config.inferGameSettingsFromSgf,
      defaults.inferGameSettingsFromSgf,
    ),
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

  normalized.katagoArguments = buildKatagoArguments(normalized)
  normalized.analyzeSgfArgs = Array.isArray(normalized.analyzeSgfArgs)
    ? normalized.analyzeSgfArgs.filter((arg) => typeof arg === 'string')
    : defaults.analyzeSgfArgs

  return normalized
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}

function buildKatagoArguments(config = {}) {
  let katagoModelPath = config.katagoModelPath || ''
  let katagoConfigPath = config.katagoConfigPath || ''
  let parts = ['analysis']

  if (katagoModelPath !== '') {
    parts.push('-model', quoteKatagoArgument(katagoModelPath, config))
  }

  if (katagoConfigPath !== '') {
    parts.push('-config', quoteKatagoArgument(katagoConfigPath, config))
  }

  return parts.join(' ')
}

function quoteKatagoArgument(value, config = {}) {
  return config.katagoShellQuoting === 'cmd' ? value : `'${value}'`
}

function validateSgfAnalysisConfig(
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
  requireNonEmptyString(errors, normalized.katagoModelPath, {
    field: 'katagoModelPath',
    code: 'katago-model-not-configured',
    message: 'KataGo neural network model is not configured.',
  })
  requireNonEmptyString(errors, normalized.katagoConfigPath, {
    field: 'katagoConfigPath',
    code: 'katago-config-not-configured',
    message: 'KataGo analysis config is not configured.',
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
  validateFileExists(errors, normalized.katagoModelPath, fileExists, {
    field: 'katagoModelPath',
    code: 'katago-model-not-found',
    message: 'KataGo neural network model was not found.',
  })
  validateFileExists(errors, normalized.katagoConfigPath, fileExists, {
    field: 'katagoConfigPath',
    code: 'katago-config-not-found',
    message: 'KataGo analysis config was not found.',
  })

  validateBadJsonString(errors, normalized.katagoPath, 'katagoPath')
  validateBadJsonString(errors, normalized.katagoModelPath, 'katagoModelPath')
  validateBadJsonString(errors, normalized.katagoConfigPath, 'katagoConfigPath')
  validateKatagoShellPathString(errors, normalized.katagoPath, 'katagoPath')
  validateKatagoShellPathString(
    errors,
    normalized.katagoModelPath,
    'katagoModelPath',
  )
  validateKatagoShellPathString(
    errors,
    normalized.katagoConfigPath,
    'katagoConfigPath',
  )
  validateKatagoShellQuoting(errors, normalized)
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

function buildAnalyzeSgfArguments({inputPath, config, fileSuffix}) {
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
      path: quoteKatagoArgument(normalized.katagoPath, normalized),
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

function serializeAnalyzeSgfOptions(options) {
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
  if (!value.includes('"')) return JSON.stringify(value)
  value = value.replace(/\\/g, '\\\\')
  if (!value.includes("'")) return `'${value}'`
  if (!value.includes('"')) return `"${value}"`

  throw new TypeError('Cannot serialize strings containing both quote types.')
}

function validateKatagoShellQuoting(errors, config) {
  if (config.katagoShellQuoting !== 'cmd') return

  for (let field of ['katagoPath', 'katagoModelPath', 'katagoConfigPath']) {
    if (typeof config[field] !== 'string' || !/\s/.test(config[field])) continue

    errors.push({
      field,
      code: 'unsupported-katago-path-whitespace',
      message: 'KataGo paths cannot contain whitespace on Windows.',
    })
  }
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

function validateKatagoShellPathString(errors, value, field) {
  if (typeof value !== 'string') return
  if (!/["'$`%\r\n&|<>^;#]/.test(value) && !value.endsWith('\\')) return

  errors.push({
    field,
    code: 'unsupported-katago-path-characters',
    message: 'KataGo path contains unsupported shell characters.',
  })
}

function shouldValidateAnalyzeSgfPath(path) {
  return path !== createDefaultSgfAnalysisConfig().analyzeSgfPath
}

function requireNonEmptyString(errors, value, error) {
  if (typeof value === 'string' && value.trim() !== '') return

  errors.push(error)
}

exports.createDefaultSgfAnalysisConfig = createDefaultSgfAnalysisConfig
exports.normalizeSgfAnalysisConfig = normalizeSgfAnalysisConfig
exports.validateSgfAnalysisConfig = validateSgfAnalysisConfig
exports.buildAnalyzeSgfArguments = buildAnalyzeSgfArguments
exports.buildKatagoArguments = buildKatagoArguments
exports.serializeAnalyzeSgfOptions = serializeAnalyzeSgfOptions
