import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import handler from "./index.js";

type HeaderValue = string | number | readonly string[];

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("error", reject);
    req.on("end", () => {
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
  });
}

function createVercelLikeResponse(res: ServerResponse) {
  let statusCode = 200;
  return {
    setHeader(name: string, value: HeaderValue) {
      res.setHeader(name, value);
      return this;
    },
    status(code: number) {
      statusCode = code;
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      if (!res.headersSent) {
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(payload));
      return this;
    },
    end(payload?: unknown) {
      if (!res.headersSent) res.statusCode = statusCode;
      res.end(payload as string | undefined);
      return this;
    }
  };
}

const server = createServer(async (req, res) => {
  const body = await readBody(req);
  const vercelReq = Object.assign(req, {
    body,
    query: Object.fromEntries(new URL(req.url ?? "/", "http://localhost").searchParams),
    cookies: {}
  });
  await handler(vercelReq as never, createVercelLikeResponse(res) as never);
});

const port = Number(process.env.API_PORT ?? 3002);
server.listen(port, "0.0.0.0", () => {
  console.log(`Life OS API dev server listening on http://localhost:${port}`);
});
