import "reflect-metadata";
import { ApiLambdaApp, AppConfig } from "ts-lambda-api";
import * as path from "path";
import { WebhooksController } from "./src/controllers/WebhooksController";

const appConfig = new AppConfig();
appConfig.openApi = { enabled: true };

const app = new ApiLambdaApp(
  [path.join(__dirname, "src", "controllers")],
  appConfig
);

/** Strip API Gateway REST API stage from path so lambda-api can match routes (e.g. /default/webhooks/mural -> /webhooks/mural). */
function normalizeApiGatewayPath(ev: Record<string, unknown>): void {
  const stage = ev.requestContext && typeof (ev.requestContext as Record<string, unknown>).stage === "string"
    ? (ev.requestContext as Record<string, unknown>).stage as string
    : null;
  if (!stage) return;
  const p = (ev.path ?? ev.rawPath) as string | undefined;
  if (typeof p !== "string") return;
  const prefix = `/${stage}/`;
  if (p === `/${stage}` || p.startsWith(prefix)) {
    (ev as Record<string, string>).path = p === `/${stage}` ? "/" : "/" + p.slice(prefix.length);
  }
}

/** Handle POST /webhooks/mural directly so it works even if framework routing doesn't register it. */
async function handleWebhookMural(event: Record<string, unknown>): Promise<{ statusCode: number; body: string; headers?: Record<string, string> }> {
  let statusCode = 200;
  const res = { status: (code: number) => { statusCode = code; } };
  let body: unknown = event.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      statusCode = 400;
      return { statusCode, body: JSON.stringify({ message: "Invalid JSON body" }), headers: { "Content-Type": "application/json" } };
    }
  }
  const controller = new WebhooksController();
  const result = await controller.mural(body as Parameters<WebhooksController["mural"]>[0], undefined, res);
  return {
    statusCode,
    body: JSON.stringify(result ?? { message: "OK" }),
    headers: { "Content-Type": "application/json" },
  };
}

function getMethod(ev: Record<string, unknown>): string | undefined {
  const m = ev.httpMethod;
  if (typeof m === "string") return m;
  const ctx = ev.requestContext as Record<string, unknown> | undefined;
  const http = ctx?.http as { method?: string } | undefined;
  return http?.method;
}

export const handler = async (event: unknown, context: unknown) => {
  const ev = event as Record<string, unknown>;
  if (ev && typeof ev === "object") {
    normalizeApiGatewayPath(ev);
    const pathStr = (ev.path ?? ev.rawPath) as string;
    const method = getMethod(ev);
    if (pathStr === "/webhooks/mural" && (method === "POST" || method === "post")) {
      return await handleWebhookMural(ev);
    }
  }
  return await app.run(event as import("ts-lambda-api").ApiRequest, context);
};
