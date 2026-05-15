import stripAnsi from "strip-ansi";
import { findRootDir } from "./find-root-dir";

function escapeRegex(str: string): string {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
}

export interface ReplaceRootDir {
  (str: string): string;
  /**
   * If you want to bypass the builtin "find root dir" logic used by the
   * replaceRootDir sanitizer, you can run:
   *
   * ```ts
   * const replaceRootDir = sanitizers.find(fn => fn.name === "replaceRootDir");
   * replaceRootDir.cache.set(process.cwd(), "/home/me/my-project");
   * ```
   *
   * If `process.cwd()` changes during the course of a test run, you'll need to
   * add cache entries for the other locations, too. If that's too inconvenient,
   * you're welcome to remove replaceRootDir from the sanitizers array and
   * optionally replace it with your own implementation.
   */
  cache: Map<string, string>;
}

const replaceRootDir: ReplaceRootDir = Object.assign(
  function _replaceRootDir(str: string): string {
    const here = process.cwd();
    const rootDir = replaceRootDir.cache.get(here) || findRootDir(here);
    replaceRootDir.cache.set(here, rootDir);

    return str.replace(new RegExp(escapeRegex(rootDir), "g"), "<rootDir>");
  },
  {
    cache: new Map<string, string>(),
  }
);

// Minifier protection so the above documented code snippet remains possible
Object.defineProperty(replaceRootDir, "name", {
  configurable: true,
  enumerable: false,
  writable: false,
  value: "replaceRootDir",
});

export const sanitizers: Array<(str: string) => string> = [
  stripAnsi,
  replaceRootDir,
  function replaceCwd(str: string): string {
    return str.replace(new RegExp(escapeRegex(process.cwd()), "g"), "<cwd>");
  },
  function collapseStackTrace(str: string): string {
    return (
      str
        // replace stack trace lines with a single "at somewhere" line
        // explanation of regexp:
        //   newline, optional ansi escape, zero or more whitespace(s), "at",
        //   whitespace(s), several non-newline characters... and that whole
        //   thing can happen more than once
        .replaceAll(
          /(?:\n(?:\x1B\[\d+m)?(\s*)at\s+[^\n]+)+/g,
          "\n$1at somewhere"
        )
    );
  },
  function omitThrowLineNumber(str: string): string {
    // omit line number from eg. "<rootDir>/dist/match.js:57\n\t\t\t\tthrow"
    return str.replaceAll(/(\.js):\d+(\s+throw)/g, "$1$2");
  },
];
