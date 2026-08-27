import { Hooks } from "./hooks";
import { logger } from "./utils/logger";

let hooks: Hooks | null = null;

const api = {
  async startup({ rootURI }: { rootURI: string }): Promise<void> {
    hooks = new Hooks(rootURI);
    await hooks.startup();
    logger.info("Started");
  },
  async shutdown(): Promise<void> {
    await hooks?.shutdown();
    hooks = null;
  },
  onMainWindowLoad({ window: win }: { window: Window }): void {
    hooks?.onMainWindowLoad(win);
  },
  onMainWindowUnload({ window: win }: { window: Window }): void {
    hooks?.onMainWindowUnload(win);
  },
};

(globalThis as any).ZoteroScholarAssistant = api;
