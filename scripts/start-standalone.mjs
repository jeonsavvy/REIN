import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticSource = path.join(root, ".next", "static");
const staticTarget = path.join(standalone, ".next", "static");

if (!existsSync(path.join(standalone, "server.js"))) {
  throw new Error("Standalone build missing. Run `pnpm build` first.");
}
mkdirSync(path.dirname(staticTarget), { recursive: true });
cpSync(staticSource, staticTarget, { recursive: true, force: true });

const publicSource = path.join(root, "public");
if (existsSync(publicSource)) {
  cpSync(publicSource, path.join(standalone, "public"), {
    recursive: true,
    force: true,
  });
}

await import(pathToFileURL(path.join(standalone, "server.js")).href);
