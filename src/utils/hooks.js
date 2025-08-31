import { MODULE_NAME } from "./constants.js";
import registerModuleSettings from "./registerModuleSettings.js";
import * as log from "./logging.js";

/* -------------------------------------------- */
/*  Hook registrations                              */
/* -------------------------------------------- */

// Perform early initialisation.  Register settings and UI hooks once during
// the init phase.  At this point the `game` object exists but most systems
// have not yet been initialised, so avoid touching world data here.
Hooks.once("init", () => {
  // Register our module settings.  The helpers function encapsulates
  // boilerplate for game.settings.register.
  registerModuleSettings();

  // Add hooks to player list rendering to inject our buttons.  In Foundry
  // v13 the player list is provided by the Players application (ApplicationV2)
  // and the corresponding hook name changed from renderPlayerList (v10 and
  // earlier) to renderPlayers.  Register listeners on both hook names for
  // compatibility with multiple Foundry versions.  Bind the handler to
  // globalThis.sussuros so that `this` inside the handler refers to our
  // module instance.
  const renderHookV13 = "renderPlayers";
  const renderHookLegacy = "renderPlayerList";
  Hooks.on(
    renderHookV13,
    globalThis.sussuros._onRenderPlayerList.bind(globalThis.sussuros)
  );
  Hooks.on(
    renderHookLegacy,
    globalThis.sussuros._onRenderPlayerList.bind(globalThis.sussuros)
  );

  // Watch for changes to the RTC (A/V) settings so we can tear down and
  // recreate peer connections when the user switches devices.
  Hooks.on(
    "rtcSettingsChanged",
    globalThis.sussuros._onRtcSettingsChanged.bind(globalThis.sussuros)
  );
});

// Perform final initialisation once the game world is ready.  At this stage
// sockets and media devices are available.  We set up our socket listener and
// pre‑request microphone access here to prompt the user early.
Hooks.on("ready", () => {
  // Listen for signalling events on the module namespace.  These messages are
  // emitted by remote peers to establish and manage SimplePeer connections.
  game.socket.on(`module.${MODULE_NAME}`, (request, userId) => {
    log.debug("Socket event:", request, "from:", userId);
    switch (request.action) {
      case "peer-signal":
        // Only process signalling intended for us
        if (request.userId === game.user.id) {
          globalThis.sussuros.signal(userId, request.data);
        }
        break;
      case "peer-close":
        if (request.userId === game.user.id) {
          globalThis.sussuros.closePeer(userId);
        }
        break;
      case "peer-broadcasting":
        if (request.userId === game.user.id) {
          globalThis.sussuros._remoteBroadcasting(
            userId,
            request.broadcasting
          );
        }
        break;
      default:
        log.warn("Unknown socket event:", request);
    }
  });

  // Tear down all peers if the user closes or refreshes their browser window.
  window.addEventListener(
    "beforeunload",
    globalThis.sussuros.closeAllPeers.bind(globalThis.sussuros)
  );

  // Preemptively request access to the microphone to surface the browser
  // permission prompt early.  This improves the user experience by avoiding
  // permission prompts during the first broadcast attempt.
  navigator.mediaDevices
    .getUserMedia({ video: false, audio: true })
    .then(() => {
      log.debug("Audio stream request succeeded");
    })
    .catch((err) => {
      log.error("Error getting audio device:", err);
    });
});

// Add context menu options for Sussuros on the user right‑click menu.  This
// hook is registered at module load time.  It checks whether the clicked
// user is someone else and active, then appends two actions: one to
// connect and another to toggle broadcast (or start/stop when in
// push‑to‑talk mode).  These options appear in the list of user
// management actions (e.g. Pull to Scene, Kick Player).
Hooks.on("getUserContextOptions", (user, options) => {
  try {
    // Only offer options for other active users
    if (!user || user.id === game.user.id || !user.active) return;

    // Connect option: start a peer if one doesn't exist yet
    options.push({
      name: "Sussuros – Conectar",
      icon: '<i class="fas fa-plug"></i>',
      condition: () => {
        return !globalThis.sussuros.peers.has(user.id) || !globalThis.sussuros.peers.get(user.id).connected;
      },
      callback: () => {
        if (!globalThis.sussuros.peers.has(user.id) || !globalThis.sussuros.peers.get(user.id).connected) {
          globalThis.sussuros.initPeer(user.id);
        }
      },
    });

    // Toggle or broadcast option: either toggle the local stream (toggle mode) or
    // start/stop broadcasting (push‑to‑talk) if the peer exists
    options.push({
      name: game.settings.get(MODULE_NAME, "toggleBroadcast")
        ? "Sussuros – Alternar transmissão"
        : "Sussuros – Iniciar/Parar",
      icon: '<i class="fas fa-microphone-alt"></i>',
      condition: () => {
        return globalThis.sussuros.peers.has(user.id) && globalThis.sussuros.peers.get(user.id).connected;
      },
      callback: () => {
        const toggle = game.settings.get(MODULE_NAME, "toggleBroadcast");
        if (toggle) {
          globalThis.sussuros.toggleLocalStream(user.id);
        } else {
          const enabled = globalThis.sussuros.isLocalStreamEnabled(user.id);
          globalThis.sussuros.enableLocalStream(user.id, !enabled);
        }
      },
    });
  } catch (err) {
    // Catch any unexpected errors to avoid breaking the context menu
    log.error("Error adding Sussuros context options:", err);
  }
});