import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

export async function browserTest(label, html, run, serve) {
  const artifacts = await mkdtemp(join(tmpdir(), `pulsecolor-${label}-`));
  const server = createServer(async (req, res) => {
    try {
      if (serve && (await serve(req, res))) return;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const chrome = spawn(
    process.env.CHROME_BIN || "/usr/bin/google-chrome-unstable",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--autoplay-policy=no-user-gesture-required",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(artifacts, "profile")}`,
      "--window-size=1280,720",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let socket;
  const pending = new Map();
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = "";
      const timer = setTimeout(
        () => reject(Error("Fixture browser startup timeout")),
        15000,
      );
      chrome.once("error", reject);
      chrome.stderr.on("data", (bytes) => {
        stderr += bytes;
        const found = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
        if (found) {
          clearTimeout(timer);
          resolve(found[1]);
        }
      });
    });
    const pages = await (
      await fetch(`http://${new URL(endpoint).host}/json/list`)
    ).json();
    socket = new WebSocket(
      pages.find((page) => page.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((resolve) =>
      socket.addEventListener("open", resolve, { once: true }),
    );
    let serial = 0;
    socket.addEventListener("message", (event) => {
      const response = JSON.parse(event.data),
        item = pending.get(response.id);
      if (!item) return;
      pending.delete(response.id);
      clearTimeout(item.timer);
      response.error
        ? item.reject(Error(JSON.stringify(response.error)))
        : item.resolve(response.result);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++serial,
          timer = setTimeout(() => {
            pending.delete(id);
            reject(Error(`${method} timeout`));
          }, 55000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const response = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (response.exceptionDetails)
        throw Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    const screenshot = async (name) => {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(
        join(artifacts, name + ".png"),
        Buffer.from(data, "base64"),
      );
    };
    await send("Page.navigate", {
      url: `http://127.0.0.1:${server.address().port}/`,
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await run({ evaluate, send, screenshot, artifacts });
    return artifacts;
  } finally {
    for (const item of pending.values()) clearTimeout(item.timer);
    socket?.close();
    chrome.kill("SIGTERM");
    await new Promise((resolve) => server.close(resolve));
  }
}
