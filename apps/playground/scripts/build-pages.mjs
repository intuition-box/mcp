import { existsSync, renameSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const appDir = process.cwd();
const apiDir = join(appDir, "app", "api");
const backupDir = join(appDir, ".pages-api-backup");

let apiMoved = false;

try {
  if (existsSync(backupDir)) {
    rmSync(backupDir, { recursive: true, force: true });
  }

  if (existsSync(apiDir)) {
    renameSync(apiDir, backupDir);
    apiMoved = true;
  }

  execSync("next build", {
    stdio: "inherit",
    env: {
      ...process.env,
      GITHUB_PAGES: "true",
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY || "local/local",
    },
  });
} finally {
  if (apiMoved && existsSync(backupDir)) {
    renameSync(backupDir, apiDir);
  }
}
