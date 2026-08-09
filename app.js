const accessForm = document.querySelector("#access-form");
const accessKeyInput = document.querySelector("#access-key");
const gatewayInput = document.querySelector("#gateway-url");
const connectButton = document.querySelector("#connect-button");
const privateConnectButton = document.querySelector("#private-connect-button");
const oneClickTitle = document.querySelector("#one-click-title");
const oneClickDescription = document.querySelector("#one-click-description");
const disconnectButton = document.querySelector("#disconnect-button");
const fullscreenButton = document.querySelector("#fullscreen-button");
const desktopPanel = document.querySelector("#desktop-panel");
const desktopCanvas = document.querySelector("#desktop-canvas");
const screenPlaceholder = document.querySelector("#screen-placeholder");
const connectingOverlay = document.querySelector("#connecting-overlay");
const connectingMessage = document.querySelector("#connecting-message");
const stateDot = document.querySelector("#state-dot");
const topbarStatus = document.querySelector("#topbar-status");
const footerDot = document.querySelector("#footer-dot");
const footerStatus = document.querySelector("#footer-status");
const sessionDetail = document.querySelector("#session-detail");
const resolutionLabel = document.querySelector("#resolution-label");
const context = desktopCanvas.getContext("2d", { alpha: false });

const configuredGateway = window.PARSEC_KEM_CONFIG?.gatewayUrl ?? "";
gatewayInput.value = configuredGateway;

let socket = null;
let connectionTimer = null;
let queuedFrame = null;
let drawingFrame = false;
let firstFrameReceived = false;
let pointerFrame = null;
let pendingPointer = null;
let privateLinkToken = null;

function readPrivateLinkToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("connect");
  return /^[A-Za-z0-9_-]{32,128}$/.test(token ?? "") ? token : null;
}

function setState(state, message) {
  document.body.dataset.connection = state;
  topbarStatus.textContent = message.toUpperCase();
  footerStatus.textContent = message.toUpperCase();
  stateDot.className = `state-dot state-${state}`;
  footerDot.className = `mini-dot state-${state}`;
}

