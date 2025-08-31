# Sussuros – Whisper Audio for Foundry VTT

*Inspired by the classic “Walkie-Talkie” module*

---

## Overview

**Sussuros** is a Foundry VTT module enabling private, one-to-one voice communication via WebRTC peer-to-peer connection. Whether you’re roleplaying quietly or whispering secret plans, **Sussuros** gives you the whisper experience you need—with **Always On**, **Push-to-Talk**, and **Voice Activation** modes.

---

## Features

- **Private Whisper Audio** — click or push-to-talk for discreet voice messaging.
- **Voice Modes**:
  - **Always On** with automatic exclusivity during whispers
  - **Push-to-Talk**
  - **Voice Activation**
- **Smart State Restoration** — preserves and restores your mute/broadcast status and voice mode after whispering.
- **Inspired by Walkie-Talkie** — retains the timeless simplicity and precision of the classic module while improving functionality and flexibility.  
  > *“Walkie-Talkie: Transmit voice chat to an individual with a push-to-talk microphone”* :contentReference[oaicite:1]{index=1}
- **Lightweight & Respectful** — activates only during whispering, quietly integrating with Foundry’s AV client.
- **Multilingual Support** — available in English, Spanish, and Brazilian Portuguese.

---

## Installation

1. In Foundry’s **Module Browser**, install via the manifest URL:
https://github.com/Erikcwill/sussuros-foundry/releases/latest/download/module.json

yaml
Copiar código
2. Enable the module and select your preferred voice mode in the module settings.

---

## How to Use

1. Choose your preferred voice mode: *Always On*, *Push-to-Talk*, or *Voice Activation*.
2. Click the microphone icon beside a user's name to initiate a private whisper.
3. In **Always On** mode, the module automatically suppresses global AV broadcast—only the whisper recipient hears you.
4. Once you stop whispering, **Sussuros** restores your previous mute, broadcast, and voice mode status precisely as before.

---

## Configuration Options

- **Voice Mode** (Always On / Push-to-Talk / Voice Activation)
- **Disable Native AV Microphone** (when using other AV clients)
- **Debug Logging** (for diagnosing connection issues)

---

## Development & Contribution

- **Author/Maintainer**: Erikcwill
- Contributions, issues, and translations are welcome! Please submit via GitHub.

---

## License

Licensed under the **MIT License**. See the `LICENSE` file for details.

---

**Elevate your roleplay with immersive, precise, and private audio whispers.**  
Try *Sussuros* now!
