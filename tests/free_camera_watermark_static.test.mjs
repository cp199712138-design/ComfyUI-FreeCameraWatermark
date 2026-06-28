import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
const frontend = fs.readFileSync(path.join(root, "js", "free_camera_watermark.js"), "utf8");
const backend = fs.readFileSync(path.join(root, "__init__.py"), "utf8");

assert.match(frontend, /addDOMWidget\(/, "frontend must use a DOM widget");
assert.match(frontend, /type\s*=\s*["']color["']/, "color picker must use native input[type=color]");
assert.doesNotMatch(frontend, /Object\.defineProperty\s*\(\s*widget\s*,\s*["']value["']/, "mode changes must not rely on redefining widget.value");
assert.doesNotMatch(frontend, /widget\.draw\s*=\s*\(/, "frontend must not hand draw controls inside a LiteGraph widget");
assert.doesNotMatch(frontend, /class\s+WatermarkTransformWidget/, "drag UI must not use the old canvas transform widget");
assert.match(frontend, /function\s+referenceImage/, "drag preview must prefer the connected input image");
assert.match(frontend, /origin_id/, "drag preview must inspect the linked upstream image node");

assert.match(backend, /"layout_json":\s*\("STRING"/, "backend must keep hidden layout_json state");
assert.match(backend, /"text_color":\s*\("STRING"/, "backend must keep text_color state");
assert.match(backend, /"text_opacity":\s*\("INT"/, "backend must keep text_opacity state");
assert.doesNotMatch(backend, /"preset":\s*\(/, "backend must not insert a preset widget before font_style");
assert.match(backend, /"pattern_color":/, "backend must keep legacy pattern_color slot to avoid old workflow widget offset");
assert.match(frontend, /"pattern_color"/, "frontend must hide the legacy pattern_color slot");
