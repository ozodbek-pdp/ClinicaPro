import "./index.css";
import { setupAuth } from "./auth";
import { API_BASE } from "./lib/api";

async function bootstrap() {
  // Only use the client-side mock API in development when no real API base is configured.
  if (import.meta.env.DEV && !API_BASE) {
    try {
      const mod = await import("./lib/mockApi");
      await mod.initMockApi();
    } catch (err) {
      console.warn("mockApi bootstrap failed", err);
    }
  }

  const start = () => setupAuth();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

bootstrap();
