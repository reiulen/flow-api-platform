import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, ensureDir, nowIso } from './util.js';
import { parse } from './contracts.js';
import { loadStyle } from './style.js';

export class Project {
  constructor(config, projectId) {
    this.config = config;
    this.id = projectId;
    this.dir = path.join(config.projectsDir, projectId);
  }

  static create(config, brief) {
    const project = new Project(config, brief.project_id);
    if (fs.existsSync(project.file('brief.json'))) throw new Error(`Project already exists: ${brief.project_id}`);
    ensureDir(project.dir);
    project.write('brief.json', brief);
    project.write('state.json', { project_id: brief.project_id, created_at: nowIso(), stages: {}, gates: {}, status: 'new' });
    return project;
  }

  static open(config, projectId) {
    const project = new Project(config, projectId);
    if (!fs.existsSync(project.file('brief.json'))) throw new Error(`Unknown project: ${projectId}`);
    return project;
  }

  file(...parts) { return path.join(this.dir, ...parts); }
  subdir(name) { return ensureDir(this.file(name)); }
  has(name) { return fs.existsSync(this.file(name)); }
  read(name, schema, fallback) {
    const value = readJson(this.file(name), fallback);
    return schema && value !== undefined ? parse(schema, value, name) : value;
  }
  write(name, value, schema) {
    const data = schema ? parse(schema, value, name) : value;
    writeJson(this.file(name), data);
    return data;
  }

  get brief() { return this.read('brief.json'); }
  get state() { return this.read('state.json'); }
  saveState(state) { this.write('state.json', state); }

  style() {
    if (!this._style) this._style = loadStyle(this.config, this.brief.genre, this.brief.overrides || []);
    return this._style;
  }

  log(event, data = {}) {
    fs.appendFileSync(this.file('log.jsonl'), `${JSON.stringify({ at: nowIso(), event, ...data })}\n`);
  }
}
