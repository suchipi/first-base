export type Options = {
  cwd?: string;
  env?: { [varName: string]: any };
  argv0?: string;
  detached?: boolean;
  uid?: number;
  gid?: number;
  shell?: boolean | string;
  windowsVerbatimArguments?: boolean;
  windowsHide?: boolean;
  pty?: boolean;
};

export type RunContext = {
  result: {
    stdout: string;
    stderr: string;
    code: null | number;
    error: boolean;
  };
  /**
   * Same as {@link RunContext.result}, but with {@link sanitizers} run on
   * stdout/stderr.
   */
  cleanResult(): {
    stdout: string;
    stderr: string;
    code: null | number;
    error: boolean;
  };
  completion: Promise<void>;
  debug(): RunContext;
  outputContains(value: string | RegExp): Promise<void>;
  clearOutputContainsBuffer(): void;
  // TODO: Should be string | Buffer, but idk how to use Buffer since they might not be using node types
  write(data: any): void;
  close(stream: "stdin" | "stdout" | "stderr"): void;
  kill(signal?: string): void;
};

export const spawn: ((cmd: string) => RunContext) &
  ((cmd: string, args: Array<string>) => RunContext) &
  ((cmd: string, options: Options) => RunContext) &
  ((cmd: string, args: Array<string>, options: Options) => RunContext);

/**
 * An array of functions that will be run on stdout/stderr when calling
 * {@link RunContext.cleanResult}.
 *
 * By default, it contains 5 functions, which are run in order:
 *
 * - `stripAnsi`: Removes ANSI control characters
 * - `replaceRootDir`: Replaces eg `/home/suchipi/Code/first-base/src/index.js` with `<rootDir>/src/index.js`
 *   - This function searches upwards for the root dir using a heuristic, and caches results in the {@link Map} `replaceRootDir.cache`.
 *   - The heuristic is:
 *     - Look upwards for a folder containing `.git` or `.hg`
 *     - if none is found, look upwards for a folder containing `package-lock.json`, `.gitignore` or `.hgignore`,
 *     - if none is found, look upwards for a folder containing `package.json` or `README.md`
 *     - if none is found, consider the present working directory to be the root dir.
 * - `replaceCwd`: Replaces the current working directory with `<cwd>`
 * - `collapseStackTrace`: For Node.JS-style stack traces, replaces the long chain of "at ..." lines with a single "at somewhere" line
 * - `omitThrowLineNumber`: For Node.JS error source display, removes the line number
 *
 * You can remove them or replace them or add to them by mutating the `sanitizers` Array.
 */
export const sanitizers: Array<(str: string) => string>;