function normalizeGateway(value) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice(8)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice(7)}`;
  return trimmed;
}

function sendControl(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function setConnectedControls(connected) {
  connectButton.disabled = connected;
  accessKeyInput.disabled = connected;
  gatewayInput.disabled = connected;
  disconnectButton.disabled = !connected;
  fullscreenButton.disabled = !connected;
  if (privateLinkToken) {
    privateConnectButton.hidden = connected;
    privateConnectButton.disabled = connected;
  }
}

function showConnecting(message) {
  connectingMessage.textContent = message;
  connectingOverlay.hidden = false;
  screenPlaceholder.hidden = true;
}

function hideConnecting() {
  connectingOverlay.hidden = true;
}

function closeSocket(reason = "Disconnected") {
  clearTimeout(connectionTimer);
  connectionTimer = null;
  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close(1000, "Client disconnected");
    }
  }
  socket = null;
  queuedFrame = null;
  firstFrameReceived = false;
  setConnectedControls(false);
  hideConnecting();
  desktopCanvas.classList.remove("is-live");
  screenPlaceholder.hidden = false;
  sessionDetail.textContent = "Waiting for a private session";
  resolutionLabel.textContent = "—";
  setState("offline", reason);
  if (privateLinkToken) {
    oneClickTitle.textContent = "Your private link is ready";
    oneClickDescription.textContent = "Tap below to reconnect. There is no code to enter.";
    privateConnectButton.textContent = "Reconnect to my computer";
  }
}

async function drawNextFrame() {
  if (drawingFrame || !queuedFrame) return;
  drawingFrame = true;
  const frame = queuedFrame;
  queuedFrame = null;

  try {
    const bitmap = await createImageBitmap(new Blob([frame], { type: "image/jpeg" }));
    if (desktopCanvas.width !== bitmap.width || desktopCanvas.height !== bitmap.height) {
      desktopCanvas.width = bitmap.width;
      desktopCanvas.height = bitmap.height;
      resolutionLabel.textContent = `${bitmap.width} × ${bitmap.height}`;
    }
    context.drawImage(bitmap, 0, 0, desktopCanvas.width, desktopCanvas.height);
    bitmap.close();

    if (!firstFrameReceived) {
      firstFrameReceived = true;
      hideConnecting();
      desktopCanvas.classList.add("is-live");
      desktopCanvas.focus({ preventScroll: true });
      sessionDetail.textContent = "Encrypted live session";
      setState("online", "Desktop online");
      if (privateLinkToken) {
        oneClickTitle.textContent = "Your computer is open";
        oneClickDescription.textContent = "Use the live desktop below. Nothing else is required.";
      }
    }
  } catch {
    setState("warning", "Frame decode error");
  } finally {
    drawingFrame = false;
    if (queuedFrame) drawNextFrame();
  }
}

function handleServerMessage(event) {
  if (typeof event.data !== "string") {
    queuedFrame = event.data;
    drawNextFrame();
    return;
  }

  try {
    const message = JSON.parse(event.data);
    if (message.type === "hello") {
      resolutionLabel.textContent = `${message.width} × ${message.height}`;
      showConnecting("Desktop found. Loading the first frame…");
    }
    if (message.type === "status") {
      sessionDetail.textContent = message.message;
    }
  } catch {
    setState("warning", "Unexpected gateway message");
  }
}

function connect(accessKey, gateway) {
  const endpoint = normalizeGateway(gateway);
  if (!/^wss:\/\//i.test(endpoint)) {
    setState("warning", "Secure gateway required");
    gatewayInput.focus();
    return;
  }

  const url = `${endpoint}/connect/${encodeURIComponent(accessKey)}`;
  setConnectedControls(true);
  showConnecting("Opening secure desktop…");
  setState("connecting", "Connecting");
  sessionDetail.textContent = "Authorizing private session";
  if (privateLinkToken) {
    oneClickTitle.textContent = "Opening your computer…";
    oneClickDescription.textContent = "Your private link was recognized. Connecting automatically.";
  }

  try {
    socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
  } catch {
    closeSocket("Invalid gateway");
    return;
  }

  connectionTimer = setTimeout(() => closeSocket("Connection timed out"), 20000);

  socket.addEventListener("open", () => {
    clearTimeout(connectionTimer);
    connectionTimer = null;
    accessKeyInput.value = "";
    setState("connecting", "Connected securely");
    sessionDetail.textContent = "Waiting for the first desktop frame";
  });
  socket.addEventListener("message", handleServerMessage);
  socket.addEventListener("error", () => setState("warning", "Could not reach desktop"));
  socket.addEventListener("close", (event) => {
    const reason = event.code === 1000 ? "Disconnected" : "Connection closed";
    closeSocket(reason);
  });
}

accessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const key = accessKeyInput.value.trim();
  if (!key) {
    accessKeyInput.focus();
    return;
  }
  connect(key, gatewayInput.value);
});

privateConnectButton.addEventListener("click", () => {
  if (privateLinkToken) connect(privateLinkToken, gatewayInput.value);
});

disconnectButton.addEventListener("click", () => closeSocket("Disconnected"));

fullscreenButton.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await desktopPanel.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    setState("warning", "Full screen unavailable");
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

function pointerPosition(event) {
  const bounds = desktopCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

function queuePointer(event) {
  pendingPointer = pointerPosition(event);
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = null;
    if (pendingPointer) sendControl({ type: "pointer", ...pendingPointer });
    pendingPointer = null;
  });
}

function buttonName(button) {
  if (button === 0) return "left";
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return null;
}

desktopCanvas.addEventListener("pointermove", queuePointer);
desktopCanvas.addEventListener("pointerdown", (event) => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  event.preventDefault();
  desktopCanvas.focus({ preventScroll: true });
  desktopCanvas.setPointerCapture?.(event.pointerId);
  sendControl({ type: "pointer", ...pointerPosition(event) });
  const button = buttonName(event.button);
  if (button) sendControl({ type: "mouse", button, down: true });
});
desktopCanvas.addEventListener("pointerup", (event) => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  event.preventDefault();
  sendControl({ type: "pointer", ...pointerPosition(event) });
  const button = buttonName(event.button);
  if (button) sendControl({ type: "mouse", button, down: false });
});
desktopCanvas.addEventListener("pointercancel", () => sendControl({ type: "release" }));
desktopCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
desktopCanvas.addEventListener("wheel", (event) => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  event.preventDefault();
  sendControl({ type: "wheel", deltaY: event.deltaY });
}, { passive: false });

function shouldSendKey(event) {
  return socket?.readyState === WebSocket.OPEN &&
    document.activeElement === desktopCanvas && !event.code.startsWith("Meta");
}

window.addEventListener("keydown", (event) => {
  if (!shouldSendKey(event)) return;
  event.preventDefault();
  sendControl({ type: "key", code: event.code, down: true });
});
window.addEventListener("keyup", (event) => {
  if (!shouldSendKey(event)) return;
  event.preventDefault();
  sendControl({ type: "key", code: event.code, down: false });
});
window.addEventListener("blur", () => sendControl({ type: "release" }));
window.addEventListener("beforeunload", () => {
  if (socket?.readyState === WebSocket.OPEN) socket.close(1000, "Page closed");
});

setState("offline", "Ready to connect");
privateLinkToken = readPrivateLinkToken();
if (privateLinkToken) {
  document.body.classList.add("private-link-active");
  privateConnectButton.hidden = false;
  connect(privateLinkToken, gatewayInput.value);
}
