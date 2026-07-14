# BUILD 410-F

- Adds Screen Wake Lock to 2D Live only.
- Reacquires on visibility/page return and retries after user interaction.
- Keeps Live running when Wake Lock is unsupported or denied.
- Parses `/api/byeoli/state` JSON errors and shows a clear Korean status instead of an empty waiting screen.
- Preserves the last valid Authority snapshot while reconnecting.
- Adds a build-time regression check for the Live middleware.
- Documents the required Cloudflare Production service binding.
