import { currentUserData } from "../auth.js";
import roomsHtml from "./templates/rooms.html?raw";
import { safeJson } from "../lib/api.js";
const API_BASE = import.meta.env.VITE_API_BASE || '';
import { showConfirmModal } from "../confirm.js";

async function renderRooms(container) {
  if (currentUserData?.role !== "admin" && currentUserData?.role !== "reception" && currentUserData?.role !== "doctor") {
    container.innerHTML = `<div class="p-8 text-center text-rose-500 font-extrabold uppercase tracking-widest">Sahifaga kirish taqiqlangan</div>`;
    return () => {};
  }

  let rooms = [];
  let doctors = [];
  let loading = true;
  let isModalOpen = false;
  let formError = "";
  let saving = false;
  let searchQuery = "";

  const resetForm = () => {
    formError = "";
    saving = false;
  };

  const fetchData = async () => {
    try {
      loading = true;
      renderTable();
      
      const [roomsRes, docsRes] = await Promise.all([
        fetch(`${API_BASE}/api/rooms`).then(r => safeJson(r)),
        fetch(`${API_BASE}/api/users?role=doctor`).then(r => safeJson(r))
      ]);

      rooms = Array.isArray(roomsRes) ? roomsRes : [];
      doctors = Array.isArray(docsRes) ? docsRes : [];
      loading = false;
      renderTable();
    } catch (err) {
      console.error("Error fetching rooms data:", err);
      loading = false;
      renderTable();
    }
  };

  const getFilteredRooms = () => {
    return rooms.filter(r => {
      const q = searchQuery.toLowerCase();
      const num = (r.room_number || '').toLowerCase();
      const spec = (r.specialty || '').toLowerCase();
      return num.includes(q) || spec.includes(q);
    });
  };

  const renderTable = () => {
    const tbody = document.getElementById("rooms-tbody");
    if (!tbody) return;

    if (loading) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-20 text-center"><div class="flex justify-center"><span class="w-10 h-10 border-4 border-slate-100 dark:border-slate-800/20 border-t-teal-600 rounded-full animate-spin"></span></div></td></tr>`;
      return;
    }

    const filtered = getFilteredRooms();
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-20 text-center text-slate-400 dark:text-slate-500 font-bold italic">Tizimda hech qanday xona topilmadi.</td></tr>`;
      return;
    }

    // Map which room belongs to which doctor
    const roomToDoc = {};
    doctors.forEach(d => {
      if (d.room_number) {
        roomToDoc[d.room_number] = `${d.last_name || ""} ${d.first_name || ""}`;
      }
    });

    tbody.innerHTML = filtered.map(r => {
      const occupiedBy = roomToDoc[r.room_number];
      return `
        <tr class="hover:bg-slate-50/45 dark:hover:bg-slate-900/10 transition-all">
          <td class="p-5.5 align-middle font-bold text-slate-800 dark:text-slate-100 text-base font-mono">
            ${r.room_number}-xona
          </td>
          <td class="p-5.5 align-middle">
            <span class="inline-flex px-3 py-1.5 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-350 rounded-xl text-xs font-bold border border-slate-200/50 dark:border-slate-800/80">
              ${r.specialty}
            </span>
          </td>
          <td class="p-5.5 align-middle">
            ${occupiedBy ? `
              <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                BAND (${occupiedBy})
              </span>
            ` : `
              <span class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                BO'SH (TAKIF ETISHGA TAYYOR)
              </span>
            `}
          </td>
          <td class="p-5.5 align-middle text-right">
            ${currentUserData?.role === "admin" || currentUserData?.role === "reception" ? `
              <button data-action="delete" data-id="${r.id}" class="btn-ghost !p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 cursor-pointer" title="O'chirish">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            ` : `<span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Faqat Admin</span>`}
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("button[data-action='delete']").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const rm = rooms.find(x => x.id === id);
        const rmNum = rm ? `${rm.room_number}-xona` : "ushbu xona";
        showConfirmModal({
          title: "Xonani o'chirish",
          message: `Rostdan ham ${rmNum} profilini butunlay o'chirib yuborasizmi?`,
          confirmText: "O'chirish"
        }).then((confirmed) => {
          if (confirmed) {
            deleteRoom(id);
          }
        });
      });
    });
  };

  const deleteRoom = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms/${id}`, { method: 'DELETE', headers: { 'X-User-Role': currentUserData?.role || '' } });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error((data && data.error) || "O'chirishda xatolik yuz berdi");
      }
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    // Ensure only admin or reception can submit (extra safety in case button was triggered)
    if (!(currentUserData?.role === "admin" || currentUserData?.role === "reception")) {
      alert("Faqat admin yoki qabulxona xodimi xona qo'sha oladi.");
      return;
    }
    saving = true;
    renderModals();
    const form = e.target;
    const body = {
      room_number: form.querySelector("[name='room_number']").value,
      specialty: form.querySelector("[name='specialty']").value
    };

    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Role': currentUserData?.role || '' },
        body: JSON.stringify(body)
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data && data.error) || "Kiritish o'tmay qoldi");

      isModalOpen = false;
      resetForm();
      fetchData();
    } catch (err) {
      formError = err.message;
      saving = false;
      renderModals();
    }
  };

  const renderModals = () => {
    const modalContainer = document.getElementById("room-modal-container");
    if (!modalContainer) return;

    if (isModalOpen) {
      modalContainer.innerHTML = `
        <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-[fadeIn_0.3s_ease-out]">
          <div class="bg-white dark:bg-[#121826] rounded-3xl shadow-xl max-w-md w-full overflow-hidden flex flex-col border border-slate-100 dark:border-slate-800 animate-[zoomIn_0.3s_ease-out]">
            <div class="px-8 py-5 border-b border-slate-205/50 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex justify-between items-center shrink-0">
              <div>
                <h3 class="text-lg font-extrabold text-[#111827] dark:text-white">Yangi amaliy xona</h3>
                <p class="text-[9px] font-black text-teal-600 mt-0.5 uppercase tracking-wide">Xona raqami va yo'nalishini kiriting</p>
              </div>
              <button id="close-room-modal" class="text-slate-400 hover:text-slate-600 text-xl cursor-pointer">&times;</button>
            </div>
            
            <form id="add-room-form" class="p-8 space-y-5">
              ${formError ? `
                <div class="bg-rose-50 text-rose-600 p-4 rounded-xl text-xs font-bold border border-rose-100">
                  ${formError}
                </div>
              ` : ''}

              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-500">Xona raqami / Belglanishi (unikal)</label>
                <input type="text" name="room_number" required placeholder="Masalan: 123" class="input-premium">
              </div>

              <div class="space-y-1.5">
                <label class="block text-xs font-bold text-slate-500">Qaysi mutaxassislik uchun mo'ljallangan?</label>
                <input type="text" name="specialty" required placeholder="Masalan: Tish shifokori, Kardiolog" class="input-premium">
              </div>

              <div class="flex gap-3 pt-3">
                <button type="button" id="cancel-room-modal" class="btn-secondary !flex-1">BEKOR QILISH</button>
                <button type="submit" class="btn-primary !flex-1" ${saving ? 'disabled' : ''}>
                  ${saving ? 'Saqlanmoqda...' : 'SAQLASH'}
                </button>
              </div>
            </form>
          </div>
        </div>
      `;

      document.getElementById("close-room-modal")?.addEventListener("click", () => { isModalOpen = false; renderModals(); });
      document.getElementById("cancel-room-modal")?.addEventListener("click", () => { isModalOpen = false; renderModals(); });
      document.getElementById("add-room-form")?.addEventListener("submit", handleAddRoom);
    } else {
      modalContainer.innerHTML = "";
    }
  };

  const render = () => {
    container.innerHTML = roomsHtml;

    // Only Admin and Reception can add rooms (doctors can view but not modify)
    renderTable();

    const searchInput = document.getElementById("room-search");
    if (searchInput) {
      searchInput.value = searchQuery;
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderTable();
      });
    }

    const addBtn = document.getElementById("add-room-btn");
    if (addBtn) {
      // Remove the button entirely for non-admin/reception roles (prevents accidental activation)
      if (!(currentUserData?.role === "admin" || currentUserData?.role === "reception")) {
        addBtn.remove();
      } else {
        addBtn.addEventListener("click", () => {
          resetForm();
          isModalOpen = true;
          renderModals();
        });
      }
    }

    renderModals();
  };

  fetchData();
  render();

  return () => {};
}

export { renderRooms };
