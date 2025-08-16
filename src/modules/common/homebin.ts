import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ApplyResult,
  ConfigurationModule,
  PlanResult,
  StatusResult,
} from "../../core/types.js";
import { addPathContribution } from "../../core/contrib.js";

/**
 * Configuration module to ensure ~/bin directory exists and is included in the user's PATH.
 * Handles planning, applying, and status checking for the home bin directory.
 */
export const homeBinModule: ConfigurationModule = {
  id: "common:homebin",
  description: "Ensure ~/bin directory exists and on PATH",

  async isApplicable(_ctx) {
    return true;
  },

  async plan(ctx): Promise<PlanResult> {
    const target = path.join(ctx.homeDir, "bin");
    addPathContribution(ctx, { path: target, prepend: true });
    let exists = false;
    try {
      const st = await fs.stat(target);
      exists = st.isDirectory();
    } catch {
      exists = false;
    }
    return {
      changes: exists ? [] : [{ summary: `Create directory ${target}` }],
    };
  },

  async apply(ctx): Promise<ApplyResult> {
    const target = path.join(ctx.homeDir, "bin");
    try {
      await fs.mkdir(target, { recursive: true });
      return { success: true, changed: true, message: `Ensured ${target}` };
    } catch (error) {
      return { success: false, error };
    }
  },

  async status(ctx): Promise<StatusResult> {
    const target = path.join(ctx.homeDir, "bin");
    try {
      const st = await fs.stat(target);
      if (st.isDirectory()) return { status: "applied" };
    } catch {}
    return { status: "stale" };
  },
};
