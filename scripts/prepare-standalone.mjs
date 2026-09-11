import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

await mkdir(path.join(standaloneRoot, ".next"), { recursive: true });
await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneRoot, ".next", "static"),
  { recursive: true, force: true },
);
await cp(
  path.join(projectRoot, "public"),
  path.join(standaloneRoot, "public"),
  { recursive: true, force: true },
);

console.log("Standalone assets are ready.");
