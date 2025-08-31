import { LANG_NAME, MODULE_NAME } from "./utils/constants.js";
import * as log from "./utils/logging.js";
// Pull in the bundled simple‑peer library.  Foundry will serve this file
// alongside the rest of the module so we can reference SimplePeer at runtime.
import "./simplepeer.min.js";

/**
 * The core class for the Sussuros module.  This class manages peer
 * connections, user audio streams, UI elements, and socket messaging in
 * order to provide one‑to‑one push‑to‑talk communication between players.
 */
export default class Sussuros {
  constructor() {
    // Map of remote user IDs to SimplePeer connections
    this.peers = new Map();
    // Map of remote user IDs to <audio> elements used for playback
    this.audioElements = new Map();
    // Map of remote user IDs to incoming MediaStreams
    this.remoteStreams = new Map();
    // Map of remote user IDs to outgoing MediaStreams
    this.localStreams = new Map();
    // Map of remote user IDs to jQuery elements representing the UI button
    this.talkieButtons = new Map();
    // Track whether the built‑in AV client was muted before broadcast
    this.savedAvEnabledState = false;
  }

  // --------------------------------------------------------------------------
  //  Module API
  // --------------------------------------------------------------------------

  /**
   * Create a SimplePeer connection for a particular user.  When a connection
   * is established, the associated UI button is updated and audio streams are
   * wired to the appropriate <audio> element.
   *
   * @param {string} userId The Foundry user ID we are connecting to
   * @param {boolean} [isInitiator=false] Whether we are the initiator of the connection
   */
  setupPeer(userId, isInitiator = false) {
    this.peers.set(
      userId,
      new SimplePeer({
        initiator: isInitiator,
        stream: false,
      })
    );

    this.peers.get(userId).on("signal", (data) => {
      log.debug("SimplePeer signal (", userId, "):", data);
      // Relay the signalling data through the Foundry socket so the other
      // client can process it.  Each client listens on the module namespace.
      game.socket.emit(`module.${MODULE_NAME}`, {
        action: "peer-signal",
        userId,
        data,
      });
    });

    this.peers.get(userId).on("connect", () => {
      log.debug("SimplePeer connect (", userId, ")");
      this.talkieButtons
        .get(userId)
        .addClass("sussuros-peer-connected");
      this._createUserAudio(userId);
    });

    this.peers.get(userId).on("data", (data) => {
      log.info("SimplePeer data (", userId, "):", data.toString());
    });

    this.peers.get(userId).on("stream", (stream) => {
      // Received a remote MediaStream; store it and attach it to the audio element
      log.debug("SimplePeer stream (", userId, "):", stream);
      this.remoteStreams.set(userId, stream);
      this._setAudioElementStream(userId);
    });

    this.peers.get(userId).on("close", () => {
      log.debug("SimplePeer close (", userId, ")");
      this.closePeer(userId);
    });

    this.peers.get(userId).on("error", (err) => {
      if (err.code === "ERR_DATA_CHANNEL") {
        log.warn("Peer connection closed (", userId, ")");
      } else {
        log.error("SimplePeer error (", userId, "):", err);
      }

      if (!this.peers.get(userId).connected) {
        this.closePeer(userId);
      }
    });

    // Re‑render the player list to reflect the new connection state
    ui.players.render();
  }

  /**
   * Process incoming signalling data from the remote client.  If no peer
   * connection exists yet, one will be created.
   *
   * @param {string} userId The remote user ID
   * @param {*} data The SimplePeer signalling payload
   */
  signal(userId, data) {
    if (!this.peers.has(userId)) {
      this.setupPeer(userId, false);
    }
    this.peers.get(userId).signal(data);
  }

  /**
   * Initialise a new peer connection as the initiator.  If a connection
   * already exists, a warning is logged instead.
   *
   * @param {string} userId The remote user ID
   */
  initPeer(userId) {
    if (!this.peers.has(userId) || !this.peers.get(userId).connected) {
      this.setupPeer(userId, true);
    } else {
      log.warn("initPeer: Peer already exists for", userId);
    }
  }

  /**
   * Send arbitrary data across an established SimplePeer data channel.
   *
   * @param {string} userId The remote user ID
   * @param {*} data Arbitrary JSON‑serialisable data to send
   */
  send(userId, data) {
    if (this.peers.has(userId) && this.peers.get(userId).connected) {
      this.peers.get(userId).send(data);
    }
  }

