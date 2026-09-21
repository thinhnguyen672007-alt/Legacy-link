export const MIN_VALID_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
export const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000; // 1 tiếng 

// kiểm tra có để tránh bị null và giá trị phải là một object và không phải là một mảng 
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
