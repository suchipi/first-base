const fs = require("fs");
const { Path } = require("nice-path");

const strongRootDirIndicators = [".git", ".hg"];

const weakRootDirIndicators = ["package-lock.json", ".gitignore", ".hgignore"];

const veryWeakRootDirIndicators = ["package.json", "README.md"];

function hasFile(dir, filename) {
  const fullPath = dir.concat(filename).toString();
  console.log(`checking for ${fullPath}`);
  try {
    return fs.existsSync(fullPath);
  } catch (err) {
    return false;
  }
}

function findRootDir(startingDir) {
  const start = new Path(startingDir).normalize();

  const searchDirs = [start];
  let currentPath = start.replaceLast([]);
  while (currentPath.segments.length > 0) {
    searchDirs.push(currentPath);
    currentPath = currentPath.replaceLast([]);
  }

  for (const dir of searchDirs) {
    for (const indicator of strongRootDirIndicators) {
      if (hasFile(dir, indicator)) {
        return dir.toString();
      }
    }
  }

  for (const dir of searchDirs) {
    for (const indicator of weakRootDirIndicators) {
      if (hasFile(dir, indicator)) {
        return dir.toString();
      }
    }
  }

  for (const dir of searchDirs) {
    for (const indicator of veryWeakRootDirIndicators) {
      if (hasFile(dir, indicator)) {
        return dir.toString();
      }
    }
  }

  return start.toString();
}

module.exports = { findRootDir };
