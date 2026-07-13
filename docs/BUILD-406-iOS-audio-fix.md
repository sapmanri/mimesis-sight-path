# Byeoli Walk iOS Audio Fix

## Root cause

The 2D page copied only a small part of the working 3D iOS unlock logic.

Current 2D code:

- creates/resumes an `AudioContext`
- plays a one-frame silent WebAudio buffer
- listens only to a one-time `pointerdown`

This is insufficient on iPhone because:

1. Older iOS accepts `touchend`/`click` as the reliable media-unlock gesture; `pointerdown`/`touchstart` may not unlock audio.
2. `AudioContext.resume()` is asynchronous, but `_ready()` calls `resume()` and immediately checks `ctx.state`. On iOS it often remains `suspended`/`interrupted` during that same call, so the first sound is discarded.
3. iPhone silent-switch routing is not handled. The working 3D implementation promotes the audio session to media playback with `navigator.audioSession.type = 'playback'` where available, plus a looping silent `<audio>` fallback for older iOS.
4. Background/foreground recovery only re-renders state; it does not reliably revive the audio context and media session.

## Reference implementation

Use `src/audio/ambience.ts`, section `BUILD 155: iOS 3중 자물쇠`, as the source of truth.

Required pieces to port into `public/byeoli-walk/index.html`:

- `navigator.audioSession.type = 'playback'` when supported
- silent WAV `HTMLAudioElement`, looped, `playsInline = true`
- `silentEl.play()` inside a real user gesture
- WebAudio empty-buffer blip in the same gesture call stack
- gesture listeners for at least `touchend`, `click`, `pointerup`; optional early attempts on `pointerdown`, `touchstart`, `keydown`
- foreground recovery on `visibilitychange`
- do not gate sound production on a synchronous `ctx.state === 'running'` check immediately after `resume()`

## Required code behavior

### Unlock

Create a single idempotent `Sound.unlock()` / `wake()` method. It must run synchronously from the user gesture handler and perform all three locks:

1. media-session promotion
2. silent HTMLAudio playback
3. AudioContext ensure/resume + empty WebAudio blip

### Button

The sound button must call `Sound.unlock()` first, then toggle `Sound.on`.

Do not rely on the existing one-time global `pointerdown` listener as the primary unlock path.

### Ready check

Replace the current pattern:

```js
if (ctx.state !== 'running') ctx.resume();
return ctx.state === 'running';
```

with a non-dropping pattern. `resume()` can be requested, but the sound call must not be rejected solely because the state has not changed synchronously yet. The primary guarantee comes from calling unlock inside the user gesture.

### Visibility recovery

When returning from background:

- request `ctx.resume()` if needed
- retry silent media playback when sound is enabled
- preserve the user's on/off setting

## Acceptance test

Test on a physical iPhone Safari, including silent switch ON.

1. Fresh load, no prior interaction: no autoplay expected.
2. Tap sound button once: icon becomes 🔊 and an immediate audible confirmation blip plays.
3. Footsteps/action/shutter sounds play afterward.
4. With side silent switch enabled, sounds still play through the media channel.
5. Background Safari for 10 seconds, return: sounds resume without toggling twice.
6. Turning sound off stops weather loop and all generated sounds.
7. Turning sound on again works on the first tap.

## Scope

Only modify the 2D audio block and related sound-button/visibility handlers. Do not touch BUILD 406-B renderer-state separation or shared brain files.
