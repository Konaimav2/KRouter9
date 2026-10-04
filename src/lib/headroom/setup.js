import {
  findHeadroomBinary,
  findPython310,
  probeProxyRunning,
  isLoopbackHeadroomUrl,
} from "./detect.js";
import { getManagedPid } from "./process.js";

// Aggregate one-click setup state for the dashboard Headroom setup button.
// Read-only: composes existing detect/process helpers, no installs or spawns.
//
// action: "none" (running — setup/start must render disabled, re-click is a
//   no-op) | "start" (installed locally, one click starts) | "setup"
//   (not installed or non-local URL — show setup guidance).
export async function getHeadroomSetupState(url) {
  const installed = Boolean(findHeadroomBinary());
  const python = findPython310();
  const running = await probeProxyRunning(url);
  const localUrl = isLoopbackHeadroomUrl(url);
  const managedPid = getManagedPid();

  let action;
  if (running) action = "none";
  else if (installed && localUrl) action = "start";
  else action = "setup";

  return {
    installed,
    python,
    running,
    localUrl,
    managedPid,
    canStart: installed && localUrl && !running,
    // Setup flow (guidance + one-click start once installed) is available for
    // local URLs whenever the proxy is not running. Missing python/binary
    // surfaces as an error on action, never as a dead button.
    canOneClickSetup: localUrl && !running,
    action,
    setupDisabled: running,
    startDisabled: running || !(installed && localUrl),
  };
}
