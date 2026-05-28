import http from "node:http";

// Salesforce External Client Apps allow-list exact redirect URIs, so we register
// a small fixed set of loopback ports in the app and try them in order here.
const PORTS = [1717, 1718, 1719];
const CALLBACK_PATH = "/callback";

export interface Loopback {
  redirectUri: string;
  /** Resolve with the authorization code once Salesforce redirects back. */
  waitForCode(expectedState: string, timeoutMs?: number): Promise<string>;
  close(): void;
}

/** Start an ephemeral loopback HTTP server to catch the OAuth redirect. */
export async function startLoopback(): Promise<Loopback> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });
  let expectedState = "";

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    res.writeHead(error || !code || state !== expectedState ? 400 : 200, {
      "content-type": "text/html",
    });
    if (error) {
      res.end(page("Authorization failed", `Salesforce returned: ${escapeHtml(error)}.`));
      rejectCode(new Error(`OAuth error: ${error}`));
      return;
    }
    if (!code || state !== expectedState) {
      res.end(page("Authorization error", "State mismatch or missing authorization code."));
      rejectCode(new Error("State mismatch or missing authorization code"));
      return;
    }
    res.end(page("Connected", "Authorization complete — close this tab and return to your assistant."));
    resolveCode(code);
  });

  const port = await listenOnAny(server, PORTS);

  return {
    redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    waitForCode(state: string, timeoutMs = 300_000): Promise<string> {
      expectedState = state;
      const timeout = new Promise<string>((_, rej) =>
        setTimeout(() => rej(new Error("Timed out waiting for Salesforce authorization")), timeoutMs),
      );
      return Promise.race([codePromise, timeout]);
    },
    close: () => server.close(),
  };
}

function listenOnAny(server: http.Server, ports: number[]): Promise<number> {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = (): void => {
      if (i >= ports.length) {
        reject(new Error(`No free loopback port among ${ports.join(", ")}`));
        return;
      }
      const port = ports[i++];
      const onError = (e: NodeJS.ErrnoException): void => {
        if (e.code === "EADDRINUSE") {
          server.removeListener("error", onError);
          tryNext();
        } else {
          reject(e);
        }
      };
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", onError);
        resolve(port);
      });
    };
    tryNext();
  });
}

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1a1915">
<h1 style="font-size:1.4rem">${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
