import { promises as fs } from "node:fs";
import { createApp } from "./app";
import { scheduleCleanup } from "./cleanup";
import { config } from "./config";

await fs.mkdir(config.rendersDir, { recursive: true });
await fs.mkdir(config.workDir, { recursive: true });

scheduleCleanup();

createApp().listen(config.port, config.host, () => {
  console.log(`AppReklami video engine listening on http://localhost:${config.port}`);
});
