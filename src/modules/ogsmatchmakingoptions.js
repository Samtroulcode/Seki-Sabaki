export function updateScalarMatchmakingOption(options, name, value) {
  return {
    ...options,
    [name]: name.endsWith('RankDiff') ? +value : value,
  }
}

export function updateNestedMatchmakingOption(options, name, value) {
  let [group, key] = name.split('.')

  return {
    ...options,
    [group]: {
      ...options[group],
      [key]: value,
    },
  }
}

export function updateMultiMatchmakingOption(options, name, value, checked) {
  let current = options[name] || []
  let parsedValue = name === 'boardSizes' ? +value : value
  let next = checked
    ? [...current, parsedValue]
    : current.filter((item) => item !== parsedValue)

  return {
    ...options,
    [name]: next,
  }
}
