import { currentUserData } from "../auth.js";
import { safeJson } from "../lib/api.js";
const API_BASE = import.meta.env.VITE_API_BASE || '';
import { hideStrict, showStrict } from "../ui.js";
import { db } from "../firebase.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import diagnosesHtml from "./templates/diagnoses.html?raw";
import { showConfirmModal } from "../confirm.js";
import diagnoseAddModalHtml from "./templates/diagnose_add_modal.html?raw";
import diagnoseViewModalHtml from "./templates/diagnose_view_modal.html?raw";

async function renderDiagnoses(container) {
  const { jsPDF } = await import("jspdf/dist/jspdf.umd.min.js");
  let diagnoses = [];
  let patients = [];
  let patientsMap = {};
  let doctorsMap = {};
  let loading = true;
  let isModalOpen = false;
  let formError = "";
  let saving = false;
  let editingId = "";
  let viewRecord = null;
  let viewAll = true;
  let searchQuery = "";
  let formState = {
    patient_id: "",
    description: "",
    treatment_start_date: new Date().toISOString().split("T")[0]
  };

  const setFormError = (msg) => { formError = msg; render(); };
  const setSaving = (val) => { saving = val; render(); };
  const resetForm = () => {
    formState = { patient_id: "", description: "", treatment_start_date: new Date().toISOString().split("T")[0] };
    editingId = "";
    formError = "";
  };
  const handleEditOpen = (d) => {
    editingId = d.id;
    formState = { ...d };
    isModalOpen = true;
    render();
  };

  const generatePDF = (diagnosis) => {
    const doc = new jsPDF();
    const p = patientsMap[diagnosis.patient_id];
    const docInfo = doctorsMap[diagnosis.doctor_id];
    
    // Header
    doc.setFillColor(13, 148, 136); doc.rect(0, 0, 210, 42, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont("helvetica", "bold");
    doc.text("YAGONA TIBBIY DIAGNOZ KARTASI", 105, 25, { align: "center" });
    
    doc.setFontSize(10); doc.text("CLINICA PRO - INTEGRALLASHGAN TIBBIY TIZIM", 105, 33, { align: "center" });

    // Body
    doc.setTextColor(15, 23, 42); doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("Bemor shaxsiy anketasi:", 20, 58);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(`F.I.SH: ${p ? p.last_name + " " + p.first_name : "Noma'lum"}`, 25, 68);
    doc.text(`Tug'ilgan sanasi: ${p?.birth_date || "-"}`, 25, 76);
    doc.text(`Doimiy yashash manzili: ${p?.address || "-"}`, 25, 84);
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Mas'ul maslahatchi shifokor:", 20, 102);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(`F.I.SH: Dr. ${docInfo ? docInfo.last_name + " " + docInfo.first_name : "Noma'lum"}`, 25, 112);
    doc.text(`Mutaxassisligi: ${docInfo?.specialty || "Klinika Terapevti"}`, 25, 120);

    doc.setDrawColor(226, 232, 240); doc.line(20, 128, 190, 128);

    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.text("TASHXIS XULOSALARI VA RETSEPT:", 20, 142);
    doc.setFontSize(11); doc.setFont("helvetica", "normal");
    
    const splitText = doc.splitTextToSize(diagnosis.description || "Tibbiy ma'lumotlar mavjud emas", 165);
    doc.text(splitText, 25, 154);

    // Date Footer
    const footY = Math.min(250, 154 + splitText.length * 7 + 20);
    doc.setFontSize(10); doc.setTextColor(100, 116, 139);
    doc.text(`Tashxis qo'yilgan sana: ${new Date(diagnosis.created_at).toLocaleDateString()}`, 20, footY);
    doc.text(`Davolash boshlanishi: ${diagnosis.treatment_start_date || "-"}`, 20, footY + 7);
    
    // Stamp seal circles
    doc.setDrawColor(13, 148, 136); doc.setLineWidth(1); doc.circle(165, footY + 10, 15);
    doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(13, 148, 136);
    doc.text("CLINICA PRO", 165, footY + 8, { align: "center" });
    doc.text("TASDIQLANDI", 165, footY + 12, { align: "center" });

    try {
      console.debug('generatePDF: creating blob');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const opened = (() => { try { return !!window.open(url, '_blank'); } catch (err) { return false; } })();
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Tashxis_Ma'lumotnoma_${p?.last_name || "Bemor"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('generatePDF error, falling back to save():', e);
      try { doc.save(`Tashxis_Ma'lumotnoma_${p?.last_name || "Bemor"}.pdf`); } catch (err) { console.error('doc.save failed:', err); alert('PDF yaratishda xatolik: ' + err?.message); }
    }
  };

  const renderDiagnosesList = () => {
    const tbody = document.getElementById("diagnoses-rows");
    if (!tbody) return;

    if (loading) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="p-24 text-center"><div class="flex justify-center"><span class="w-10 h-10 border-4 border-slate-100 dark:border-slate-800/20 border-t-teal-600 rounded-full animate-spin"></span></div></td></tr>
      `;
      return;
    }

    if (diagnoses.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="p-24 text-center text-slate-400 dark:text-slate-500 font-semibold italic">Hozircha hech qanday tashxis ma'lumoti topilmadi.</td></tr>
      `;
      return;
    }

    // Filter list based on viewAll flag if doctor role
    let listToShow = diagnoses;
    if (!viewAll && currentUserData?.role === "doctor") {
      listToShow = diagnoses.filter(d => d.doctor_id === currentUserData.id);
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      listToShow = listToShow.filter(d => {
        const p = patientsMap[d.patient_id];
        const docInfo = doctorsMap[d.doctor_id];
        const pName = p ? `${p.last_name || ""} ${p.first_name || ""}`.toLowerCase() : "";
        const dName = docInfo ? `${docInfo.last_name || ""} ${docInfo.first_name || ""}`.toLowerCase() : "";
        const desc = (d.description || "").toLowerCase();
        return pName.includes(q) || dName.includes(q) || desc.includes(q);
      });
    }

    if (listToShow.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="5" class="p-24 text-center text-slate-400 dark:text-slate-500 font-semibold italic">Hech qanday ma'lumot topilmadi.</td></tr>
      `;
      return;
    }

    tbody.innerHTML = listToShow.map((d) => {
      const p = patientsMap[d.patient_id];
      const docInfo = doctorsMap[d.doctor_id];
      const pName = p ? `${p.last_name || ""} ${p.first_name || ""}` : "Noma'lum Bemor";
      const dName = docInfo ? `Dr. ${docInfo.last_name || ""} ${docInfo.first_name || ""}` : "Noma'lum Shifokor";
      const dateStr = d.created_at ? new Date(d.created_at).toLocaleDateString() : "-";
      
      const canManage = currentUserData?.role === "doctor" || currentUserData?.role === "admin";

      return `
        <tr class="hover:bg-slate-50/45 dark:hover:bg-slate-900/10 transition-all group/row">
          <td class="p-5.5 align-middle font-mono font-bold text-slate-600 dark:text-slate-400 text-xs">${dateStr}</td>
          <td class="p-5.5 align-middle">
            <div class="font-extrabold text-[#111827] dark:text-white text-sm">${pName}</div>
          </td>
          <td class="p-5.5 align-middle hidden lg:table-cell">
            <div class="font-bold text-slate-700 dark:text-slate-300 text-sm">${dName}</div>
            ${docInfo?.specialty ? `<div class="text-[10px] text-teal-600 dark:text-teal-400 font-extrabold font-mono uppercase mt-0.5">${docInfo.specialty}</div>` : ""}
          </td>
          <td class="p-5.5 align-middle hidden md:table-cell max-w-xs truncate text-xs font-semibold text-slate-500 dark:text-slate-450">${d.description || ""}</td>
          <td class="p-5.5 text-right align-middle whitespace-nowrap">
            <div class="flex justify-end gap-1.5">
              <button data-action="view" data-id="${d.id}" class="btn-ghost !p-2 cursor-pointer" title="Ko'rish">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-600 dark:text-teal-400"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              ${canManage ? `
                <button data-action="edit" data-id="${d.id}" class="btn-ghost !p-2 cursor-pointer text-slate-550" title="Tahrirlash">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button data-action="delete" data-id="${d.id}" class="btn-ghost !p-2 hover:bg-rose-50 dark:hover:bg-rose-955/20 text-rose-500 cursor-pointer" title="O'chirish">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              ` : ""}
            </div>
          </td>
        </tr>
      `;
    }).join("");
  };

  const render = () => {
    container.innerHTML = diagnosesHtml;

    if (currentUserData?.role === 'reception') {
      const header = container.querySelector('header');
      if (header && !document.getElementById('reception-diagnosis-note')) {
        const note = document.createElement('div');
        note.id = 'reception-diagnosis-note';
        note.className = 'mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300';
        note.textContent = 'Qabul bo\'limi tashxis qo\'sha olmaydi. Bu yer faqat ko\'rish uchun.';
        header.insertAdjacentElement('afterend', note);
      }
    }

    if (currentUserData?.role === 'doctor') {
      const tabsCont = document.getElementById("diag-tabs-container");
      if (tabsCont) {
        tabsCont.innerHTML = `
            <div class="flex items-center gap-2 mb-4 md:mb-0">
                <button id="tab-all" class="text-xs font-black uppercase tracking-widest cursor-pointer"></button>
                <button id="tab-my" class="text-xs font-black uppercase tracking-widest cursor-pointer"></button>
            </div>
        `;
        const tabAll = document.getElementById("tab-all");
        const tabMy = document.getElementById("tab-my");
        if (tabAll && tabMy) {
          tabAll.innerText = "Barchasi";
          tabAll.className = `text-xs font-black uppercase tracking-widest ${viewAll ? 'text-teal-600' : 'text-slate-400'} cursor-pointer`;
          tabMy.innerText = "Mening tashxislarim";
          tabMy.className = `text-xs font-black uppercase tracking-widest ${!viewAll ? 'text-teal-600' : 'text-slate-400'} cursor-pointer`;
        }
      }
    }

    const addBtn = document.getElementById("add-btn");
    if (addBtn) {
      if (currentUserData?.role === "doctor" || currentUserData?.role === "admin") {
        showStrict(addBtn);
      } else {
        hideStrict(addBtn);
      }
    }

    document.getElementById("tab-all")?.addEventListener("click", () => { viewAll = true; render(); });
    document.getElementById("tab-my")?.addEventListener("click", () => { viewAll = false; render(); });
    
    renderDiagnosesList();

    const searchInput = document.getElementById("diag-search");
    if (searchInput) {
      searchInput.value = searchQuery;
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderDiagnosesList();
      });
    }

    const addBtnEl = document.getElementById("add-btn");
    if (addBtnEl) addBtnEl.addEventListener("click", () => {
      // Client-side: only doctor and admin may open add modal
      if (!(currentUserData?.role === 'doctor' || currentUserData?.role === 'admin')) {
        alert('Ruxsat etilmagan: faqat shifokor yoki admin yangi tashxis qo\'yishi mumkin.');
        return;
      }
      resetForm();
      isModalOpen = true;
      render();
    });
    container.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget;
        const action = target.getAttribute("data-action");
        const id = target.getAttribute("data-id");
        const d = diagnoses.find((x) => x.id === id);
        if (!d) return;
        if (action === "view") {
          viewRecord = d;
          render();
        } else if (action === "edit") {
          handleEditOpen(d);
        } else if (action === "delete") {
          handleDelete(id);
        }
      });
    });
    renderModals();
  };

  const renderModals = () => {
    const mContainer = document.getElementById("modal-container");
    if (!mContainer) return;
    
    if (isModalOpen) {
      mContainer.innerHTML = diagnoseAddModalHtml;
      
      const modalTitle = document.getElementById("modal-title");
      if (modalTitle) modalTitle.innerText = editingId ? "Tashxis Qaydini Tahrirlash" : "Yangi Tashxis Varaqasi";

      // Populate patients dropdown
      const pSelect = document.getElementById("select-patient");
      if (pSelect) {
        pSelect.innerHTML = `<option value="">Ro'yxatdan bemorni tanlang</option>` + patients.map((p) => `
          <option value="${p.id}">${p.last_name || ""} ${p.first_name || ""}</option>
        `).join("");
        pSelect.value = formState.patient_id || "";
      }

      // Populate doctors dropdown if administrator or reception
      if (currentUserData?.role === "admin" || currentUserData?.role === "reception") {
        const docWrapper = document.getElementById("doctor-select-wrapper");
        if (docWrapper) showStrict(docWrapper);
        const docSelect = document.getElementById("select-doctor");
        if (docSelect) {
          docSelect.innerHTML = `<option value="">Shifokorni belgilang</option>` + Object.values(doctorsMap).map((d) => `
            <option value="${d.id}">Dr. ${d.last_name || ""} ${d.first_name || ""} (${d.specialty || "Mutaxassis"})</option>
          `).join("");
          docSelect.value = formState.doctor_id || "";
          docSelect.required = true;
        }
      }

      // Populate textarea & inputs
      const form = document.getElementById("diag-form");
      if (form) {
        form.querySelector("[name='description']").value = formState.description || "";
        const formattedDate = formState.treatment_start_date ? typeof formState.treatment_start_date === 'string' && formState.treatment_start_date.includes('T') ? formState.treatment_start_date.split('T')[0] : formState.treatment_start_date : '';
        form.querySelector("[name='treatmentStartDate']").value = formattedDate;
      }

      // Show/hide error
      const errorContainer = document.getElementById("form-error-container");
      const errorText = document.getElementById("form-error-text");
      if (errorContainer && errorText) {
        if (formError) {
          showStrict(errorContainer);
          errorContainer.classList.add("animate-shake");
          errorText.innerText = formError;
        } else {
          hideStrict(errorContainer);
        }
      }

      // Saving dynamic indicator
      const submitBtn = document.getElementById("submit-btn");
      if (submitBtn) {
        if (saving) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> SAQLANMOQDA...';
        } else {
          submitBtn.disabled = false;
          submitBtn.innerText = "SAQLASH";
        }
      }

      document.getElementById("close-modal")?.addEventListener("click", () => { isModalOpen = false; render(); });
      document.getElementById("cancel-modal")?.addEventListener("click", () => { isModalOpen = false; render(); });
      document.getElementById("diag-form")?.addEventListener("submit", handleSave);
    } else if (viewRecord) {
      const d = viewRecord;
      const p = patientsMap[d.patient_id];
      const docInfo = doctorsMap[d.doctor_id];

      mContainer.innerHTML = diagnoseViewModalHtml;

      const viewPatientFullname = document.getElementById("view-patient-fullname");
      if (viewPatientFullname) viewPatientFullname.innerText = `${p?.last_name || ''} ${p?.first_name || ''}`;

      const viewDoctorFullname = document.getElementById("view-doctor-fullname");
      if (viewDoctorFullname) viewDoctorFullname.innerText = `Dr. ${docInfo?.last_name || "Tizim Shifokori"} ${docInfo?.first_name || ""}`;

      const viewCreatedAt = document.getElementById("view-created-at");
      if (viewCreatedAt) viewCreatedAt.innerText = new Date(d.created_at).toLocaleDateString("uz-UZ");

      const viewTreatmentStart = document.getElementById("view-treatment-start");
      if (viewTreatmentStart) {
        viewTreatmentStart.innerText = d.treatment_start_date ? new Date(d.treatment_start_date).toISOString().split('T')[0] : "-";
      }

      const viewDescription = document.getElementById("view-description");
      if (viewDescription) viewDescription.innerText = `"${d.description}"`;

      document.getElementById("close-view")?.addEventListener("click", () => { viewRecord = null; render(); });
      document.getElementById("close-view-btn")?.addEventListener("click", () => { viewRecord = null; render(); });
      document.getElementById("diagnose-view-modal-backdrop")?.addEventListener("click", (e) => {
        if (e.target.id === "diagnose-view-modal-backdrop") {
          viewRecord = null;
          render();
        }
      });
      document.getElementById("pdf-download-btn")?.addEventListener("click", () => {
         generatePDF(d);
      });
    } else {
      mContainer.innerHTML = "";
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    // Prevent unauthorized submissions on the client side as a UX safeguard
    if (!(currentUserData?.role === 'doctor' || currentUserData?.role === 'admin' || currentUserData?.role === 'reception')) {
      setFormError("Ruxsat etilmagan: faqat shifokor, admin yoki qabul bo'limi tashxis qo'yishi mumkin.");
      setSaving(false);
      return;
    }
    const form = e.target;
    const data = new FormData(form);
    const dData = {
      patient_id: data.get("patientId"),
      description: data.get("description"),
      treatment_start_date: data.get("treatmentStartDate"),
      doctor_id: editingId 
        ? (diagnoses.find((x) => x.id === editingId) || {}).doctor_id 
        : (data.get("doctorId") || currentUserData.id)
    };
    try {
      let url = `${API_BASE}/api/diagnoses`;
      let method = 'POST';
      if (editingId) {
        url += '/' + editingId;
        method = 'PUT';
      }
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json', 
          'X-User-Role': currentUserData?.role || '', 
          'X-User-Id': currentUserData?.id || '' 
        },
        body: JSON.stringify(dData)
      });
      if (!res.ok) throw new Error("Qaydlash xatosi vujudga keldi.");
      isModalOpen = false;
      resetForm();
      fetchDiagnoses();
    } catch (err) {
      setFormError(err.message || "Xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    showConfirmModal({
      title: "Tashxisni o'chirish",
      message: "Haqiqatan ham ushbu tashxis vrachi qaydini butunlay o'chirmoqchisiz?",
      confirmText: "O'chirish"
    }).then(async (confirmed) => {
      if (!confirmed) return;
      try {
        const res = await fetch(`${API_BASE}/api/diagnoses/${id}`, { method: 'DELETE', headers: { 'X-User-Role': currentUserData?.role || '', 'X-User-Id': currentUserData?.id || '' } });
        if (!res.ok) {
          const data = await safeJson(res);
          throw new Error((data && data.error) || "Tashxisni o'chirishda xatolik yuz berdi.");
        }
        fetchDiagnoses();
      } catch (err) {
        console.error(err);
        alert(err.message);
      }
    });
  };

  const fetchDiagnoses = async () => {
    try {
      loading = true;
      render();
      
      const res = await fetch(`${API_BASE}/api/diagnoses`, { headers: { 'X-User-Role': currentUserData?.role || '', 'X-User-Id': currentUserData?.id || '' } });
      if (res.ok) {
        const parsed = await safeJson(res);
        let filtered = Array.isArray(parsed) ? parsed : [];
        
        // Filter based on role
        if (currentUserData.role === "patient") {
          filtered = filtered.filter(d => d.patient_id === currentUserData.id);
        } else if (currentUserData.role === "doctor") {
          filtered = filtered.filter(d => d.doctor_id === currentUserData.id);
        }
        diagnoses = filtered;
      }
    } catch(err) {
      console.error(err);
    } finally {
      loading = false;
      render();
    }
  }

  const init = async () => {
    loading = true;
    render();
    try {
      const [resDocs, resPats, resDiag] = await Promise.all([
        fetch(`${API_BASE}/api/users?role=doctor`),
        fetch(`${API_BASE}/api/users?role=patient`),
        fetch(`${API_BASE}/api/diagnoses`, { headers: { 'X-User-Role': currentUserData?.role || '', 'X-User-Id': currentUserData?.id || '' } })
      ]);

      if (resDocs.ok) {
        const dData = await safeJson(resDocs) || [];
        const docs = Array.isArray(dData) ? dData : [];
        docs.forEach(d => doctorsMap[d.id] = d);
      }

      if (resPats.ok) {
        const pData = await safeJson(resPats) || [];
        patients = Array.isArray(pData) ? pData : [];
        patients.forEach(p => patientsMap[p.id] = p);
      }

      if (resDiag.ok) {
        const pData = await safeJson(resDiag) || [];
        let data = Array.isArray(pData) ? pData : [];
        
        // Filter based on role
        if (currentUserData.role === "patient") {
          data = data.filter(d => d.patient_id === currentUserData.id);
        } else if (currentUserData.role === "doctor") {
          data = data.filter(d => d.doctor_id === currentUserData.id);
        }
        diagnoses = data;
      }
    } catch (err) {
      console.error(err);
    } finally {
      loading = false;
      render();
    }
  };

  init();
  return () => {};
}

export { renderDiagnoses };
