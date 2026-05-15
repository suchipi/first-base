import type { sanitizers } from "./sanitizers";

export type PtyRunContextResult = {
  /** All of the output the process has written so far (pty mode combines stdout and stderr). */
  output: string;
  /** Exit status code, if the process has finished. */
  code: null | number;
  /** If the process errored out (ie. failed to spawn, etc), this will be the Error. */
  error: null | Error;
};

export type PtyRunContext = {
  /** Outputs of the running or completed process. */
  result: PtyRunContextResult;
  /** Returns a version of {@link PtyRunContext["result"]} with all the {@link sanitizers} run over it. */
  cleanResult(): PtyRunContextResult;
  /**
   * Resolves after the node-pty process's "onExit" callback is called.
   */
  completion: Promise<void>;

  /**
   * Returns a Promise that resolves once the child process output
   * (combined stdout and stderr) contains the passed string or
   * matches the passed RegExp. Ignores ansi control characters.
   */
  outputContains(value: string | RegExp): Promise<void>;
  /**
   * Call this to reset the buffer used by the process's `outputContains`
   * tracking. This is needed if you want to wait for the same output to appear
   * a second time.
   */
  clearOutputContainsBuffer(): void;

  /** Call this to write to the child's stdin. */
  write(data: string | Buffer): void;

  /**
   * Call this function to send a signal to the child process.
   * You can pass "SIGTERM", "SIGKILL", etc. Defaults to "SIGINT".
   */
  kill(signal?: NodeJS.Signals): void;

  /** Indicates that the process was spawned in a pseudo-tty. */
  pty: true;
};

export type NonPtyRunContextResult = {
  /** All of the stdout the process has written so far. */
  stdout: string;
  /** All of the stderr the process has written so far. */
  stderr: string;
  /** Exit status code, if the process has finished. */
  code: null | number;
  /** If the process errored out (ie. failed to spawn, etc), this will be the Error. */
  error: null | Error;
};

export type NonPtyRunContext = {
  /** Outputs of the running or completed process. */
  result: NonPtyRunContextResult;

  /** Returns a version of {@link NonPtyRunContext["result"]} with all the {@link sanitizers} run over it. */
  cleanResult(): NonPtyRunContextResult;

  /**
   * Resolves after the child process has emitted its "exit" event AND its
   * "close" event.
   */
  completion: Promise<void>;

  /**
   * Resolves after the first time the child process emits the corresponding
   * event.
   */
  eventFired(eventName: "spawn"): Promise<void>;
  eventFired(eventName: "error"): Promise<Error & { code?: string }>;
  eventFired(
    eventName: "exit"
  ): Promise<[code: number | null, signal: NodeJS.Signals | null]>;
  eventFired(
    eventName: "close"
  ): Promise<[code: number | null, signal: NodeJS.Signals | null]>;

  /**
   * Returns a Promise that resolves once the child process output
   * (combined stdout and stderr) contains the passed string or
   * matches the passed RegExp. Ignores ansi control characters.
   */
  outputContains(value: string | RegExp): Promise<void>;
  /**
   * Call this to reset the buffer used by the process's `outputContains`
   * tracking. This is needed if you want to wait for the same output to appear
   * a second time.
   */
  clearOutputContainsBuffer(): void;

  /** Call this to write to the child's stdin. */
  write(data: string | Buffer): void;

  /** Call this to close one of the child process's stdio streams. */
  close(stream: "stdin" | "stdout" | "stderr"): void;

  /**
   * Call this function to send a signal to the child process.
   * You can pass "SIGTERM", "SIGKILL", etc. Defaults to "SIGINT".
   */
  kill(signal?: NodeJS.Signals): void;

  /** Indicates that the process was NOT spawned in a pseudo-tty. */
  pty: false;
};

export type RunContext<IsPty extends boolean = boolean> = IsPty extends true
  ? PtyRunContext
  : IsPty extends false
    ? NonPtyRunContext
    : PtyRunContext | NonPtyRunContext;
