import { currentUserData } from "../auth.js";
import { safeJson } from "../lib/api.js";
const API_BASE = import.meta.env.VITE_API_BASE || '';
import { hideStrict, showStrict } from "../ui.js";
import { jsPDF } from "jspdf/dist/jspdf.umd.min.js";
import patientsHtml from "./templates/patients.html?raw";
import { showConfirmModal } from "../confirm.js";
import patientAddModalHtml from "./templates/patient_add_modal.html?raw";
import patientViewModalHtml from "./templates/patient_view_modal.html?raw";
import patientSuccessModalHtml from "./templates/patient_success_modal.html?raw";

let patientsCache = null;

async function renderPatients(container) {
  const patientsState = patientsCache || [];
  let patients = patientsState;
  let linkedPatientIds = new Set();
  let loading = !patientsCache;
  let isModalOpen = false;
  let formError = "";
  let saving = false;
  let editingId = "";
  let viewPatientRecord = null;
  let searchQuery = "";
  let formState = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birth_date: "",
    address: "",
    bio: "",
    doctorId: "",
    room_number: "",
    password: "123456"
  };

  const isDoctor = currentUserData?.role === "doctor";
  const isAdmin = currentUserData?.role === "admin";
  const isReception = currentUserData?.role === "reception";
  const canManagePatients = isAdmin || isReception || isDoctor;

  const setFormError = (msg) => { formError = msg; render(); };
  const setSaving = (val) => { saving = val; render(); };
  const resetForm = () => {
    formState = { first_name: "", last_name: "", email: "", phone: "", birth_date: "", address: "", bio: "", doctorId: "", room_number: "", password: "123456" };
    editingId = "";
    formError = "";
  };

  const visiblePatients = () => {
    if (!isDoctor) return patients;
    return patients.filter((p) => p.doctorId === currentUserData.id || linkedPatientIds.has(p.id));
  };

  const updatePatientRows = () => {
    const tbody = document.getElementById("patient-rows");
    if (!tbody) return;

    if (loading) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-24 text-center"><div class="flex justify-center"><span class="w-10 h-10 border-4 border-slate-100 dark:border-slate-800/20 border-t-teal-600 rounded-full animate-spin"></span></div></td></tr>`;
      return;
    }

    const filteredPatients = visiblePatients().filter((p) => {
      const q = searchQuery.toLowerCase();
      const fn = (p.first_name || "").toLowerCase();
      const ln = (p.last_name || "").toLowerCase();
      const ph = (p.phone || "").toLowerCase();
      const em = (p.email || "").toLowerCase();
      return fn.includes(q) || ln.includes(q) || (ln + " " + fn).includes(q) || em.includes(q) || ph.includes(q);
    });

    if (filteredPatients.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-24 text-center text-slate-400 dark:text-slate-500 font-semibold italic">Hozircha hech qanday bemor ma'lumoti topilmadi.</td></tr>`;
      return;
    }

    tbody.innerHTML = filteredPatients.map((p) => `
      <tr class="hover:bg-slate-50/45 dark:hover:bg-slate-900/10 transition-all group/row">
        <td class="p-5.5 align-middle">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/40 dark:to-teal-900/10 text-teal-700 dark:text-teal-400 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition-transform duration-300 group-hover/row:scale-105 border border-teal-100/30 dark:border-teal-950/20 shadow-xs">
              ${(p.first_name || "U")[0]}${(p.last_name || "")[0]}
            </div>
            <div>
              <div class="font-extrabold text-[#111827] dark:text-white text-base tracking-tight leading-none">${p.last_name || ""} ${p.first_name || ""}</div>
              <div class="text-[11px] text-slate-450 dark:text-slate-500 font-semibold mt-1.5 whitespace-nowrap">${p.birth_date ? "Tug'ilgan sana: " + p.birth_date : "Sana kiritilmagan"}</div>
            </div>
          </div>
        </td>
        <td class="p-5.5 align-middle hidden sm:table-cell">
          <span class="inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-extrabold border ${p.status === 'finished' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100/30' : 'bg-teal-50 dark:bg-teal-500/10 text-teal-605 border-teal-100/20'}">
            <span class="w-1.5 h-1.5 rounded-full mr-2 ${p.status === 'finished' ? 'bg-emerald-500' : 'bg-teal-500'}"></span>
            ${p.status === 'finished' ? 'Tugallangan' : 'Faol'}
          </span>
        </td>
        <td class="p-5.5 text-slate-700 dark:text-slate-300 align-middle hidden lg:table-cell">
          <div class="flex flex-col gap-1.5">
            <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-teal-550 shrink-0"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              ${p.phone || "-"}
            </div>
            <div class="flex items-center gap-2 text-xs font-bold text-slate-405 dark:text-slate-500">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              ${p.email || ""}
            </div>
          </div>
        </td>
        <td class="p-5.5 text-right align-middle whitespace-nowrap">
          <div class="flex justify-end gap-1.5">
            <button data-action="view" data-id="${p.id}" class="btn-ghost !p-2 cursor-pointer" title="Ko'rish">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-600 dark:text-teal-400"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${canManagePatients ? `
              <button data-action="edit" data-id="${p.id}" class="btn-ghost !p-2 hover:bg-amber-50 dark:hover:bg-amber-955/20 text-amber-500 cursor-pointer" title="Tahrirlash">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
            ` : ""}
            ${canManagePatients ? `
              <button data-action="delete" data-id="${p.id}" class="btn-ghost !p-2 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-500 cursor-pointer" title="O'chirish">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            ` : ""}
          </div>
        </td>
      </tr>
    `).join("");

    tbody.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget;
        const action = target.getAttribute("data-action");
        const id = target.getAttribute("data-id");
        const p = patients.find((x) => x.id === id);
        if (!p) return;
        if (action === "view") {
          viewPatientRecord = p;
          render();
        } else if (action === "edit") {
          handleEditOpen(p);
        } else if (action === "delete") {
          handleDelete(id);
        }
      });
    });
  };

  const generatePassPDF = (u) => {
    const doc = new jsPDF();
    doc.setFillColor(13, 148, 136); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont("helvetica", "bold");
    doc.text("CLINICA PRO PORTAL", 105, 25, { align: "center" });
    doc.setTextColor(15, 23, 42); doc.setFontSize(15);
    doc.text("KIRISH MA'LUMOTLARI PROTOKOLI", 105, 55, { align: "center" });
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    doc.text(`Ism Familiya: ${u.last_name || ""} ${u.first_name || ""}`, 40, 75);
    doc.text(`Login (Telefon): ${u.phone || ""}`, 40, 85);
    if (u.email) doc.text(`Login (Email): ${u.email}`, 40, 95);
    doc.setFont("helvetica", "bold");
    doc.text(`Birinchi kirish paroli: ${u.password}`, 40, 105);
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(226, 232, 240); doc.line(40, 116, 170, 116);
    doc.setFontSize(9); doc.setTextColor(148, 163, 184);
    doc.text("Ushbu hisob darchasi maxfiy hisoblanadi. Uni shaxsiy saqlang.", 105, 126, { align: "center" });
    doc.setDrawColor(13, 148, 136); doc.setLineWidth(0.5); doc.rect(35, 66, 140, 52);
    try {
      console.debug('generatePassPDF: creating blob');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const opened = (() => { try { return !!window.open(url, '_blank'); } catch (err) { return false; } })();
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Kirish_Ma'lumotlari_${u.last_name || "Bemor"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('generatePassPDF error, falling back to save():', e);
      try { doc.save(`Kirish_Ma'lumotlari_${u.last_name || "Bemor"}.pdf`); } catch (err) { console.error('doc.save failed:', err); alert('PDF yaratishda xatolik: ' + err?.message); }
    }
  };

  const renderModals = () => {
    const mContainer = document.getElementById("modal-container");
    if (!mContainer) return;

    if (isModalOpen) {
      mContainer.innerHTML = patientAddModalHtml;
      const form = document.getElementById("patient-form");
      if (form) {
        form.querySelector("[name='firstName']").value = formState.first_name || "";
        form.querySelector("[name='lastName']").value = formState.last_name || "";
        form.querySelector("[name='phone']").value = formState.phone || "";
        form.querySelector("[name='birth_date']").value = formState.birth_date || "";
        form.querySelector("[name='address']").value = formState.address || "";
        const icdField = form.querySelector("[name='icd_code']");
        if (icdField) icdField.value = formState.icd_code || "";
        form.querySelector("[name='password']").value = formState.password || "123456";
        form.querySelector("[name='bio']").value = formState.bio || "";
        const assignWrapper = document.getElementById('assign-doctor-room');
        if (assignWrapper) {
          if (isAdmin || isReception) {
            showStrict(assignWrapper);
            (async () => {
              try {
                const [docsRes, roomsRes] = await Promise.all([
                  fetch(`${API_BASE}/api/users?role=doctor`),
                  fetch(`${API_BASE}/api/rooms`)
                ]);
                let docs = [];
                let rooms = [];
                if (docsRes.ok) { const d = await safeJson(docsRes); docs = Array.isArray(d) ? d : []; }
                if (roomsRes.ok) { const r = await safeJson(roomsRes); rooms = Array.isArray(r) ? r : []; }
                const docSelect = document.getElementById('doctor-select');
                if (docSelect) {
                  docSelect.innerHTML = '<option value="">-- Shifokorni tanlang --</option>' + docs.map(d => `<option value="${d.id}">Dr. ${d.last_name || ''} ${d.first_name || ''} (${d.specialty || ''})</option>`).join('');
                  if (formState.doctorId) docSelect.value = formState.doctorId;
                }
                const roomSelect = document.getElementById('room-select');
                if (roomSelect) {
                  roomSelect.innerHTML = '<option value="">-- Xonani tanlang --</option>' + rooms.map(r => `<option value="${r.room_number}">${r.room_number}-xona (${r.specialty || ''})</option>`).join('');
                  if (formState.room_number) roomSelect.value = formState.room_number;
                }
              } catch (err) {
                console.error('Failed loading doctors/rooms for patient modal', err);
              }
            })();
          } else {
            hideStrict(assignWrapper);
          }
        }
      }

      if (editingId) {
        const titleEl = mContainer.querySelector("h2");
        if (titleEl) titleEl.innerText = "Bemor Anketasini Tahrirlash";
      }

      const errorContainer = document.getElementById("form-error-container");
      const errorText = document.getElementById("form-error-text");
      if (errorContainer && errorText) {
        if (formError) {
          errorContainer.classList.remove("hidden");
          errorText.innerText = formError;
        } else {
          errorContainer.classList.add("hidden");
        }
      }

      const submitBtn = document.getElementById("submit-btn");
      if (submitBtn) {
        submitBtn.disabled = saving;
        submitBtn.innerText = saving ? "SAQLANMOQDA..." : (editingId ? "SAQLASH" : "KARTANI OCHISH");
      }

      document.getElementById("close-modal")?.addEventListener("click", () => { isModalOpen = false; render(); });
      document.getElementById("cancel-modal")?.addEventListener("click", () => { isModalOpen = false; render(); });
      document.getElementById("patient-form")?.addEventListener("submit", handleSave);
    } else if (viewPatientRecord) {
      const p = viewPatientRecord;
      mContainer.innerHTML = patientViewModalHtml;
      const viewFullName = document.getElementById("view-fullname");
      if (viewFullName) viewFullName.innerText = `${p.last_name || ""} ${p.first_name || ""}`;
      const viewAvatarCircle = document.getElementById("view-avatar-circle");
      if (viewAvatarCircle) viewAvatarCircle.innerText = `${(p.first_name?.[0] || 'U')}${(p.last_name?.[0] || '')}`;
      const viewTitle = document.getElementById("view-title-fullname");
      if (viewTitle) viewTitle.innerText = `${p.last_name || ""} ${p.first_name || ""}`;
      const viewPhone = document.getElementById("view-phone");
      if (viewPhone) viewPhone.innerText = p.phone || "-";
      const viewEmail = document.getElementById("view-email");
      if (viewEmail) viewEmail.innerText = p.email || "-";
      const viewAddress = document.getElementById("view-address");
      if (viewAddress) viewAddress.innerText = p.address || "-";
      const viewCreatedAt = document.getElementById("view-created-at");
      if (viewCreatedAt) viewCreatedAt.innerText = p.created_at ? new Date(p.created_at).toLocaleDateString() : "-";
      const viewBio = document.getElementById("view-bio");
      if (viewBio) viewBio.innerText = p.bio ? `"${p.bio}"` : "Hozircha qo'shimcha izoh yo'q.";

      // Files / Attachments area (allow patient themselves or admin to upload)
      const filesWrapperId = 'patient-files-wrapper';
      let filesWrapper = document.getElementById(filesWrapperId);
      if (!filesWrapper) {
        const container = document.createElement('div');
        container.id = filesWrapperId;
        container.className = 'space-y-3 p-4 border rounded-2xl bg-slate-50/50 dark:bg-slate-900/30';
        const label = document.createElement('div');
        label.className = 'flex items-center justify-between';
        label.innerHTML = `<span class="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest font-mono">Bemor fayllari va hujjatlar</span>`;
        const inner = document.createElement('div');
        inner.id = 'patient-files-list';
        inner.className = 'text-sm';
        container.appendChild(label);
        container.appendChild(inner);
        const modalBody = document.querySelector('#patient-view-modal-backdrop > div > .p-8');
        if (modalBody) modalBody.appendChild(container);
        filesWrapper = container;
      }

      const filesListEl = document.getElementById('patient-files-list');
      const renderFiles = (files) => {
        if (!filesListEl) return;
        if (!files || files.length === 0) {
          filesListEl.innerHTML = `<div class="text-xs text-slate-400 italic">Hozircha yuklangan hujjatlar mavjud emas.</div>`;
          return;
        }
        filesListEl.innerHTML = files.map(f => `
          <div class="flex items-center justify-between gap-3 py-2 text-sm">
            <div class="truncate"><a class="font-bold text-teal-600 hover:underline" href="${f.url}" target="_blank">${f.filename}</a>
              <div class="text-[11px] text-slate-500">Yuklangan: ${new Date(f.uploaded_at).toLocaleString()}</div>
            </div>
            <a class="text-xs btn-ghost" href="${f.url}" target="_blank">Yuklab olish</a>
          </div>
        `).join('');
      };

      // Show upload control for admin, the patient themselves, or reception (staff can attach files)
      const canUpload = (currentUserData?.role === 'admin') || (currentUserData?.role === 'patient' && currentUserData.id === p.id) || (currentUserData?.role === 'reception');
      const existingFiles = Array.isArray(p.files) ? p.files : [];
      renderFiles(existingFiles);

      if (canUpload) {
        let uploadControls = document.getElementById('patient-upload-controls');
        if (!uploadControls) {
          uploadControls = document.createElement('div');
          uploadControls.id = 'patient-upload-controls';
          uploadControls.className = 'pt-3 flex items-center gap-3';
          uploadControls.innerHTML = `
            <input id="patient-file-input" type="file" class="hidden" />
            <button id="patient-file-choose" class="btn-secondary">Fayl tanlash</button>
            <button id="patient-file-upload" class="btn-primary" disabled>Yuklash</button>
            <span id="patient-file-status" class="text-xs text-slate-500"></span>
          `;
          filesWrapper.appendChild(uploadControls);

          const fileInput = document.getElementById('patient-file-input');
          const chooseBtn = document.getElementById('patient-file-choose');
          const uploadBtn = document.getElementById('patient-file-upload');
          const statusEl = document.getElementById('patient-file-status');

          chooseBtn?.addEventListener('click', () => fileInput?.click());
          let selectedFile = null;
          fileInput?.addEventListener('change', (ev) => {
            selectedFile = ev.target.files && ev.target.files[0];
            if (selectedFile) {
              uploadBtn.disabled = false;
              statusEl.innerText = selectedFile.name;
            } else {
              uploadBtn.disabled = true;
              statusEl.innerText = '';
            }
          });

          uploadBtn?.addEventListener('click', async () => {
            if (!selectedFile) return;
            uploadBtn.disabled = true;
            statusEl.innerText = 'Yuklanmoqda...';
            try {
              const reader = new FileReader();
              reader.onload = async () => {
                const b64 = String(reader.result).split(',')[1] || '';
                const res = await fetch(`${API_BASE}/api/uploads`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ filename: selectedFile.name, data: b64, userId: p.id })
                });
                const j = await safeJson(res) || {};
                if (!res.ok) throw new Error(j.error || 'Yuklashda xatolik yuz berdi');
                // Refresh patient data from server
                const allRes = await fetch(`${API_BASE}/api/users?role=patient`);
                if (allRes.ok) {
                  const arr = await safeJson(allRes) || [];
                  const updated = (Array.isArray(arr) ? arr : []).find(u => u.id === p.id) || {};
                  viewPatientRecord = updated;
                  render();
                } else {
                  statusEl.innerText = 'Yuklandi';
                }
              };
              reader.readAsDataURL(selectedFile);
            } catch (err) {
              console.error(err);
              statusEl.innerText = 'Xatolik: ' + (err.message || err);
            } finally {
              uploadBtn.disabled = false;
            }
          });
        }
      }

      const finishBtn = document.getElementById("finish-treatment");
      if (finishBtn) {
        if ((isAdmin || isDoctor) && p.status !== 'finished') {
          showStrict(finishBtn);
          finishBtn.addEventListener("click", () => {
            showConfirmModal({ title: "Muolajani yakunlash", message: "Rostdan ham ushbu bemorning davolanish muolajasini yakunlaysizmi?", confirmText: "Yakunlash" }).then(async (confirmed) => {
              if (!confirmed) return;
              await fetch(`${API_BASE}/api/users/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'finished' }) });
              viewPatientRecord = null;
              fetchData();
            });
          });
        } else {
          hideStrict(finishBtn);
        }
      }

      const downloadUserPdfBtn = document.getElementById("download-user-pdf");
      if (downloadUserPdfBtn) {
        if (isAdmin) {
          showStrict(downloadUserPdfBtn);
          downloadUserPdfBtn.addEventListener("click", () => generatePatientFullPDF(p));
        } else {
          hideStrict(downloadUserPdfBtn);
        }
      }

      document.getElementById("close-view")?.addEventListener("click", () => { viewPatientRecord = null; render(); });
      document.getElementById("close-view-btn")?.addEventListener("click", () => { viewPatientRecord = null; render(); });
      document.getElementById("patient-view-modal-backdrop")?.addEventListener("click", (e) => {
        if (e.target.id === "patient-view-modal-backdrop") {
          viewPatientRecord = null;
          render();
        }
      });
    } else {
      mContainer.innerHTML = "";
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    const form = e.target;
    const data = new FormData(form);
    const patientData = {
      first_name: data.get("firstName"),
      last_name: data.get("lastName"),
      email: formState.email || null,
      phone: data.get("phone"),
      birth_date: data.get("birth_date"),
      address: data.get("address"),
      bio: data.get("bio"),
      password: data.get("password"),
      icd_code: data.get("icd_code"),
      role: 'patient',
      doctorId: data.get('doctorId') || formState.doctorId || (isDoctor ? currentUserData.id : null),
      room_number: data.get('room_number') || formState.room_number || null,
      status: formState.status || 'active'
    };
    try {
      const url = editingId ? `${API_BASE}/api/users/${editingId}` : `${API_BASE}/api/users`;
      const method = editingId ? 'PUT' : 'POST';
      const headers = { 'Content-Type': 'application/json' };
      if (currentUserData?.role) headers['X-User-Role'] = currentUserData.role;
      if (currentUserData?.id) headers['X-User-Id'] = currentUserData.id;
      const res = await fetch(url, { method, headers, body: JSON.stringify(patientData) });
      const resJSON = await safeJson(res) || {};
      if (!res.ok) throw new Error((editingId ? "Tahrirlash xatosi: " : "Yaratish xatosi: ") + (resJSON.error || "Ushbu ma'lumotlar bilan foydalanuvchi allaqachon mavjud"));

      isModalOpen = false;
      const wasEditing = !!editingId;
      resetForm();
      await fetchData();
      await fetchLinkedPatients();

      if (!wasEditing) {
        const mContainer = document.getElementById("modal-container");
        if (mContainer) {
          mContainer.innerHTML = patientSuccessModalHtml;
          const successPhone = document.getElementById("success-phone");
          if (successPhone) successPhone.innerText = patientData.phone;
          const successPassword = document.getElementById("success-password");
          if (successPassword) successPassword.innerText = patientData.password;
          document.getElementById("close-success-view")?.addEventListener("click", render);
          document.getElementById("close-success-btn")?.addEventListener("click", render);
          document.getElementById("download-pass-pdf")?.addEventListener("click", () => generatePassPDF(patientData));
          try { generatePassPDF(patientData); } catch (pdfErr) { console.warn("Auto PDF generation failed:", pdfErr.message); }
        }
        // If this registration was done by a public user (not an admin/doctor/reception),
        // auto-login the newly created patient so they immediately see their records.
        if (!(currentUserData && (currentUserData.role === 'admin' || currentUserData.role === 'doctor' || currentUserData.role === 'reception'))) {
          try {
            // `resJSON` contains the created user object returned by the server
            const createdUser = resJSON && resJSON.id ? resJSON : null;
            if (createdUser) {
              localStorage.setItem('clinica_user', JSON.stringify(createdUser));
              window.location.reload();
            }
          } catch (e) {
            console.warn('Auto-login after registration failed:', e.message);
          }
        }
      }
    } catch (err) {
      setFormError(err.message || "Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const p = patients.find(x => x.id === id);
    const patName = p ? `${p.last_name || ""} ${p.first_name || ""}` : "";
    showConfirmModal({ title: "Bemorni o'chirish", message: `Haqiqatan ham bemor ${patName} ma'lumotlarini tizimdan butunlay o'chirmoqchisiz?`, confirmText: "O'chirish" }).then(async (confirmed) => {
      if (!confirmed) return;
      try {
        const res = await fetch(`${API_BASE}/api/users/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error((data && data.error) || "O'chirishda xatolik yuz berdi");
        }
        await fetchData();
        await fetchLinkedPatients();
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  };

  const fetchLinkedPatients = async () => {
    if (!isDoctor) {
      linkedPatientIds = new Set();
      return;
    }
    try {
      const diagRes = await fetch(`${API_BASE}/api/diagnoses`, { headers: { 'X-User-Role': currentUserData?.role || '', 'X-User-Id': currentUserData?.id || '' } });
      if (!diagRes.ok) {
        linkedPatientIds = new Set();
        return;
      }
      const diagData = await safeJson(diagRes) || [];
      linkedPatientIds = new Set((Array.isArray(diagData) ? diagData : []).filter(d => d.doctor_id === currentUserData.id).map(d => d.patient_id).filter(Boolean));
    } catch (err) {
      console.error(err);
      linkedPatientIds = new Set();
    }
  };

  const fetchData = async () => {
    try {
      loading = true;
      const res = await fetch(`${API_BASE}/api/users?role=patient`);
      if (!res.ok) throw new Error("Ma'lumotlarni yuklab bo'lmadi.");
      patients = await safeJson(res) || [];
      if (currentUserData?.role === 'patient') {
        patients = patients.filter(u => u.id === currentUserData.id);
      }
      patientsCache = patients;
      loading = false;
      render();
    } catch (err) {
      console.error(err);
      loading = false;
      render();
    }
  };

  const render = () => {
    container.innerHTML = patientsHtml;
    if (isDoctor) {
      const tabsCont = document.getElementById("patient-tabs-container");
      if (tabsCont) tabsCont.innerHTML = `<div class="flex items-center gap-2 mb-4 md:mb-0"><span class="text-xs font-black uppercase tracking-widest text-teal-600">Mening bemorlarim</span></div>`;
    }

    if (!canManagePatients) {
      const addBtn = document.getElementById("add-patient-btn");
      if (addBtn) hideStrict(addBtn);
    }

    const searchInput = document.getElementById("patient-search");
    if (searchInput) {
      searchInput.value = searchQuery;
      searchInput.addEventListener("input", (e) => { searchQuery = e.target.value; updatePatientRows(); });
    }

    const addBtn = document.getElementById("add-patient-btn");
    if (addBtn) addBtn.addEventListener("click", () => { resetForm(); isModalOpen = true; render(); });

    updatePatientRows();
    renderModals();
  };

  await fetchData();
  await fetchLinkedPatients();
  render();

  return () => {};
}

export { renderPatients };