  /**
   * Close and clean up a specific peer connection, including any associated
   * MediaStreams and UI state.
   *
   * @param {string} userId The remote user ID
   */
  closePeer(userId) {
    this.audioElements.delete(userId);

    if (this.remoteStreams.has(userId)) {
      this.remoteStreams
        .get(userId)
        .getTracks()
        .forEach((remoteStream) => {
          remoteStream.stop();
        });
    }
    this.remoteStreams.delete(userId);

    if (this.localStreams.has(userId)) {
      this.localStreams
        .get(userId)
        .getTracks()
        .forEach((localStream) => {
          localStream.stop();
        });
    }
    // Reset button state
    this.talkieButtons
      .get(userId)
      .removeClass("sussuros-stream-broadcasting");
    this.talkieButtons
      .get(userId)
      .removeClass("sussuros-stream-connected");
    this.localStreams.delete(userId);

    if (this.peers.has(userId)) {
      this.peers.get(userId).destroy();
    }
    this.talkieButtons
      .get(userId)
      .removeClass("sussuros-peer-connected");
    this.peers.delete(userId);
  }

  /**
   * Determine whether our outbound audio stream is currently enabled for a
   * given peer.
   *
   * @param {string} userId The remote user ID
   * @returns {boolean}
   */
  isLocalStreamEnabled(userId) {
    if (!this.localStreams.has(userId)) {
      return false;
    }
    const localTracks = this.localStreams.get(userId).getTracks();
    return localTracks.some((localTrack) => localTrack.enabled === true);
  }

  /**
   * Enable or disable our outbound audio for a given peer.  If necessary, this
   * also toggles the built‑in AV client mute state.  This will emit a socket
   * message to inform the remote peer of our broadcasting state so that they
   * can update their UI accordingly.
   *
   * @param {string} userId The remote user ID
   * @param {boolean} [enable=false] Whether to enable outbound audio
   */
  enableLocalStream(userId, enable = false) {
    // If the peer or stream doesn't exist, abort early
    if (!this.peers.has(userId) || !this.localStreams.has(userId)) {
      if (this.peers.has(userId) && enable) {
        log.warn(game.i18n.localize(`${LANG_NAME}.captureErrorAudio`));
        ui.notifications.warn(
          game.i18n.localize(`${LANG_NAME}.captureErrorAudio`)
        );
      }
      return;
    }

    // Determine if a change is needed
    if (this.isLocalStreamEnabled(userId) !== enable) {
      const localTracks = this.localStreams.get(userId).getTracks();
      localTracks.forEach((localStream) => {
        localStream.enabled = enable;
      });
      // Notify the remote peer of our broadcast state
      game.socket.emit(`module.${MODULE_NAME}`, {
        action: "peer-broadcasting",
        userId,
        broadcasting: enable,
      });
      // Synchronise the built‑in AV client mute state
      this._disableAvClient(enable);
    }

    // Update button highlight
    if (enable) {
      this.talkieButtons
        .get(userId)
        .addClass("sussuros-stream-broadcasting");
    } else {
      this.talkieButtons
        .get(userId)
        .removeClass("sussuros-stream-broadcasting");
    }
  }

  /**
   * Toggle the outbound audio state for a given peer.
   *
   * @param {string} userId The remote user ID
   */
  toggleLocalStream(userId) {
    this.enableLocalStream(userId, !this.isLocalStreamEnabled(userId));
  }

  /**
   * Close all active peer connections and notify the remote peers.  This is
   * invoked when the window is unloaded or when audio settings change.
   */
  closeAllPeers() {
    if (this.peers) {
      this.peers.forEach((peer, userId) => {
        log.debug("Closing peer (", userId, ")");
        // Inform the remote peer to also close
        game.socket.emit(`module.${MODULE_NAME}`, {
          action: "peer-close",
          userId,
        });
        // Close our side
        this.closePeer(userId);
      });
    }
  }

