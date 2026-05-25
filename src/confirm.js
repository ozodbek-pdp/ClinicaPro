export function showConfirmModal({ title = "Tasdiqlang", message = "", confirmText = "O'chirish", cancelText = "Bekor qilish" }) {
  return new Promise((resolve) => {
    // Check if there is an existing one and remove it
    const existing = document.getElementById("custom-confirm-modal");
    if (existing) {
      existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200";
    overlay.id = "custom-confirm-modal";

    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full border border-slate-100 scale-95 transform transition-all duration-200" style="animation: scaleUp 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;">
        <div class="flex items-start gap-4">
          <div class="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          </div>
          <div class="space-y-1.5 flex-1">
            <h3 class="font-black text-sm text-slate-800 leading-tight uppercase tracking-wide">
              ${title}
            </h3>
            <p class="text-xs text-slate-500 font-semibold leading-relaxed">
              ${message}
            </p>
          </div>
        </div>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button id="modal-cancel-btn" class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer">
            ${cancelText}
          </button>
          <button id="modal-confirm-btn" class="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-lg shadow-rose-600/20">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    // Inject styles for transition if needed
    if (!document.getElementById("confirm-styles")) {
      const style = document.createElement("style");
      style.id = "confirm-styles";
      style.innerHTML = `
        @keyframes scaleUp {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector("#modal-cancel-btn");
    const confirmBtn = overlay.querySelector("#modal-confirm-btn");

    const cleanup = (value) => {
      overlay.classList.add("opacity-0");
      setTimeout(() => {
        overlay.remove();
      }, 150);
      resolve(value);
    };

    cancelBtn.onclick = () => cleanup(false);
    confirmBtn.onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
}
