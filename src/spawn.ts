import type {
  NonPtyRunContext,
  PtyRunContext,
  RunContext,
} from "./run-context";
import type { SpawnOptions } from "./spawn-options";
import { spawnNonPty } from "./spawn-non-pty";
import { spawnPty } from "./spawn-pty";

/**
 * Start a child process and return a {@link RunContext} object to interact with
 * it. Function signature is the same as child_process spawn, except you can
 * pass `pty: true` in options to run the process in a psuedo-tty, and
 * `debug: true` to enable debug output.
 */
export function spawn(cmd: string): NonPtyRunContext;
export function spawn(cmd: string, args: Array<string>): NonPtyRunContext;
export function spawn(
  cmd: string,
  options: SpawnOptions & { pty: true }
): PtyRunContext;
export function spawn(cmd: string, options: SpawnOptions): NonPtyRunContext;
export function spawn(
  cmd: string,
  args: Array<string>,
  options: SpawnOptions & { pty: true }
): PtyRunContext;
export function spawn(
  cmd: string,
  args: Array<string>,
  options: SpawnOptions
): NonPtyRunContext;
export function spawn(
  cmd: string,
  argsOrOptions?: Array<string> | SpawnOptions,
  passedOptions?: SpawnOptions
): PtyRunContext | NonPtyRunContext {
  let args: Array<string>;
  let options: SpawnOptions;
  if (Array.isArray(argsOrOptions)) {
    args = argsOrOptions;
  } else if (typeof argsOrOptions === "object") {
    options = argsOrOptions;
  }
  if (passedOptions && !options!) {
    options = passedOptions;
  }
  if (!args!) {
    args = [];
  }
  if (!options!) {
    options = {};
  }

  const debug = options.debug ?? false;
  const debugLog = (...msg: Array<any>) => {
    if (debug) {
      console.log(...msg);
    }
  };

  if (options.pty) {
    return spawnPty(cmd, args, options, debugLog);
  } else {
    return spawnNonPty(cmd, args, options, debugLog);
  }
}
