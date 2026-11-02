"use server";

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { SCANNED_TOOLS } from "@/shared/constants/cliScanApps";

const execAsync = promisify(exec);

const resolveHome = (filePath) => {
  if (filePath === "~") return os.homedir();
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
};

const checkPathExists = async (targetPath) => {
  const resolved = resolveHome(targetPath);
  try {
    await fs.stat(resolved);
    return true;
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return false;
    }
    throw err;
  }
};

const checkWhich = async (binaryName) => {
  const isWindows = os.platform() === "win32";
  const command = isWindows ? `where ${binaryName}` : `which ${binaryName}`;
  const env = isWindows
    ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
    : process.env;
  try {
    const { stdout } = await execAsync(command, { windowsHide: true, env });
    const trimmed = stdout.trim();
    return trimmed ? trimmed.split(/\r?\n/)[0] : null;
  } catch (err) {
    if (err && (err.code === 1 || err.code === "ENOENT" || err.exitCode === 1)) {
      return null;
    }
    throw err;
  }
};

const checkRooExtensions = async () => {
  const extDir = resolveHome("~/.vscode/extensions");
  try {
    const entries = await fs.readdir(extDir);
    const match = entries.find((e) => e.toLowerCase().startsWith("roo"));
    return match ? path.join("~/.vscode/extensions", match) : null;
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return null;
    }
    throw err;
  }
};

const scanTool = async (toolDef) => {
  const evidence = [];
  try {
    switch (toolDef.id) {
      case "cursor": {
        for (const p of ["~/.cursor", "~/.config/Cursor", "~/.cursor/extensions"]) {
          if (await checkPathExists(p)) evidence.push(p);
        }
        const bin = await checkWhich("cursor");
        if (bin) evidence.push(bin);
        break;
      }
      case "codex": {
        if (await checkPathExists("~/.codex/config.toml")) {
          evidence.push("~/.codex/config.toml");
        }
        const bin = await checkWhich("codex");
        if (bin) evidence.push(bin);
        break;
      }
      case "cline": {
        if (await checkPathExists("~/.cline/data")) {
          evidence.push("~/.cline/data");
        }
        for (const p of [
          "~/.config/Code/User/globalStorage/saoudrizwan.claude-dev",
          "~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev",
        ]) {
          if (await checkPathExists(p)) {
            evidence.push(p);
            break;
          }
        }
        break;
      }
      case "roo": {
        const rooExt = await checkRooExtensions();
        if (rooExt) evidence.push(rooExt);
        for (const p of [
          "~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline",
          "~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline",
          "~/.config/Roo-Cline",
        ]) {
          if (await checkPathExists(p)) evidence.push(p);
        }
        break;
      }
      case "opencode": {
        if (await checkPathExists("~/.config/opencode/opencode.json")) {
          evidence.push("~/.config/opencode/opencode.json");
        }
        const bin = await checkWhich("opencode");
        if (bin) evidence.push(bin);
        break;
      }
      case "openclaw": {
        if (await checkPathExists("~/.openclaw/openclaw.json")) {
          evidence.push("~/.openclaw/openclaw.json");
        }
        const bin = await checkWhich("openclaw");
        if (bin) evidence.push(bin);
        break;
      }
      case "hermes": {
        if (await checkPathExists("~/.hermes/config.yaml")) {
          evidence.push("~/.hermes/config.yaml");
        }
        const bin = await checkWhich("hermes");
        if (bin) evidence.push(bin);
        break;
      }
      case "vscode": {
        for (const p of ["~/.vscode", "~/.config/Code", "~/Library/Application Support/Code"]) {
          if (await checkPathExists(p)) evidence.push(p);
        }
        const bin = await checkWhich("code");
        if (bin) evidence.push(bin);
        break;
      }
      default:
        break;
    }

    return {
      id: toolDef.id,
      name: toolDef.name,
      targets: toolDef.targets,
      detected: evidence.length > 0,
      evidence,
      error: null,
    };
  } catch (err) {
    return {
      id: toolDef.id,
      name: toolDef.name,
      targets: toolDef.targets,
      detected: false,
      evidence: [],
      error: err?.message || String(err),
    };
  }
};

export async function GET() {
  const results = await Promise.all(SCANNED_TOOLS.map((tool) => scanTool(tool)));
  return NextResponse.json({ results });
}