  /**
   * Hook handler which runs whenever the player list is rendered.  This adds
   * push‑to‑talk buttons for every other active user in the player list.
   *
   * @param {PlayerList} playerList The rendered PlayerList application
   * @param {jQuery} html The jQuery object containing the rendered HTML
   * @param {object} players The players data, including users
   */
  _onRenderPlayerList(playerList, html /*, players */) {
    /**
     * Foundry v13 changed the markup for the Player List.  Instead of
     * #player-list with a set of <li> children, each player row now
     * carries a data-user-id attribute.  Iterate over those elements and
     * insert the push‑to‑talk button next to the player's status icon.  If
     * the .player-active element isn't present for some reason, fall back
     * to inserting at the start of the list item.  Also guard against
     * duplicate injections when re-rendering.
     *
     * The `html` parameter is a jQuery object in earlier versions of Foundry
     * (v10 and earlier) but is a native HTMLElement in Foundry v13 when
     * ApplicationV2 is used.  To support both, coerce `html` into a
     * jQuery object if necessary before querying it.  See Foundry v13 API
     * migration notes for details on render hooks returning HTMLElements.
     */
    const $html = html instanceof jQuery ? html : $(html);

    $html.find('[data-user-id]').each((_, li) => {
      const $li = $(li);
      // Retrieve the userId from data attributes (jQuery camelCase or raw)
      const userId = $li.data('userId') || $li.attr('data-user-id');
      // Skip if no userId or if this is the current user
      if (!userId || userId === game.user.id) return;
      // Avoid injecting twice on re-renders
      if (this.talkieButtons.has(userId) && $.contains(li, this.talkieButtons.get(userId)[0])) {
        return;
      }
      // Determine where to insert our button.  Most themes include a
      // .player-active span/icon; if not found, fall back to the first
      // child element to avoid pushing content to new lines.
      const $anchor = $li.find('.player-active').first();
      const placeAfter = $anchor.length ? $anchor : $li.children().first();
      // Ensure the talkie button exists and has click/mouse handlers
      if (!this.talkieButtons.has(userId)) {
        const $btn = $(
          '<a class="sussuros-button" title="Sussuros"><i class="fas fa-microphone-alt"></i></a>'
        );
        // Push‑to‑talk mode: only broadcast while the mouse is held down
        if (!game.settings.get(MODULE_NAME, 'toggleBroadcast')) {
          $btn.on('mousedown', () => {
            this.enableLocalStream(userId, true);
          });
          $btn.on('mouseup mouseleave', () => {
            this.enableLocalStream(userId, false);
          });
        }
        // Always attach a click handler: either initiate the connection or
        // toggle broadcast when in toggle mode.
        $btn.on('click', () => {
          if (!this.peers.has(userId) || !this.peers.get(userId).connected) {
            this.initPeer(userId);
          } else if (game.settings.get(MODULE_NAME, 'toggleBroadcast')) {
            this.toggleLocalStream(userId);
          }
        });
        this.talkieButtons.set(userId, $btn);
      }
      // Insert the button into the DOM and ensure an <audio> element exists
      placeAfter.after(this.talkieButtons.get(userId));
      this._addUserAudioElement(userId, this.talkieButtons.get(userId));
    });
  }

  /**
   * Internal helper to add a push‑to‑talk button next to a user's name and set
   * up the appropriate click handlers.  Buttons are reused if they already
   * exist for a given user.
   *
   * @param {jQuery} playerActiveIcon The jQuery element after which to insert the button
   * @param {string} userId The Foundry user ID
   */
  _addTalkieButton(playerActiveIcon, userId) {
    // Create the button on first use
    if (!this.talkieButtons.has(userId)) {
      const talkieButton = $(
        '<a class="sussuros-button" title="Sussuros"><i class="fas fa-microphone-alt"></i></a>'
      );
      this.talkieButtons.set(userId, talkieButton);
    }

    // For push‑to‑talk mode, enable audio only while the mouse is held down
    if (!game.settings.get(MODULE_NAME, "toggleBroadcast")) {
      this.talkieButtons.get(userId).on("mousedown", () => {
        this.enableLocalStream(userId, true);
      });
      this.talkieButtons.get(userId).on("mouseup", () => {
        this.enableLocalStream(userId, false);
      });
      this.talkieButtons.get(userId).on("mouseleave", () => {
        this.enableLocalStream(userId, false);
      });
    }

    // Always attach a click handler for connection and toggle mode
    this.talkieButtons.get(userId).on("click", () => {
      if (!this.peers.has(userId) || !this.peers.get(userId).connected) {
        this.initPeer(userId);
      } else if (game.settings.get(MODULE_NAME, "toggleBroadcast")) {
        this.toggleLocalStream(userId);
      }
    });

    // Insert the button and create an <audio> element after it
    playerActiveIcon.after(this.talkieButtons.get(userId));
    this._addUserAudioElement(userId, this.talkieButtons.get(userId));
  }

