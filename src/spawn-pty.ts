import type { IPty, IDisposable } from "@lydell/node-pty";
import Defer from "@suchipi/defer";
import { sanitizers } from "./sanitizers";
import type { PtyRunContext } from "./run-context";
import { allInflightRunContexts } from "./all-inflight-run-contexts";
import { AwaitableBuffer } from "./awaitable-buffer";
import type { SpawnOptions } from "./spawn-options";

export function spawnPty(
  cmd: string,
  args: Array<string>,
  options: SpawnOptions,
  debugLog: (...msg: Array<any>) => void
): PtyRunContext {
  debugLog("in spawnPtyRunContext");

  let child: IPty;
  let running: boolean;

  const outputBuffer = new AwaitableBuffer();
  const disposables: Array<IDisposable> = [];

  const runContext: PtyRunContext = {
    pty: true,

    result: {
      output: "",
      code: null,
      error: null,
    },

    cleanResult() {
      return {
        ...runContext.result,
        output: sanitizers.reduce(
          (str, transformFn) => transformFn(str),
          runContext.result.output
        ),
      };
    },

    // Placeholder; actual value gets filled in below.
    completion: Promise.resolve(),

    outputContains(value) {
      debugLog(
        `Waiting for output to contain ${typeof value === "string" ? JSON.stringify(value) : String(value)}...`
      );
      return outputBuffer.request(value);
    },

    clearOutputContainsBuffer() {
      outputBuffer.clearContent();
    },

    write(data) {
      child.write(data);
    },

    kill(signal: NodeJS.Signals = "SIGINT") {
      if (running) {
        child.kill(signal);
      }
    },
  };

  const ptySpawn: typeof import("@lydell/node-pty").spawn =
    require("@lydell/node-pty").spawn;
  const ptyChild = ptySpawn(cmd, args, options);
  child = ptyChild;

  running = true;
  allInflightRunContexts.add(runContext);

  debugLog("using 'onData' method to listen for child data event");
  disposables.push(
    child.onData((data: string) => {
      debugLog(`OUTPUT: ${data.toString()}`);
      runContext.result.output += data;
      outputBuffer.addContent(data);
    })
  );

  const completionDefer = new Defer<void>();

  debugLog("using 'onExit' method to listen for child exit event");
  disposables.push(
    child.onExit(
      ({ exitCode, signal }: { exitCode: number; signal?: number }) => {
        debugLog("onExit", { exitCode, signal });

        if (exitCode != null) {
          runContext.result.code = exitCode;
        }

        running = false;
        allInflightRunContexts.delete(runContext);
        for (const disposable of disposables) {
          disposable.dispose();
        }

        completionDefer.resolve();
        outputBuffer.cancelRequests(
          (request) =>
            new Error(
              `Child process exited before its output contained the requested content: ${request.value}`
            )
        );
      }
    )
  );

  runContext.completion = completionDefer.promise;

  return runContext;
}
