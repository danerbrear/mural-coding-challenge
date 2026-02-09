import "reflect-metadata";
import { ApiLambdaApp, AppConfig } from "ts-lambda-api";
import * as path from "path";

const appConfig = new AppConfig();
appConfig.name = "Mural Marketplace API";
appConfig.version = "1.0.0";
appConfig.openApi = { enabled: true };

const app = new ApiLambdaApp(
  [path.join(__dirname, "src", "controllers")],
  appConfig
);

/** Strip API Gateway REST API stage from path so routes match (e.g. /default/webhooks/mural -> /webhooks/mural). */
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

export const handler = async (event: unknown, context: unknown) => {
  const ev = event as Record<string, unknown>;
  if (ev && typeof ev === "object") {
    normalizeApiGatewayPath(ev);
  }
  return await app.run(event as import("ts-lambda-api").ApiRequest, context);
};
