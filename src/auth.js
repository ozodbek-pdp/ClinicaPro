import { renderApp } from "./app.js";
import { db } from "./firebase.js";
import { safeJson, API_BASE } from "./lib/api.js";
import { collection, query, where, getDocs } from "firebase/firestore";
import loginHtml from "./pages/templates/login.html?raw";

let currentUser = null;
let currentUserData = null;

function setupAuth() {
  const root = document.getElementById("root");
  if (!root) return;

  const storedUser = localStorage.getItem("clinica_user");
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      currentUser = user;
      currentUserData = user;
      renderApp();
    } catch (err) {
      localStorage.removeItem("clinica_user");
      renderLogin();
    }
  } else {
    renderLogin();
  }
}

function renderLogin() {
  const root = document.getElementById("root");
  if (!root) return;
  
  // Force clean light theme
  document.documentElement.classList.remove("dark");
  localStorage.setItem("clinica_theme", "light");

  root.innerHTML = loginHtml;
  
  const form = document.getElementById("login-form");
  const errorDiv = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");
  if (!form || !btn) return;

  const performLogin = async (email, password) => {
    if (errorDiv) errorDiv.classList.add("hidden");
    btn.disabled = true;
    const originalText = btn.innerText;
    btn.innerHTML = `<span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></span> KIRISH PROTOKOL...`;
    
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error((data && data.error) || "Login yoki parol noto'g'ri kiritildi.");
      }
      const userData = data.user;
      localStorage.setItem("clinica_user", JSON.stringify(userData));
      currentUser = userData;
      currentUserData = userData;
      window.location.reload();
    } catch (err) {
      console.error("Login Error:", err);
      if (errorDiv) {
         errorDiv.innerHTML = `<span class="block">${err.message || "Login yoki parol noto'g'ri kiritildi."}</span>`;
         errorDiv.classList.remove("hidden");
      }
      btn.disabled = false;
      btn.innerHTML = originalText || "TIZIMGA KIRISH";
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const email = formData.get("email");
    const password = formData.get("password");
    performLogin(email, password);
  });
}

function logout() {
  localStorage.removeItem("clinica_user");
  window.location.reload();
}

export { currentUser, currentUserData, logout, renderLogin, setupAuth };
