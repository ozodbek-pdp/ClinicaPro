import "./index.css";
import { setupAuth } from "./auth";
import { API_BASE } from "./lib/api";

async function bootstrap() {
  // Initialize client-side mock API before any page code can fire requests.
  if (!API_BASE) {
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
