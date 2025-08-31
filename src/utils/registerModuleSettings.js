import { MODULE_NAME } from "./constants.js";
import * as helpers from "./helpers.js";
import * as log from "./logging.js";

/**
 * Register all of the module's configurable settings.  Settings are scoped
 * either to the client or the world and can be exposed to the user via the
 * configuration UI.  Changing certain settings triggers a reload or other
 * actions as appropriate.
 */
export default function registerModuleSettings() {
  // Setting to toggle between push‑to‑talk (false) and toggle broadcast (true)
  helpers.registerModuleSetting({
    name: "toggleBroadcast",
    scope: "client",
    config: true,
    default: false,
    type: Boolean,
    onChange: () => window.location.reload(),
  });

  // Setting to optionally disable the core AV client's microphone while
  // broadcasting through Sussuros.  Only exposed when push‑to‑talk is used.
  helpers.registerModuleSetting({
    name: "disableAvClient",
    scope: "client",
    config: !game.settings.get(MODULE_NAME, "toggleBroadcast"),
    default: true,
    type: Boolean,
    onChange: () => {},
  });

  // Setting to enable verbose debug and info logging
  helpers.registerModuleSetting({
    name: "debug",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (value) => log.setDebug(value),
  });

  // Initialise the debug state based on the saved value
  log.setDebug(game.settings.get(MODULE_NAME, "debug"));
}