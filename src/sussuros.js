import "./utils/hooks.js";
// Import the core Sussuros class from a uniquely named module.  On
// Windows file systems, file names are case‑insensitive, so using
// distinct names for the class file prevents conflicts during
// extraction.  See README for details.
import Sussuros from "./SussurosClass.js";

// Instantiate the module and expose it globally.  Foundry attaches all
// module singletons to the global namespace so that hooks and socket
// listeners can reference them easily.  Using a unique name helps
// avoid collisions with other modules.
globalThis.sussuros = new Sussuros();