  /**
   * Handle remote broadcast state changes by colouring the UI to indicate when
   * a remote user is talking.
   *
   * @param {string} userId The remote user ID
   * @param {boolean} broadcasting Whether the remote user is broadcasting
   */
  _remoteBroadcasting(userId, broadcasting) {
    if (broadcasting) {
      this.talkieButtons
        .get(userId)
        .addClass("sussuros-stream-receiving");
    } else {
      this.talkieButtons
        .get(userId)
        .removeClass("sussuros-stream-receiving");
    }
  }

  /**
   * Create or retrieve an <audio> element for a given user.  This element is
   * used to play back incoming audio streams.  When a button element is
   * provided, a new <audio> element is created after that button.
   *
   * @param {string} userId The remote user ID
   * @param {HTMLElement} [buttonElement=null] The button after which to insert the audio element
   */
  _addUserAudioElement(userId, buttonElement = null) {
    let audioElement = null;
    const audioSink = game.webrtc.settings.get("client", "audioSink");

    // Create a new <audio> element when a button is provided
    if (buttonElement) {
      audioElement = document.createElement("audio");
      audioElement.className = "player-sussuros-audio";
      audioElement.autoplay = true;
      if (typeof audioElement.sinkId !== "undefined") {
        audioElement
          .setSinkId(audioSink)
          .then(() => {
            log.debug("Audio output set:", audioSink);
          })
          .catch((err) => {
            log.error("Error setting audio output device:", err);
          });
      } else {
        log.debug("Browser does not support output device selection");
      }
      // Insert after the button
      buttonElement.after(audioElement);
    }

    if (audioElement) {
      this.audioElements.set(userId, audioElement);
      if (this.remoteStreams.has(userId)) {
        this._setAudioElementStream(userId);
      }
    }
  }

  /**
   * Acquire a local microphone stream and attach it to the peer connection.  If
   * the stream has already been captured for this peer, it is reused.  Once
   * attached, the peer connection signals readiness and the UI state is
   * updated.
   *
   * @param {string} userId The remote user ID
   */
  _createUserAudio(userId) {
    const audioSrc = game.webrtc.settings.get("client", "audioSrc");
    if (!audioSrc) {
      log.warn("Audio input source disabled");
      return;
    }
    if (this.localStreams.has(userId)) {
      log.debug("Adding user audio to stream (", userId, ")");
      this.peers.get(userId).addStream(this.localStreams.get(userId));
      this.savedAvEnabledState = !game.webrtc.settings.get(
        "client",
        `users.${game.user.id}.muted`
      );
      this.enableLocalStream(userId, false);
    } else {
      navigator.mediaDevices
        .getUserMedia({
          video: false,
          audio: { deviceId: audioSrc },
        })
        .then((localStream) => {
          log.debug("Got user audio:", localStream);
          this.localStreams.set(userId, localStream);
          log.debug("Adding user audio to stream (", userId, ")");
          this.peers.get(userId).addStream(this.localStreams.get(userId));
          this.savedAvEnabledState = !game.webrtc.settings.get(
            "client",
            `users.${game.user.id}.muted`
          );
          this.enableLocalStream(userId, false);
          this.talkieButtons
            .get(userId)
            .addClass("sussuros-stream-connected");
        })
        .catch((err) => {
          log.error("Error getting audio device:", err);
        });
    }
  }

  /**
   * Attach a MediaStream to an <audio> element for playback.
   *
   * @param {string} userId The remote user ID
   */
  _setAudioElementStream(userId) {
    const audioElement = this.audioElements.get(userId);
    const stream = this.remoteStreams.get(userId);
    if (!audioElement || !stream) return;
    if ("srcObject" in audioElement) {
      audioElement.srcObject = stream;
    } else {
      audioElement.src = window.URL.createObjectURL(stream);
    }
    audioElement.play();
  }

