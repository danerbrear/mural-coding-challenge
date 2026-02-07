import "reflect-metadata";
import { ApiLambdaApp, AppConfig } from "ts-lambda-api";
import * as path from "path";

const appConfig = new AppConfig();
appConfig.openApi = { enabled: true };

const app = new ApiLambdaApp(
  [path.join(__dirname, "src", "controllers")],
  appConfig
);

export const handler = async (event: unknown, context: unknown) => {
  return await app.run(event as import("ts-lambda-api").ApiRequest, context);
};
