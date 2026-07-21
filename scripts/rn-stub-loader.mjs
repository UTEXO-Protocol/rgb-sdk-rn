/**
 * ESM loader hook that stubs `react-native` for Node.
 *
 * `src/binding/NativeRgb.ts` calls `TurboModuleRegistry.getEnforcing('Rgb')` at
 * module load, and react-native's entry point is Flow-typed source Node cannot
 * parse. The contract checks in `check-contract.mjs` only inspect class fields
 * and getters — they never touch the native module — so a stub is enough and
 * keeps this package free of a test toolchain it does not otherwise need.
 */

const STUB = `
export const TurboModuleRegistry = {
  getEnforcing: () => new Proxy({}, { get: () => () => {
    throw new Error('react-native stub: native module is not available in Node');
  }}),
  get: () => null,
};
export const NativeModules = {};
export const Platform = { OS: 'node', select: (o) => o.default ?? o.native };
export default { TurboModuleRegistry, NativeModules, Platform };
`;

const STUB_URL = 'rn-stub:react-native';

export async function resolve(specifier, context, next) {
  if (specifier === 'react-native') {
    return { url: STUB_URL, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === STUB_URL) {
    return { format: 'module', source: STUB, shortCircuit: true };
  }
  return next(url, context);
}
