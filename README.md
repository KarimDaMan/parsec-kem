# Parsec KEM

Parsec KEM serves Parsec's official browser client as a top-level Cloudflare
application. It is not an iframe, launcher, VNC implementation, or desktop
screenshot stream.

The Cloudflare Worker loads the current web client from `web.parsec.app` and
routes the client's Parsec control-plane HTTPS and WebSocket requests through
the same Cloudflare origin. The actual remote-desktop media connection remains
Parsec's native WebRTC connection.

## Published address

- Cloudflare Pages: <https://parsec-kem.pages.dev/>
- Health check: <https://parsec-kem.pages.dev/_parsec_kem_health>

The health check reports `"screenshotStream": false` so the deployed runtime
can be distinguished from the retired custom desktop-image implementation.

## Security model

- No Parsec credentials, session tokens, or desktop access keys are stored in
  this repository or in the Worker.
- The proxy accepts upstream requests only for Parsec-owned hostnames under
  `parsec.app`, `parsec.gg`, and `parsecusercontent.com`.
- Cross-origin isolation headers required by the official WebAssembly client
  are applied at the Cloudflare edge.
- Worker observability is disabled in the standalone deployment configuration.

## Cloudflare Pages

The repository contains `_worker.js` in the Pages output directory, using
Cloudflare Pages Functions advanced mode. `wrangler.jsonc` pins the runtime
compatibility date and enables public-origin fetches required for the official
Parsec upstream.
