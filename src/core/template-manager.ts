import { promises as fs } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";
import { getProjectRoot } from "./module-helpers.js";

export interface TemplateContext {
  [key: string]: string | number | boolean | object;
}

export class TemplateManager {
  private templateCache = new Map<string, HandlebarsTemplateDelegate>();
  private partialCache = new Map<string, string>();

  /**
   * Load a template from a module's resources directory
   */
  async loadTemplate(
    modulePath: string,
    templateName: string,
  ): Promise<HandlebarsTemplateDelegate> {
    const cacheKey = `${modulePath}:${templateName}`;

    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    const projectRoot = getProjectRoot();
    const fullPath = path.join(
      projectRoot,
      "src",
      "modules",
      modulePath,
      "resources",
      templateName,
    );
    const content = await fs.readFile(fullPath, "utf8");

    const template = Handlebars.compile(content);
    this.templateCache.set(cacheKey, template);
    return template;
  }

  /**
   * Load a partial template from a module's resources directory
   */
  async loadPartial(modulePath: string, partialName: string): Promise<string> {
    const cacheKey = `${modulePath}:${partialName}`;

    if (this.partialCache.has(cacheKey)) {
      return this.partialCache.get(cacheKey)!;
    }

    const projectRoot = getProjectRoot();
    const fullPath = path.join(
      projectRoot,
      "src",
      "modules",
      modulePath,
      "resources",
      partialName,
    );
    const content = await fs.readFile(fullPath, "utf8");

    this.partialCache.set(cacheKey, content);
    return content;
  }

  /**
   * Register a partial template
   */
  registerPartial(name: string, content: string): void {
    Handlebars.registerPartial(name, content);
  }

  /**
   * Register a helper function
   */
  registerHelper(name: string, helper: Handlebars.HelperDelegate): void {
    Handlebars.registerHelper(name, helper);
  }

  /**
   * Render a template with the given context
   */
  render(
    template: HandlebarsTemplateDelegate,
    context: TemplateContext,
  ): string {
    return template(context);
  }

  /**
   * Load and render a template with the given context
   */
  async loadAndRender(
    modulePath: string,
    templateName: string,
    context: TemplateContext,
  ): Promise<string> {
    // Load module partials first
    await this.loadModulePartials(modulePath);

    const template = await this.loadTemplate(modulePath, templateName);
    return this.render(template, context);
  }

  /**
   * Load and register all partials for a module
   */
  async loadModulePartials(modulePath: string): Promise<void> {
    try {
      const projectRoot = getProjectRoot();
      const resourcesPath = path.join(
        projectRoot,
        "src",
        "modules",
        modulePath,
        "resources",
      );
      const files = await fs.readdir(resourcesPath);

      for (const file of files) {
        if (file.endsWith(".hbs") && file !== "starship.toml.hbs") {
          const partialName = path.basename(file, ".hbs");
          const partialContent = await this.loadPartial(modulePath, file);
          this.registerPartial(partialName, partialContent);
        }
      }
    } catch (error) {
      // Ignore errors if resources directory doesn't exist
    }
  }

  /**
   * Clear the template cache
   */
  clearCache(): void {
    this.templateCache.clear();
    this.partialCache.clear();
  }
}

// Export a singleton instance
export const templateManager = new TemplateManager();
