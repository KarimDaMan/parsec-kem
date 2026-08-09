# Parsec KEM

Parsec KEM is a private browser desktop for a Windows host. The published page
opens the live Windows screen directly in a canvas and sends mouse, touch, and
keyboard controls through an authenticated Cloudflare WebSocket tunnel.

The normal entry point is a private one-click URL whose `#connect=...` fragment
is read in the browser and starts the desktop automatically. The fragment is
never included in the HTTP request for the static page. A manual backup-code
form remains collapsed for recovery.

## Security model

- The desktop host listens on `127.0.0.1` only.
- Cloudflare Tunnel is outbound-only; there is no inbound firewall rule.
- Every WebSocket session requires a high-entropy access key.
- The host accepts WebSocket requests only from the two published site origins.
- The public repository contains the tunnel address but never the access key.
- The page does not save the access key in local or session storage.

## Published addresses

- Cloudflare Pages: <https://parsec-kem.pages.dev/>
- GitHub Pages: <https://karimdaman.github.io/parsec-kem/>

The browser desktop is intentionally independent of the blocked Parsec web
client. It is a private remote-control path, not a copy or proxy of Parsec.
