import { currentUserData, logout } from "./auth";
import { renderDashboard } from "./pages/dashboard";
import { renderPatients } from "./pages/patients";
import { renderDoctors } from "./pages/doctors";
import { renderRooms } from "./pages/rooms";
import { renderDiagnoses } from "./pages/diagnoses";
import appHtml from "./pages/templates/app.html?raw";

let currentRoute = "dashboard";

function renderApp() {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = appHtml;

  // Render avatar and role label with role-specific styles so admin/doctor look different
  const avatarElem = document.getElementById("user-avatar-text");
  const roleElem = document.getElementById("user-role-text");
  const role = currentUserData?.role;
  const avatarInitial = currentUserData?.first_name?.[0] || "U";
  if (avatarElem) {
    avatarElem.innerText = avatarInitial;
    // base classes kept for sizing and layout
    const base = "w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0";
    if (role === "admin") {
      avatarElem.className = `${base} bg-gradient-to-br from-rose-500 to-rose-600`;
    } else if (role === "doctor") {
      avatarElem.className = `${base} bg-gradient-to-br from-teal-500 to-teal-600`;
    } else if (role === "reception") {
      avatarElem.className = `${base} bg-gradient-to-br from-indigo-500 to-indigo-600`;
    } else {
      avatarElem.className = `${base} bg-slate-300 text-slate-800`;
    }
  }

  if (roleElem) {
    const label = role === "admin" ? "Bosh Administrator" : role === "doctor" ? "Shifokor-Mutaxassis" : role === "reception" ? "Registratura" : "Bemor hujjati";
    roleElem.innerText = label;
    // color the role label to match avatar for quick visual distinction
    roleElem.classList.remove("text-teal-600", "text-rose-600", "text-indigo-600");
    if (role === "admin") roleElem.classList.add("text-rose-600");
    else if (role === "doctor") roleElem.classList.add("text-teal-600");
    else if (role === "reception") roleElem.classList.add("text-indigo-600");
    else roleElem.classList.add("text-slate-400");
  }

  const fullnameText = document.getElementById("user-fullname-text");
  if (fullnameText) {
    fullnameText.innerText = `${currentUserData?.last_name || ""} ${currentUserData?.first_name || "Foydalanuvchi"}`;
  }

  renderNavLinks();
  attachAppListeners();
  navigate(currentRoute);
}
 
function renderNavLinks() {
  const navContainer = document.getElementById("nav-links");
  if (!navContainer) return;
  const role = currentUserData?.role;
  let linksHtml = "";
  const allowedRoutes = role === "admin"
    ? ["dashboard", "patients", "doctors", "rooms", "diagnoses"]
    : role === "doctor"
      ? ["dashboard", "patients", "diagnoses"]
      : role === "reception"
        ? ["dashboard", "patients", "diagnoses"]
        : [];
  const addLink = (id, icon, label) => {
    const isActive = currentRoute === id;
    const activeClass = isActive 
      ? "bg-teal-600 text-white font-extrabold shadow-md shadow-teal-600/15 scale-[1.02]" 
      : "text-slate-500 dark:text-slate-400 hover:bg-teal-50/20 dark:hover:bg-teal-950/10 hover:text-slate-900 dark:hover:text-slate-100 font-bold hover:translate-x-1";
    linksHtml += `
      <button data-route="${id}" class="w-full text-left flex items-center gap-3.5 px-4.5 py-3 rounded-xl transition-all duration-200 cursor-pointer ${activeClass}">
        <div class="transition-colors duration-200 shrink-0 ${isActive ? "text-white animate-[zoomIn_0.3s_ease-out]" : "text-slate-405 group-hover:text-teal-600 dark:text-slate-550"}">
          ${icon}
        </div>
        <span class="text-xs uppercase tracking-wider font-extrabold">${label}</span>
      </button>
    `;
  };
  // Only show routes allowed for the current role
  if (allowedRoutes.includes("dashboard")) {
    addLink("dashboard", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>', "Asosiy Oyna");
  }
  // Patients visible to admin, reception and doctors
  if (allowedRoutes.includes("patients")) {
    addLink("patients", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>', "Bemorlar");
  }
  // Doctors and Rooms management are admin-only
  if (allowedRoutes.includes("doctors")) {
    addLink("doctors", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', "Shifokorlar");
  }
  if (allowedRoutes.includes("rooms")) {
    addLink("rooms", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/></svg>', "Xonalar");
  }
  if (allowedRoutes.includes("diagnoses")) {
    addLink("diagnoses", '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>', "Tashxislar");
  }
  navContainer.innerHTML = linksHtml;
  navContainer.querySelectorAll("button[data-route]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const route = e.currentTarget.getAttribute("data-route");
      if (route) navigate(route);
    });
  });
}

function attachAppListeners() {
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  // Force Light Theme (no dark mode needed)
  document.documentElement.classList.remove("dark");
  localStorage.setItem("clinica_theme", "light");

  const mobileMenuBtn = document.getElementById("mobile-menu-btn");
  const closeSidebarBtn = document.getElementById("close-sidebar");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");

  const toggleSidebar = () => {
    sidebar?.classList.toggle("hidden");
    sidebar?.classList.toggle("absolute");
    sidebar?.classList.toggle("h-full");
    overlay?.classList.toggle("hidden");
    // Ensure overlay only intercepts pointer events when visible
    overlay?.classList.toggle("pointer-events-none");
    overlay?.classList.toggle("pointer-events-auto");
  };
  mobileMenuBtn?.addEventListener("click", toggleSidebar);
  closeSidebarBtn?.addEventListener("click", toggleSidebar);
  overlay?.addEventListener("click", toggleSidebar);
}

window.navigate = navigate;
let currentCleanup = null;

async function navigate(route) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  currentRoute = route;
  renderNavLinks();
  const role = currentUserData?.role;
  const allowedRoutes = role === "admin"
    ? ["dashboard", "patients", "doctors", "rooms", "diagnoses"]
    : role === "doctor"
      ? ["dashboard", "patients", "diagnoses"]
      : role === "reception"
        ? ["dashboard", "patients", "diagnoses"]
        : [];
  if (allowedRoutes.length > 0 && !allowedRoutes.includes(route)) {
    route = "dashboard";
    currentRoute = route;
    renderNavLinks();
  }
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (sidebar && sidebar.classList.contains("absolute")) {
    sidebar.classList.add("hidden");
    sidebar.classList.remove("absolute");
    sidebar.classList.remove("h-full");
    overlay?.classList.add("hidden");
  }
  const pageContainer = document.getElementById("page-content");
  if (!pageContainer) return;
  switch (route) {
    case "dashboard":
      currentCleanup = await renderDashboard(pageContainer);
      break;
    case "patients":
      currentCleanup = await renderPatients(pageContainer);
      break;
    case "doctors":
      currentCleanup = await renderDoctors(pageContainer);
      break;
    case "rooms":
      currentCleanup = await renderRooms(pageContainer);
      break;
    case "diagnoses":
      currentCleanup = await renderDiagnoses(pageContainer);
      break;
    default:
      pageContainer.innerHTML = '<h2 class="text-xl font-bold text-slate-800">Sahifa topilmadi</h2>';
  }
}

export {
  navigate,
  renderApp
};
