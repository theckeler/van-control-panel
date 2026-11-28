// Stops a change that makes the van's Pi do noticeably more work, unless
// someone raised the limit on purpose. It runs on a dev machine or on GitHub,
// never on the Pi, and uses nothing but Node itself.
//
//   npm --prefix frontend run build && node checks/cost.mjs
//
// It cannot see the Pi's processor, memory or power use. Only before and after
// readings on the Pi show those.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

// An optional folder argument checks a copy of the repo, to test this script.
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, ".."));
const { LIMITS } = await import(pathToFileURL(join(root, "checks/limits.mjs")));

const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function check(name, value, limit, unit) {
  const shown = `${name}: ${value}${unit}`;
  if (limit === null) {
    console.log(`  no limit  ${shown}`);
  } else if (value > limit) {
    console.log(`  FAIL      ${shown}, limit ${limit}${unit}`);
    failures.push(name);
  } else {
    console.log(`  ok        ${shown}, limit ${limit}${unit}`);
  }
}

// 1. Size of what the Pi builds and serves, compressed.
const assets = join(root, "frontend/dist/assets");
if (!existsSync(assets)) {
  console.error("No build found. Run: npm --prefix frontend run build");
  process.exit(1);
}
const newest = (paths) => Math.max(...paths.map((p) => statSync(p).mtimeMs));
const sources = [
  ...filesUnder(join(root, "frontend/src")),
  join(root, "frontend/index.html"),
];
if (newest(sources) > newest(filesUnder(assets))) {
  console.error("The build is older than the source. Build again first.");
  process.exit(1);
}
const compressedKb = (extension) => {
  const files = filesUnder(assets).filter((f) => f.endsWith(extension));
  if (files.length === 0) throw new Error(`No ${extension} files in the build`);
  const bytes = files.reduce((sum, f) => sum + gzipSync(readFileSync(f)).length, 0);
  return Math.round(bytes / 100) / 10;
};
check("JavaScript, compressed", compressedKb(".js"), LIMITS.javascriptKb, " KB");
check("CSS, compressed", compressedKb(".css"), LIMITS.cssKb, " KB");

// 2. Requests in each dashboard update. Fails if the list can't be found, so
// a rewrite of the store can't quietly switch this check off.
const list = read("frontend/src/store/van.ts").match(
  /const polls\b[\s\S]*?= \[\n([\s\S]*?)\n\s*\];/,
);
const polls = list ? [...list[1].matchAll(/^\s*\["\w+",/gm)].length : 0;
if (polls === 0) {
  console.log("  FAIL      Could not find the `polls` list in store/van.ts");
  failures.push("poll list");
} else {
  check("Requests per dashboard update", polls, LIMITS.pollRequests, "");
}

// 3. Packages. Each one is installed on the Pi, so each needs approval.
const approved = JSON.parse(read("checks/packages.json"));
const pkg = JSON.parse(read("frontend/package.json"));
const installed = {
  frontend: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }),
  backend: read("backend/requirements.txt")
    .split("\n")
    .map((line) => line.split("#")[0].trim())
    .filter(Boolean)
    .map((line) => line.split(/[[<>=~!; ]/)[0].toLowerCase()),
};
for (const [side, names] of Object.entries(installed)) {
  const added = names.filter((name) => !approved[side].includes(name));
  if (added.length > 0) {
    console.log(`  FAIL      New ${side} packages: ${added.join(", ")}`);
    failures.push(`${side} packages`);
  } else {
    console.log(`  ok        ${side} packages: ${names.length}, none new`);
  }
}

if (failures.length > 0) {
  console.error(`\nOver budget: ${failures.join("; ")}.`);
  console.error("Trim the change, or ask Todd to raise the limit in checks/.");
  process.exit(1);
}
