import "./index.css";
import { setupAuth } from "./auth";
import { API_BASE } from "./lib/api";
// Initialize client-side mock API when no external API base is provided
if (!API_BASE) {
  import("./lib/mockApi").then(mod => mod.initMockApi()).catch(() => {});
}

document.addEventListener("DOMContentLoaded", () => {
  setupAuth();
});
