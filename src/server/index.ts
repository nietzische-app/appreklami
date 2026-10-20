import { promises as fs } from "node:fs";
import { createApp } from "./app";
import { config } from "./config";

await fs.mkdir(config.rendersDir, { recursive: true });
await fs.mkdir(config.workDir, { recursive: true });

createApp().listen(config.port, () => {
  console.log(`AppReklami video engine listening on http://localhost:${config.port}`);
});
