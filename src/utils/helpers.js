import { LANG_NAME, MODULE_NAME } from "./constants.js";
import * as log from "./logging.js";

/**
 * Simple debounce implementation used to delay function execution.
 * Creates a wrapper which postpones execution until after wait milliseconds
 * have elapsed since the last invocation.
 *
 * @param {Function} func The function to debounce
 * @param {number} wait The number of milliseconds to delay
 * @returns {Function} A debounced wrapper function
 */
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

/**
 * Issue a delayed (debounced) reload of the application.  Some settings
 * changes require a full reload to take effect.  By debouncing the call we
 * allow time for the setting to save before reloading.
 */
export const delayReload = debounce(() => window.location.reload(), 100);

/**
 * Dynamically load an additional JavaScript file at runtime.  If the script
 * has already been loaded it will not be loaded again.  Returns a Promise
 * which resolves once the script has finished loading.
 *
 * @param {string} scriptSrc The path to the script file
 */
export async function loadScript(scriptSrc) {
  log.debug("Loading script:", scriptSrc);
  return new Promise((resolve, reject) => {
    // Avoid loading the same script multiple times
    if ($(`script[src="${scriptSrc}"]`).length > 0) {
      log.debug("Script already loaded:", scriptSrc);
      resolve(true);
      return;
    }
    const scriptElement = document.createElement("script");
    $("head").append(scriptElement);
    scriptElement.type = "text/javascript";
    scriptElement.src = scriptSrc;
    scriptElement.onload = () => {
      log.debug("Loaded script", scriptSrc);
      resolve(true);
    };
    scriptElement.onerror = (err) => {
      log.error("Error loading script", scriptSrc);
      reject(err);
    };
  });
}

/**
 * Register a module setting with Foundry.  This helper wraps the standard
 * game.settings.register call, applying the module name and building the
 * internationalisation keys from the provided object.
 *
 * @param {Object} settingsObject The settings definition
 */
export function registerModuleSetting(settingsObject) {
  game.settings.register(MODULE_NAME, settingsObject.name, {
    name: `${LANG_NAME}.${settingsObject.name}`,
    hint: `${LANG_NAME}.${settingsObject.name}Hint`,
    scope: settingsObject.scope,
    config: settingsObject.config,
    default: settingsObject.default,
    type: settingsObject.type,
    range: settingsObject.range,
    onChange: settingsObject.onChange,
  });
}