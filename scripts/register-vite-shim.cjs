const Module = require('module');

const originalLoad = Module._load;

function mergeConfig(base = {}, overrides = {}) {
  if (overrides == null) {
    return { ...base };
  }

  const result = Array.isArray(base) ? [...base] : { ...base };

  for (const [key, overrideValue] of Object.entries(overrides)) {
    const baseValue = result[key];

    if (Array.isArray(baseValue) && Array.isArray(overrideValue)) {
      result[key] = [...baseValue, ...overrideValue];
      continue;
    }

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = mergeConfig(baseValue, overrideValue);
      continue;
    }

    result[key] = cloneValue(overrideValue);
  }

  return result;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (isPlainObject(value)) {
    return mergeConfig({}, value);
  }

  return value;
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'vite') {
    return { mergeConfig };
  }

  return originalLoad.call(this, request, parent, isMain);
};
