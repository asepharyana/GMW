# Phase 4: Live/Voice Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Live panel — voice connection, audio visualization, music/screen playback, recordings, PCM streaming, and mic transmit.

**Architecture:** Canvas 2D via `web-sys::CanvasRenderingContext2d` for real-time audio vis. `web_sys::AudioContext` + `AudioBufferSourceNode` for PCM playback. `web_sys::MediaDevices::get_user_media` for mic capture. WS binary frames parsed from `[u32 userId][i16 samples]` format.

**Tech Stack:** Leptos 0.7 CSR, `web-sys` (Canvas, AudioContext, MediaDevices), `wasm-bindgen`, `js-sys`.

## Global Constraints

- Branch: `leptos-rewrite` at `/mnt/code/bete/.worktrees/leptos-rewrite/`
- Use `use leptos::prelude::*;` (NOT `use leptos::*;`)
- Canvas elements use `web-sys` not Leptos abstractions
- Binary WS frames: `DataView` on `ArrayBuffer` received in `WsContext.on_binary` callback
- No new heavy dependencies (avoid `cpal`, `rodio` — these don't compile to WASM)

---

## File Structure

```
services/frontend-leptos/frontend/src/
└── features/
    └── live/
        ├── mod.rs                    # LivePanel (composition)
        ├── components/
        │   ├── mod.rs
        │   ├── voice_connection_card.rs  # Guild/channel select + connect/disconnect
        │   ├── active_speakers.rs        # Speaking users list
        │   ├── audio_visualizer.rs       # Canvas 32-bar viz
        │   ├── mic_level_meter.rs        # Horizontal level bar
        │   ├── now_playing.rs            # Current media + queue
        │   ├── music_sub_panel.rs        # Music playlist controls
        │   ├── screen_sub_panel.rs       # Screenshare controls
        │   ├── recordings_sub_panel.rs   # Voice recordings list
        │   └── waveform_player.rs        # Canvas + AudioContext player
        ├── hooks/
        │   ├── mod.rs
        │   ├── use_voice_control.rs      # Voice connection commands
        │   ├── use_media_control.rs      # Media player commands
        │   ├── use_audio_playback.rs     # PCM → AudioContext pipeline
        │   └── use_audio_transmit.rs     # Mic → WS binary frames
        └── audio/
            ├── mod.rs
            ├── pcm_decoder.rs            # Opus/PCM decode logic
            └── ring_buffer.rs            # Audio ring buffer for streaming
```

**Files to modify:**
- `services/frontend-leptos/frontend/src/lib.rs` — add `pub mod features;` (already done, add `pub mod live;`)
- `services/frontend-leptos/frontend/src/app.rs` — wire `LivePanel` as tab content
- `services/frontend-leptos/frontend/src/app.css` — add live-panel CSS classes
- `services/frontend-leptos/frontend/Cargo.toml` — add any new web-sys features

---

### Task 1: Module skeleton + voice control hook

- Create: `features/live/{mod.rs, components/mod.rs, hooks/mod.rs}`
- Create: `features/live/hooks/use_voice_control.rs` — guilds, channels, connect/disconnect
- Create: `features/live/hooks/use_media_control.rs` — queue, skip, stop, volume
- Modify: `lib.rs` — add `pub mod live;`

### Task 2: VoiceConnectionCard + ActiveSpeakers

- Create: `features/live/components/voice_connection_card.rs`
- Create: `features/live/components/active_speakers.rs`
- Port from React: guild selector, voice channel selector, join/disconnect buttons, speaker list

### Task 3: AudioVisualizer + MicLevelMeter

- Create: `features/live/components/audio_visualizer.rs` — Canvas 32-bar frequency vis
- Create: `features/live/components/mic_level_meter.rs` — 0-100% bar
- Key: `CanvasRenderingContext2d::fill_rect` per frame via `requestAnimationFrame`

### Task 4: Music + Screen sub-panels

- Create: `features/live/components/now_playing.rs`
- Create: `features/live/components/music_sub_panel.rs`
- Create: `features/live/components/screen_sub_panel.rs`
- Port from React: queue display, volume slider, URL inputs, control buttons

### Task 5: RecordingsSubPanel + WaveformPlayer

- Create: `features/live/components/recordings_sub_panel.rs` — paginated recordings list
- Create: `features/live/components/waveform_player.rs` — Canvas waveform + AudioContext
- Key: `AudioContext::decode_audio_data` for fetch-playback

### Task 6: PCM audio playback + mic transmit

- Create: `features/live/hooks/use_audio_playback.rs` — binary WS frames → AudioContext
- Create: `features/live/hooks/use_audio_transmit.rs` — getUserMedia → WS
- Create: `features/live/audio/pcm_decoder.rs`
- Create: `features/live/audio/ring_buffer.rs`

### Task 7: LivePanel composition + wiring

- Rewrite: `features/live/mod.rs` — assemble all components
- Modify: `app.rs` — wire LivePanel, add CSS classes
- Test: `cargo check` + `trunk build --release`
