const WEB_ORIGIN = "https://web.parsec.app";
const PROXY_PREFIX = "/_parsec_kem_proxy";
const HEALTH_PATH = "/_parsec_kem_health";

const CLIENT_PROXY_HELPER = String.raw`
function mty_parsec_kem_proxy_url(input, websocket) {
	try {
		const target = new URL(input, window.location.href);
		const host = target.hostname.toLowerCase();
		const isParsec = host === 'parsec.app' ||
			host.endsWith('.parsec.app') ||
			host === 'parsec.gg' ||
			host.endsWith('.parsec.gg') ||
			host === 'parsecusercontent.com' ||
			host.endsWith('.parsecusercontent.com');

		if (!isParsec || target.origin === window.location.origin)
			return target.toString();

		const endpoint = new URL('/_parsec_kem_proxy', window.location.origin);
		endpoint.searchParams.set('url', target.toString());
		if (websocket)
			endpoint.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

		return endpoint.toString();
	} catch (error) {
		console.error('Parsec route error', error);
		return input;
	}
}
`;

function isAllowedParsecHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "parsec.app" ||
    host.endsWith(".parsec.app") ||
    host === "parsec.gg" ||
    host.endsWith(".parsec.gg") ||
    host === "parsecusercontent.com" ||
    host.endsWith(".parsecusercontent.com");
}

function filteredRequestHeaders(request, target) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ipcountry");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");
  headers.set("origin", `${target.protocol === "wss:" ? "https:" : target.protocol}//${target.host}`);
  headers.set("referer", `${WEB_ORIGIN}/`);
  return headers;
}

function responseHeaders(upstream, contentType = "") {
  const headers = new Headers(upstream.headers);
  headers.delete("content-length");
  headers.delete("content-security-policy-report-only");
  headers.delete("report-to");
  headers.delete("nel");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-embedder-policy", "require-corp");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("referrer-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");

  if (contentType.includes("text/html")) {
    headers.set("cache-control", "no-store");
    headers.set("content-security-policy", "frame-ancestors 'self'");
  }

  return headers;
}

async function proxyParsecRequest(request, requestUrl) {
  const rawTarget = requestUrl.searchParams.get("url");
  if (!rawTarget) {
    return new Response("Missing Parsec target", { status: 400 });
  }

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return new Response("Invalid Parsec target", { status: 400 });
  }

  if (!isAllowedParsecHost(target.hostname) || !["https:", "wss:"].includes(target.protocol)) {
    return new Response("Target is not a Parsec service", { status: 403 });
  }

  const isWebSocket = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  if (isWebSocket && target.protocol === "wss:") {
    target.protocol = "https:";
  }

  const init = {
    method: request.method,
    headers: filteredRequestHeaders(request, target),
    redirect: "manual"
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  const upstream = await fetch(new Request(target.toString(), init));
  if (upstream.status === 101 || upstream.webSocket) {
    return upstream;
  }

  const headers = responseHeaders(upstream, upstream.headers.get("content-type") || "");
  const location = headers.get("location");
  if (location) {
    const redirected = new URL(location, target);
    if (isAllowedParsecHost(redirected.hostname)) {
      const local = new URL(PROXY_PREFIX, requestUrl.origin);
      local.searchParams.set("url", redirected.toString());
      headers.set("location", local.toString());
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}

async function serveParsecWebApp(request, requestUrl) {
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, WEB_ORIGIN);
  const upstream = await fetch(new Request(upstreamUrl, {
    method: request.method,
    headers: filteredRequestHeaders(request, upstreamUrl),
    redirect: "manual"
  }));

  const contentType = upstream.headers.get("content-type") || "";
  const headers = responseHeaders(upstream, contentType);

  if (requestUrl.pathname === "/lib/matoya.js" && upstream.ok) {
    let source = await upstream.text();
    source = `${CLIENT_PROXY_HELPER}\n${source}`;
    source = source.replace(
      "async function mty_http_request(url, method, headers, body, buf) {",
      "async function mty_http_request(url, method, headers, body, buf) {\n\turl = mty_parsec_kem_proxy_url(url, false);"
    );
    source = source.replace(
      "async function mty_ws_connect(url) {",
      "async function mty_ws_connect(url) {\n\turl = mty_parsec_kem_proxy_url(url, true);"
    );
    headers.set("content-type", "application/javascript; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(source, { status: upstream.status, headers });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers
  });
}

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (requestUrl.pathname === HEALTH_PATH) {
      return Response.json({
        ready: true,
        app: "official-parsec-web-client",
        source: WEB_ORIGIN,
        screenshotStream: false
      }, {
        headers: { "cache-control": "no-store" }
      });
    }

    try {
      if (requestUrl.pathname === PROXY_PREFIX) {
        return await proxyParsecRequest(request, requestUrl);
      }
      return await serveParsecWebApp(request, requestUrl);
    } catch (error) {
      return Response.json({
        ready: false,
        error: "Parsec upstream is unavailable",
        detail: error instanceof Error ? error.message : String(error)
      }, {
        status: 502,
        headers: { "cache-control": "no-store" }
      });
    }
  }
};
