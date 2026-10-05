import fs from 'node:fs';
import path from 'node:path';
import { deepMerge } from './config.js';
import { readJson } from './util.js';

// The style profile is the single machine-readable source of every taste parameter.
// base.json + <genre>.json + brief overrides. Same profile in -> same editing decisions out.
export function loadStyle(config, genre, overrides = []) {
  const base = readJson(path.join(config.stylesDir, 'base.json'));
  const genreFile = path.join(config.stylesDir, `${genre}.json`);
  if (!fs.existsSync(genreFile)) throw new Error(`No style profile for genre "${genre}" (expected ${genreFile})`);
  const genreStyle = readJson(genreFile);
  let style = deepMerge(base, genreStyle);
  style.flow.avoid = [...base.flow.avoid, ...(genreStyle.flow?.avoid_extra || [])];
  for (const o of overrides) style = setPath(style, o.param, o.value);
  style.genre = genre;
  return style;
}

function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  const out = structuredClone(obj);
  let cur = out;
  for (const key of keys.slice(0, -1)) {
    cur[key] = cur[key] && typeof cur[key] === 'object' ? cur[key] : {};
    cur = cur[key];
  }
  cur[keys.at(-1)] = value;
  return out;
}

export function actTargets(style, totalSeconds) {
  return style.acts.map((a) => ({ ...a, target_s: Math.round(a.share * totalSeconds) }));
}
