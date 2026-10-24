import { startApp } from "./app";
import { loadEnv } from "./env";
import { errMessage, log } from "./log";

try {
  const app = await startApp(loadEnv());
  const shutdown = () => void app.stop().then(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (e) {
  log("server.fatal", { error: errMessage(e) });
  process.exit(1);
}
