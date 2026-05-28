import http from "node:http";

// The OAuth redirect_uri is a web relay page (real HTTPS, no cert warning) that
// forwards the auth code to this loopback server over http://127.0.0.1, which
// browsers allow with no cert warning. On completion we 302 the browser back to
// the relay so the user lands on a branded success/error page.
const PORTS = [1717, 1718, 1719];
const CALLBACK_PATH = "/callback";

export interface Loopback {
  /** The bound loopback port (encoded into `state` so the relay knows where to forward). */
  port: number;
  /** Resolve with the authorization code once the relay forwards it here. */
  waitForCode(expectedState: string, timeoutMs?: number): Promise<string>;
  close(): void;
}

export async function startLoopback(opts: { redirectBack: string }): Promise<Loopback> {
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
    const ok = !error && !!code && state === expectedState;

    // Bounce the browser back to the relay for a branded final page.
    const dest = ok
      ? `${opts.redirectBack}?status=done`
      : `${opts.redirectBack}?status=error&reason=${encodeURIComponent(error || "state_mismatch")}`;
    res.writeHead(302, { location: dest });
    res.end();

    if (error) {
      rejectCode(new Error(`OAuth error: ${error}`));
      return;
    }
    if (!ok) {
      rejectCode(new Error("State mismatch or missing authorization code"));
      return;
    }
    resolveCode(code!);
  });

  const port = await listenOnAny(server, PORTS);

  return {
    port,
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