  /**
   * Mute or unmute the built‑in AV client based on our broadcast state.  This
   * helps prevent echo or accidentally broadcasting through both channels at
   * once.  If the module setting is disabled or toggle mode is enabled, this
   * method does nothing.
   *
   * @param {boolean} disable Whether we are currently broadcasting
   */
  _disableAvClient(disable) {
    // Only act when the user has enabled the option to mute the native AV
    // client and when push‑to‑talk (toggleBroadcast) is disabled.  When
    // toggleBroadcast is enabled, the Foundry AV will manage audio
    // independently.
    if (
      !game.settings.get(MODULE_NAME, "disableAvClient") ||
      game.settings.get(MODULE_NAME, "toggleBroadcast")
    ) {
      return;
    }

    // In Foundry's “Always” voice mode, muting via AVSettings alone is
    // insufficient because audio is continuously broadcast to all peers.
    // To provide exclusive one‑to‑one communication we need to disable
    // broadcasting when the sussurro begins and restore the previous
    // broadcast state when it ends.  We also preserve the existing
    // muted flag so that players who keep their microphone muted in
    // Always mode remain muted after whispering.  The AVClient API
    // exposes a `toggleBroadcast(boolean)` method to control whether the
    // outbound audio feed is actively broadcasting【606941953244527†L2-L4】.
    const avClient = game.webrtc?.client;
    try {
      if (avClient && avClient.isVoiceAlways) {
        if (disable) {
          // We are starting to broadcast via Sussuros.  Save the
          // current muted state and whether we were broadcasting so
          // that it can be restored when the whisper ends.
          this._savedMutedFlag = game.webrtc.settings.get(
            "client",
            `users.${game.user.id}.muted`
          );
          // Some AVClient implementations expose a `broadcasting`
          // property to indicate whether outbound audio is currently
          // enabled.  If it's available, record it.  Otherwise,
          // derive the broadcast state from the muted flag: if the
          // user is muted then broadcasting should be false.
          this._savedBroadcasting = typeof avClient.broadcasting === "boolean" ? avClient.broadcasting : !this._savedMutedFlag;
          // Disable broadcast so that only the whisper recipient hears us.
          avClient.toggleBroadcast?.(false);
        } else {
          // Whisper has ended.  Restore the previous broadcast state.
          const savedMutedFlag = this._savedMutedFlag;
          const savedBroadcasting = this._savedBroadcasting;
          if (typeof savedBroadcasting !== "undefined") {
            avClient.toggleBroadcast?.(savedBroadcasting);
          } else {
            // Fallback: if the user was muted, keep broadcast off; else on.
            const shouldBroadcast = savedMutedFlag ? false : true;
            avClient.toggleBroadcast?.(shouldBroadcast);
          }
          // Clear saved state
          this._savedMutedFlag = undefined;
          this._savedBroadcasting = undefined;
        }
        return;
      }
    } catch (err) {
      // Fall through to the default behaviour on any error.  Errors are
      // logged to aid debugging but should not break whispering.
      log.error("Error toggling AV broadcast", err);
    }

    // Default behaviour: mute or unmute the AV microphone per user.  This
    // branch covers both push‑to‑talk and voice activation modes.  We
    // track the initial mute state to restore it when whispering ends.
    const isAudioEnabled = !game.webrtc.settings.get(
      "client",
      `users.${game.user.id}.muted`
    );
    if (disable) {
      this.savedAvEnabledState = isAudioEnabled;
      if (this.savedAvEnabledState) {
        log.debug("Disabling AV client audio");
        game.webrtc.settings.set(
          "client",
          `users.${game.user.id}.muted`,
          true
        );
      }
    } else if (this.savedAvEnabledState !== isAudioEnabled) {
      log.debug("Enabling AV client audio");
      game.webrtc.settings.set(
        "client",
        `users.${game.user.id}.muted`,
        !this.savedAvEnabledState
      );
    }
  }

  /**
   * Respond to changes in RTC settings by closing all peer connections if the
   * audio device has changed.  This ensures that peers reconnect using the
   * updated device.
   *
   * @param {object} rtcSettings The full RTC settings object
   * @param {object} changed The subset of keys that have changed
   */
  _onRtcSettingsChanged(rtcSettings, changed) {
    // Use the built‑in utility to flatten the changed settings object.  This
    // function is provided by Foundry in the global foundry.utils namespace.
    const keys = Object.keys(foundry.utils.flattenObject(changed));
    if (keys.some((k) => ["client.audioSink", "client.audioSrc"].includes(k))) {
      log.debug(
        "Audio device changed, closing existing connections",
        changed
      );
      this.closeAllPeers();
    }
  }
}