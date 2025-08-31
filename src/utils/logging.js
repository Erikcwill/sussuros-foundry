import { LOG_PREFIX, MODULE_NAME } from "./constants.js";

/* -------------------------------------------- */
/*  Logging Methods                             */
/* -------------------------------------------- */

/**
 * Output debug messages to the console if debugging is enabled.  The actual
 * implementation of this function is swapped by setDebug based on the module
 * setting.  By default it uses console.debug with a prefix.
 */
// eslint-disable-next-line import/no-mutable-exports
export let debug = console.debug.bind(console, LOG_PREFIX);

/**
 * Output informational messages to the console if debugging is enabled.
 * This is also swapped by setDebug.
 */
// eslint-disable-next-line import/no-mutable-exports
export let info = console.info.bind(console, LOG_PREFIX);

/**
 * Output warning messages to the console.  Warnings are always logged.
 */
export const warn = console.warn.bind(console, LOG_PREFIX);

/**
 * Output error messages to the console.  Errors are always logged.
 */
export const error = console.error.bind(console, LOG_PREFIX);

/**
 * Enable or disable debug and info logging based on the provided value.
 * When disabled, debug and info messages become no‑ops to avoid cluttering the
 * console.  This function also notifies any listeners that the debug state
 * has changed.
 *
 * @param {boolean} value True to enable debug logging, false to disable
 */
export function setDebug(value) {
  if (value) {
    debug = console.debug.bind(console, LOG_PREFIX);
    info = console.info.bind(console, LOG_PREFIX);
  } else {
    debug = () => {};
    info = () => {};
  }
  Hooks.callAll(`${MODULE_NAME}DebugSet`, value);
}