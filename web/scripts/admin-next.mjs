import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const command = process.argv[2] ?? "dev";
const nextBin = fileURLToPath(
  new URL("../node_modules/next/dist/bin/next", import.meta.url),
);
const args = [nextBin, command];
if (command === "dev" || command === "start") {
  args.push("-p", process.env.ADMIN_PORT ?? "3001");
}

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    PORTAL_MODE: "admin",
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? "http://localhost:3000",
    ADMIN_PORTAL_URL: process.env.ADMIN_PORTAL_URL ?? "http://localhost:3001",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code) => {
  process.exitCode = code ?? 0;
});
