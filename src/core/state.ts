import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

import type { StateStore } from "./types.js";

export class JsonFileStateStore implements StateStore {
  private readonly stateFilePath: string;
  private cache: Record<string, unknown> = {};

  constructor(stateFilePath: string) {
    this.stateFilePath = stateFilePath;
    try {
      const data = readFileSync(this.stateFilePath, "utf8");
      this.cache = JSON.parse(data) as Record<string, unknown>;
    } catch {
      this.cache = {};
    }
  }

  get<T = unknown>(key: string): T | undefined {
    return this.cache[key] as T | undefined;
  }

  set<T = unknown>(key: string, value: T): void {
    this.cache[key] = value as unknown;
  }

  delete(key: string): void {
    delete this.cache[key];
  }

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.cache, key);
  }

  async flush(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await fs.writeFile(this.stateFilePath, JSON.stringify(this.cache, null, 2));
  }
}
