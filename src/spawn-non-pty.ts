import { spawn as normalSpawn, ChildProcess } from "child_process";
import { Readable, Writable } from "stream";
import Defer from "@suchipi/defer";
import { sanitizers } from "./sanitizers";
import type { NonPtyRunContext } from "./run-context";
import { allInflightRunContexts } from "./all-inflight-run-contexts";
import { AwaitableBuffer } from "./awaitable-buffer";
import type { SpawnOptions } from "./spawn-options";

export function spawnNonPty(
  cmd: string,
  args: Array<string>,
  options: SpawnOptions,
  debugLog: (...msg: Array<any>) => void
): NonPtyRunContext {
  debugLog("in spawnNonPtyRunContext");

  let child: ChildProcess;
  let stdin: Writable;
  let stdout: Readable;
  let stderr: Readable;
  let running: boolean;

  const outputBuffer = new AwaitableBuffer();
  const eventDefers = {
    exit: new Defer<[code: number | null, signal: string | number | null]>(),
    error: new Defer<Error>(),
    spawn: new Defer<void>(),
    close: new Defer<[code: number | null, signal: string | number | null]>(),
  };

  const runContext: NonPtyRunContext = {
    pty: false,

    result: {
      stdout: "",
      stderr: "",
      code: null,
      error: null,
    },

    cleanResult() {
      return {
        ...runContext.result,
        stdout: sanitizers.reduce(
          (str, transformFn) => transformFn(str),
          runContext.result.stdout
        ),
        stderr: sanitizers.reduce(
          (str, transformFn) => transformFn(str),
          runContext.result.stderr
        ),
      };
    },

    // Placeholder; real value gets filled in below.
    completion: Promise.resolve(),

    outputContains(value) {
      debugLog(
        `Waiting for output to contain ${typeof value === "string" ? JSON.stringify(value) : String(value)}...`
      );
      return outputBuffer.request(value);
    },

    eventFired(eventName: "spawn" | "error" | "exit" | "close"): any {
      const defer = eventDefers[eventName];
      if (defer != null) {
        return defer.promise;
      }

      throw new Error(`Invalid event name: ${JSON.stringify(eventName)}`);
    },

    clearOutputContainsBuffer() {
      outputBuffer.clearContent();
    },

    write(data) {
      stdin.write(data);
    },

    close(stream) {
      switch (String(stream).toLowerCase()) {
        case "stdin": {
          if ("end" in stdin) {
            stdin.end();
          }
          break;
        }
        case "stdout": {
          stdout.destroy();
          break;
        }
        case "stderr": {
          stderr.destroy();
          break;
        }
        default: {
          throw new Error(
            `Invalid stream name: '${stream}'. Valid names are 'stdin', 'stdout', or 'stderr'.`
          );
        }
      }
    },

    kill(signal: NodeJS.Signals = "SIGINT") {
      if (running) {
        child.kill(signal);
      }
      child.unref();
    },
  };

  child = normalSpawn(cmd, args, options);
  stdin = child.stdin!;
  stdout = child.stdout!;
  stderr = child.stderr!;

  running = true;
  allInflightRunContexts.add(runContext);

  debugLog("setting up spawn event listener");
  child.on("spawn", () => {
    debugLog("'spawn' event");
    eventDefers.spawn?.resolve();
  });

  debugLog("setting stdout encoding to utf-8");
  stdout.setEncoding("utf-8");

  debugLog("setting up stdout data event listener");
  stdout.on("data", (data: string) => {
    debugLog("STDOUT: ", data);
    runContext.result.stdout += data;
    outputBuffer.addContent(data);
  });

  debugLog("setting stderr encoding to utf-8");
  stderr.setEncoding("utf-8");

  debugLog("setting up stderr data event listener");
  stderr.on("data", (data: string) => {
    debugLog("STDERR: ", data);
    runContext.result.stderr += data;
    outputBuffer.addContent(data);
  });

  const completionDefer = new Defer<void>();

  let hasClosed = false;
  let hasExited = false;

  const endings = {
    complete: () => {
      running = false;

      allInflightRunContexts.delete(runContext);
      completionDefer.resolve();
      outputBuffer.cancelRequests(
        (request) =>
          new Error(
            `Child process closed and exited before its output contained the requested content: ${request.value}`
          )
      );
    },
    fail: (error: Error) => {
      running = false;

      runContext.result.error = error;

      allInflightRunContexts.delete(runContext);
      completionDefer.reject(error);
      outputBuffer.cancelRequests(
        (request) =>
          new Error(
            `Child process errored before its output contained the requested content: ${request.value}`
          )
      );
    },
  };

  debugLog("setting up child close event listener");
  child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
    debugLog("'close' event", { code, signal });
    hasClosed = true;
    eventDefers.close?.resolve([code, signal]);

    if (code != null && runContext.result.code == null) {
      runContext.result.code = code;
    }

    if (hasExited) {
      endings.complete();
    }
  });

  debugLog("setting up child exit event listener");
  child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    debugLog("'exit' event", { code });
    hasExited = true;
    eventDefers.exit.resolve([code, signal]);

    if (code != null && runContext.result.code == null) {
      runContext.result.code = code;
    }

    if (hasClosed) {
      endings.complete();
    }
  });

  debugLog("setting up child error event listener");
  child.on("error", (error: Error & { code?: string }) => {
    debugLog("'error' event", { error });
    eventDefers.error?.resolve(error);

    if (typeof error === "object" && error !== null && error.code === "EIO") {
      // not real; process is about to exit
      debugLog("Ignoring spurious EIO error:", error);
      return;
    }

    endings.fail(error);
  });

  runContext.completion = completionDefer.promise;

  return runContext;
}
