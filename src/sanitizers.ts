import stripAnsi from "strip-ansi";
import { findRootDir } from "./find-root-dir";

function escapeRegex(str: string): string {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
}

interface ReplaceRootDir {
  (str: string): string;
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
