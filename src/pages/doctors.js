import { currentUserData } from "../auth.js";
import { hideStrict, showStrict } from "../ui.js";
import doctorsHtml from "./templates/doctors.html?raw";
import { safeJson } from "../lib/api.js";
import { showConfirmModal } from "../confirm.js";
import doctorAddModalHtml from "./templates/doctor_add_modal.html?raw";
import doctorViewModalHtml from "./templates/doctor_view_modal.html?raw";
import doctorSuccessModalHtml from "./templates/doctor_success_modal.html?raw";
const pdfjsWorker = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

let doctorsCache = null;

async function renderDoctors(container) {
  const { jsPDF } = await import("jspdf/dist/jspdf.umd.min.js");
  const pdfjsLib = await import('pdfjs-dist');
  
  // Configure PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

    if (currentUserData?.role !== "admin" && currentUserData?.role !== "reception" && currentUserData?.role !== "doctor") {
      container.innerHTML = `<div class="p-8 text-center text-rose-500 font-extrabold uppercase tracking-widest animate-shake">Ruxsat ma'lum qilinmadi</div>`;
    return () => {};
  }
  let doctors = doctorsCache || [];
  let loading = !doctorsCache;
  let isModalOpen = false;
  let formError = "";
  let saving = false;
  let editingId = "";
  let viewRecord = null;
  let searchQuery = "";
  let formState = {
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birth_date: "",
    address: "",
    specialty: "",
    role: "doctor",
    bio: "",
    resume_text: "",
    room_number: ""
  };
  
  const setFormError = (msg) => {
    formError = msg;
    render();
  };
  const setSaving = (val) => {
    saving = val;
    renderModals();
  };
  const resetForm = () => {
    formState = { first_name: "", last_name: "", email: "", phone: "", birth_date: "", address: "", specialty: "", role: "doctor", bio: "", resume_text: "", room_number: "" };
    editingId = "";
    formError = "";
  };

  const handleEditOpen = (d) => {
    editingId = d.id;
    formState = { ...d };
    isModalOpen = true;
    renderModals();
  };
  
  const getFilteredDoctors = () => {
    return doctors.filter(p => {
      const q = searchQuery.toLowerCase();
      const fn = (p.first_name || '').toLowerCase();
      const ln = (p.last_name || '').toLowerCase();
      const em = (p.email || '').toLowerCase();
      const ph = (p.phone || '').toLowerCase();
      return fn.includes(q) || ln.includes(q) || em.includes(q) || ph.includes(q);
    });
  };

  const renderTableBody = () => {
    const tbody = document.getElementById("doctors-tbody");
    if (!tbody) return;
    
    const filteredDoctors = getFilteredDoctors();
    
    if (loading) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-24 text-center"><div class="flex justify-center"><span class="w-10 h-10 border-4 border-slate-100 dark:border-slate-800/20 border-t-teal-600 rounded-full animate-spin"></span></div></td></tr>`;
      return;
    }
    
    if (filteredDoctors.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-24 text-center text-slate-400 dark:text-slate-500 font-bold italic">Hech qanday tibbiy xodim topilmadi.</td></tr>`;
      return;
    }
    
    tbody.innerHTML = filteredDoctors.map((d) => `
       <tr class="hover:bg-slate-50/45 dark:hover:bg-slate-900/10 transition-all group/row">
        <td class="p-5.5 align-middle">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950/40 dark:to-teal-905/10 text-teal-700 dark:text-teal-400 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 transition-all shadow-xs border border-teal-100/30 dark:border-teal-950/20">
              ${(d.first_name || 'X')[0]}${(d.last_name || 'X')[0]}
            </div>
            <div>
              <div class="font-extrabold text-[#111827] dark:text-white text-base tracking-tight leading-none">${d.role === "doctor" ? "Dr. " : ""}${d.last_name || ""} ${d.first_name || ""}</div>
              <div class="text-[11px] text-slate-450 dark:text-slate-500 font-semibold mt-1.5">${d.role === 'doctor' ? `${d.specialty || 'Terapevt'} (Xona: ${d.room_number || 'Biriktirilmagan'})` : 'Qabulxona boshqaruvchisi'}</div>
            </div>
          </div>
        </td>
        <td class="p-5.5 align-middle hidden md:table-cell">
          <span class="inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-extrabold border ${d.role === "doctor" ? "bg-teal-50 dark:bg-teal-500/10 text-teal-700 border-teal-100/20" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-100/20"}">
            ${d.role === "doctor" ? `${d.specialty || "SHIFOKOR"} (Xona: ${d.room_number || "Biriktirilmagan"})` : "RO'YXATXONA (RECEPTION)"}
          </span>
        </td>
        <td class="p-5.5 text-slate-700 dark:text-slate-300 align-middle hidden lg:table-cell">
           <div class="flex flex-col gap-1.5">
             <div class="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-teal-550 shrink-0"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  ${d.phone || '-'}
             </div>
             <div class="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  ${d.email || "-"}
             </div>
           </div>
         </td>
         <td class="p-5.5 text-right align-middle whitespace-nowrap">
          <div class="flex justify-end gap-1.5">
            <button data-action="view" data-id="${d.id}" class="btn-ghost !p-2 cursor-pointer" title="Ko'rish">
               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-teal-600 dark:text-teal-400"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${currentUserData?.role === "admin" || currentUserData?.role === "reception" || currentUserData?.role === "doctor" ? `
              <button data-action="edit" data-id="${d.id}" class="btn-ghost !p-2 hover:bg-amber-50 dark:hover:bg-amber-955/20 text-amber-500 cursor-pointer" title="Tahrirlash">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button data-action="delete" data-id="${d.id}" class="btn-ghost !p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 cursor-pointer" title="O'chirish">
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
        const d = doctors.find((x) => x.id === id);
        if (!d) return;
        if (action === "view") {
          viewRecord = d;
          renderModals();
        } else if (action === "edit") {
          handleEditOpen(d);
        } else if (action === "delete") {
          showConfirmModal({
            title: "Xodimni o'chirish",
            message: `Rostdan ham shifokor ${d.last_name || ""} ${d.first_name || ""} ma'lumotlarini butunlay o'chirib tashlamoqchimisiz?`,
            confirmText: "O'chirish"
          }).then((confirmed) => {
            if (confirmed) handleDelete(id);
          });
        }
      });
    });
  };

  const render = () => {
    container.innerHTML = doctorsHtml;

    if (currentUserData?.role !== "admin" && currentUserData?.role !== "reception" && currentUserData?.role !== "doctor") {
      const addBtn = document.getElementById("add-btn");
      if (addBtn) hideStrict(addBtn);
    }

    renderTableBody();

    const searchInput = document.getElementById("doc-search");
    if (searchInput) {
      searchInput.value = searchQuery;
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value;
        renderTableBody();
      });
    }

    const addBtn = document.getElementById("add-btn");
    if (addBtn) addBtn.addEventListener("click", () => {
      resetForm();
      isModalOpen = true;
      renderModals();
    });
    
    renderModals();
  };

  const renderModals = () => {
    const mContainer = document.getElementById("modal-container");
    if (!mContainer) return;
    
    if (isModalOpen) {
      mContainer.innerHTML = doctorAddModalHtml;
      
      if (editingId) {
        const modalTitle = mContainer.querySelector("h2");
        if (modalTitle) modalTitle.innerText = "Xodim Ma'lumotlarini Tahrirlash";
        const modalSubtitle = mContainer.querySelector("p");
        if (modalSubtitle) modalSubtitle.innerText = "Mavjud shifokor yoki qabulxona xodimi profilini tahrirlash";
        const pwdInput = mContainer.querySelector("[name='password']");
        if (pwdInput) pwdInput.removeAttribute("required");
      }
      
      const form = document.getElementById("doc-form");
      if (form) {
        form.querySelector("[name='firstName']").value = formState.first_name || "";
        form.querySelector("[name='lastName']").value = formState.last_name || "";
        form.querySelector("[name='phone']").value = formState.phone || "";
        form.querySelector("[name='birth_date']").value = formState.birth_date || "";
        form.querySelector("[name='address']").value = formState.address || "";
        form.querySelector("[name='role']").value = formState.role || "doctor";
        form.querySelector("[name='specialty']").value = formState.specialty || "";
        form.querySelector("[name='email']").value = formState.email || "";
        form.querySelector("[name='password']").value = formState.password || "654321";
        form.querySelector("[name='bio']").value = formState.bio || "";
        form.querySelector("[name='resume_text']").value = formState.resume_text || "";
      }

      const errorContainer = document.getElementById("form-error-container");
      const errorText = document.getElementById("form-error-text");
      if (errorContainer && errorText) {
        if (formError) {
          errorContainer.classList.remove("hidden");
          errorContainer.classList.add("animate-shake");
          errorText.innerText = formError;
        } else {
          errorContainer.classList.add("hidden");
        }
      }

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
      
      const roleSelect = document.getElementById("role-select");
      const specInput = document.getElementById("spec-input");
      const roomSelectionContainer = document.getElementById("room-selection-container");
      // If the logged-in user is a doctor, force creation mode to 'patient' and hide doctor-only fields
      if (currentUserData?.role === 'doctor' && roleSelect) {
        roleSelect.value = 'patient';
        roleSelect.disabled = true;
        if (specInput) specInput.disabled = true;
        roomSelectionContainer?.classList.add('hidden');
      }
      if (roleSelect && specInput) {
        roleSelect.addEventListener("change", () => {
          if (roleSelect.value === "doctor") {
            specInput.disabled = false;
            roomSelectionContainer?.classList.remove("hidden");
          } else {
            specInput.disabled = true;
            specInput.value = "";
            roomSelectionContainer?.classList.add("hidden");
          }
        });
        if (roleSelect.value !== "doctor") {
          specInput.disabled = true;
          roomSelectionContainer?.classList.add("hidden");
        }
      }

      // Load clinic vacant rooms dropdown list and tip messages dynamically
      const loadRoomsAndComputeVacants = async () => {
        try {
          const roomsRes = await fetch('/api/rooms').then(r => safeJson(r));
          
          // Compute set of occupied room numbers
          const occupiedRooms = {};
          doctors.forEach(doc => {
            if (doc.room_number && doc.id !== editingId) {
              occupiedRooms[doc.room_number] = `${doc.last_name || ""} ${doc.first_name || ""}`;
            }
          });
          
          const roomSelectField = document.getElementById("room-select-field");
          if (!roomSelectField) return;
          
          roomSelectField.innerHTML = '<option value="">-- Klinikadagi Bo\'sh Xonalar --</option>';
          
          roomsRes.forEach(r => {
            const isOccupied = occupiedRooms[r.room_number];
            const opt = document.createElement("option");
            opt.value = r.room_number;
            if (isOccupied) {
              opt.innerText = `${r.room_number}-xona (${r.specialty}) - BAND (${isOccupied})`;
              opt.disabled = true;
              opt.classList.add("text-slate-400");
            } else {
              const isSelf = formState.room_number && (String(formState.room_number) === String(r.room_number));
              opt.innerText = `${r.room_number}-xona (${r.specialty}) - ${isSelf ? "AMALDAGI XONASI (O'RNATILGAN)" : "BO'SH"}`;
            }
            roomSelectField.appendChild(opt);
          });
          
          if (formState.room_number) {
            roomSelectField.value = formState.room_number;
          }
          
          const vacantRoomsList = roomsRes.filter(r => !occupiedRooms[r.room_number]);
          const tipMsgEl = document.getElementById("room-tip-message");
          if (tipMsgEl) {
            if (vacantRoomsList.length > 0) {
              const formattedList = vacantRoomsList.map(v => `${v.room_number} (${v.specialty})`).join(', ');
              tipMsgEl.innerHTML = `<span class="text-teal-650 dark:text-teal-400 font-extrabold uppercase">Klinikadagi bo'sh xonalar ro'yxati:</span> ${formattedList}`;
            } else {
              tipMsgEl.innerHTML = `<span class="text-rose-500 font-bold uppercase">Xatolik: Klinikada mutaxassislar uchun bo'sh xona qolmagan.</span>`;
            }
          }
          
          // Auto suggestion matching criteria
          const suggestBtn = document.getElementById("auto-suggest-room");
          suggestBtn?.addEventListener("click", () => {
            const currentSpec = (specInput.value || "").trim().toLowerCase();
            if (!currentSpec) {
              specInput.focus();
              specInput.classList.add("border-rose-500", "ring-rose-200", "dark:border-rose-805");
              if (tipMsgEl) {
                tipMsgEl.innerHTML = `<span class="text-rose-600 dark:text-rose-400 font-extrabold animate-pulse block">⚠️ Xonani taklif qilish uchun avval shifokor mutaxassisligini kiriting!</span>`;
              }
              setTimeout(() => {
                specInput.classList.remove("border-rose-500", "ring-rose-200", "dark:border-rose-805");
              }, 3000);
              return;
            }
            
            // Look for vacant room of matching specialty
            const matchedVacantRoom = vacantRoomsList.find(r => 
              r.specialty.toLowerCase().includes(currentSpec) || 
              currentSpec.includes(r.specialty.toLowerCase())
            );
            
            if (matchedVacantRoom) {
              roomSelectField.value = matchedVacantRoom.room_number;
              if (tipMsgEl) {
                tipMsgEl.innerHTML = `<span class="text-emerald-500 font-black uppercase tracking-tight animate-bounce">✨ ${matchedVacantRoom.room_number}-hona bo'sh shuning uchun ${matchedVacantRoom.room_number}-hona sizga!</span>`;
              }
            } else {
              if (vacantRoomsList.length > 0) {
                // If no exact match, fallback to first vacant room
                const fallbackRoom = vacantRoomsList[0];
                roomSelectField.value = fallbackRoom.room_number;
                if (tipMsgEl) {
                  tipMsgEl.innerHTML = `<span class="text-amber-500 font-bold leading-relaxed">${currentSpec} uchun maxsus xona topilmadi, ammo bo'sh bo'lgan ${fallbackRoom.room_number}-xona (${fallbackRoom.specialty}) sizga biriktirildi.</span>`;
                }
              } else {
                if (tipMsgEl) {
                  tipMsgEl.innerHTML = `<span class="text-rose-500 font-black">Xozircha bo'sh xonalar mavjud emas.</span>`;
                }
              }
            }
          });
          
        } catch(err) {
          console.error("Failed parsing status of database rooms:", err);
        }
      };

      loadRoomsAndComputeVacants();

      document.getElementById("doc-form")?.addEventListener("submit", handleSave);

      const resumeFileInput = document.getElementById("resume-file");
      const fileNameLabel = document.getElementById("file-name-label");
      const extractionStatus = document.getElementById("extraction-status");
      const resumeTextInput = document.getElementById("resume-text-input");
      const bioTextarea = document.getElementById("bio-textarea");

      resumeFileInput?.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        fileNameLabel.innerText = file.name;
        extractionStatus.classList.remove("hidden");

        try {
          if (file.type === "application/pdf") {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let extractedText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const content = await page.getTextContent();
              extractedText += content.items.map(item => item.str).join(' ') + '\n';
            }
            resumeTextInput.value = extractedText;
            if (bioTextarea && !bioTextarea.value) {
                bioTextarea.value = (extractedText.substring(0, 300) + (extractedText.length > 300 ? '...' : '')).trim();
            }
          } else if (file.type === "text/plain") {
            const text = await file.text();
            resumeTextInput.value = text;
            if (bioTextarea && !bioTextarea.value) {
              bioTextarea.value = (text.substring(0, 300) + (text.length > 300 ? '...' : '')).trim();
            }
          }
          extractionStatus.innerText = "Rezyume ma'lumotlari muvaffaqiyatli yuklanib, tahlil qilindi!";
          extractionStatus.classList.remove("text-teal-600", "animate-pulse");
          extractionStatus.classList.add("text-emerald-500");
        } catch (err) {
          console.error(err);
          extractionStatus.innerText = "Yuklash xatosi: " + err.message;
          extractionStatus.classList.remove("text-teal-600", "animate-pulse");
          extractionStatus.classList.add("text-rose-500");
        }
      });

      const aiBtn = document.getElementById("ai-generate-bio-btn");
      const aiStatus = document.getElementById("ai-status");
      aiBtn?.addEventListener("click", async () => {
         const firstName = document.querySelector("input[name='firstName']")?.value || "";
         const lastName = document.querySelector("input[name='lastName']")?.value || "";
         const specialty = document.querySelector("input[name='specialty']")?.value || "";
         const resume_text = document.getElementById("resume-text-input")?.value || "";
         const existing_bio = bioTextarea?.value || "";

         if (!firstName && !lastName) {
           alert("Iltimos, avval xodim ismi va familiyasini kiriting yoki fayl yuklang.");
           return;
         }

         aiStatus.innerText = "Ma'lumotlar bo'yicha sun'iy intellekt tahlil qilmoqda, sabr qiling...";
         aiStatus.classList.remove("hidden", "text-rose-500", "text-emerald-500");
         aiStatus.classList.add("text-teal-605", "animate-pulse");

         try {
           const res = await fetch("/api/ai/generate-bio", {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({
               name: lastName + " " + firstName,
               specialty,
               raw_resume: resume_text,
               existing_bio
             })
           });
           const resJSON = await safeJson(res);
           if (!res.ok) throw new Error(resJSON.error || "AI xizmatda xatolik yuz berdi");

           if (bioTextarea) bioTextarea.value = resJSON.text;
           aiStatus.innerText = "Tarjimai hol AI tomonidan muvaffaqiyatli shakllantirildi!";
           aiStatus.classList.remove("text-teal-605", "animate-pulse");
           aiStatus.classList.add("text-emerald-500");
         } catch(err) {
           console.error(err);
           aiStatus.innerText = "AI xatoligi: " + err.message;
           aiStatus.classList.remove("text-teal-605", "animate-pulse");
           aiStatus.classList.add("text-rose-500");
         }
      });
    } else if (viewRecord) {
      const d = viewRecord;
      mContainer.innerHTML = doctorViewModalHtml;
      
      const cardTitle = document.getElementById("doc-card-title");
      if (cardTitle) cardTitle.innerText = d.role === 'doctor' ? 'Mutaxassis Shifokor Karta' : 'Platforma Xodim Karta';

      const avatarCircle = document.getElementById("view-avatar-circle");
      if (avatarCircle) avatarCircle.innerText = `${(d.first_name?.[0] || 'D')}${(d.last_name?.[0] || '')}`;

      const roleBadge = document.getElementById("view-role-badge");
      if (roleBadge) roleBadge.innerText = `Lavozim: ${d.role === "doctor" ? "Shifokor" : "Receptionist"}`;

      const viewFullName = document.getElementById("view-fullname");
      if (viewFullName) viewFullName.innerText = `${d.last_name || ""} ${d.first_name || ""}`;

      const viewSpecialty = document.getElementById("view-specialty");
      if (viewSpecialty) viewSpecialty.innerText = d.specialty || "Ro'yxatga oluvchi xizmatchi";

      const viewEmail = document.getElementById("view-email");
      if (viewEmail) viewEmail.innerText = d.email || "-";

      const viewPhone = document.getElementById("view-phone");
      if (viewPhone) viewPhone.innerText = d.phone || "-";

      const viewBirthdate = document.getElementById("view-birthdate");
      if (viewBirthdate) viewBirthdate.innerText = d.birth_date || "-";

      const viewAddress = document.getElementById("view-address");
      if (viewAddress) viewAddress.innerText = d.address || "-";

      const viewBio = document.getElementById("view-bio");
      if (viewBio) viewBio.innerText = d.bio ? `"${d.bio}"` : "Mutaxassis haqida qisqacha ma'lumotlar mavjud emas.";

      const viewRoomEl = document.getElementById("view-room-number");
      if (viewRoomEl) {
        viewRoomEl.innerText = d.room_number || "Biriktirilmagan";
      }

      // Hide room badge container if it's receptionist
      if (d.role !== 'doctor') {
        const viewRoomContainer = document.getElementById("view-room-container");
        if (viewRoomContainer) viewRoomContainer.classList.add("hidden");
        const connectedPatientsWrapper = document.getElementById("connected-patients-wrapper");
        if (connectedPatientsWrapper) connectedPatientsWrapper.classList.add("hidden");
      } else {
        // Fetch and display connected patients (Requested: list of patients connected to that doctor)
        const connectedListEl = document.getElementById("connected-patients-list");
        if (connectedListEl) {
          (async () => {
            try {
              const [diagRes, patientRes] = await Promise.all([
                fetch(`/api/diagnoses?doctor_id=${d.id}`, { headers: { 'X-User-Role': currentUserData?.role || '', 'X-User-Id': currentUserData?.id || '' } }).then(r => safeJson(r)),
                fetch('/api/users?role=patient').then(r => safeJson(r))
              ]);
              
              const uniquePatientIds = [...new Set(diagRes.map(x => x.patient_id))];
              const connectedPatients = patientRes.filter(p => uniquePatientIds.includes(p.id));
              
              if (connectedPatients.length === 0) {
                connectedListEl.innerHTML = `<li class="py-3 text-slate-400 dark:text-slate-500 italic text-xs">Ushbu shifokorga biriktirilgan faol bemorlar topilmadi.</li>`;
              } else {
                connectedListEl.innerHTML = connectedPatients.map(p => `
                  <li class="py-2 flex justify-between items-center text-xs">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 flex items-center justify-center font-bold text-xs shrink-0">
                        ${p.first_name?.[0] || 'B'}
                      </div>
                      <div>
                        <span class="font-bold text-slate-800 dark:text-slate-200 block">${p.last_name || ""} ${p.first_name || ""}</span>
                        <span class="text-[9px] text-slate-405 dark:text-slate-500 block">Kodi: ${p.icd_code || 'Yo\'q'} • Tel: ${p.phone || '-'}</span>
                      </div>
                    </div>
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-400 uppercase tracking-widest">
                       ${p.status || 'Active'}
                    </span>
                  </li>
                `).join('');
              }
            } catch (pErr) {
              console.error("Failed loading patient linkages:", pErr);
              connectedListEl.innerHTML = `<li class="py-3 text-rose-500 text-xs font-semibold">Bemorlarni bog'lash ro'yxatini yuklashda muammo yuz berdi.</li>`;
            }
          })();
        }
      }

      const viewResumeText = document.getElementById("view-resume-text");
      const viewResumeContainer = document.getElementById("view-resume-container");
      if (viewResumeText && viewResumeContainer) {
        if (d.resume_text) {
          viewResumeText.innerText = d.resume_text;
          viewResumeContainer.classList.remove("hidden");
        } else {
          viewResumeContainer.classList.add("hidden");
        }
      }

      const downloadUserPdfBtn = document.getElementById("download-user-pdf");
      if (downloadUserPdfBtn) {
        if (currentUserData.role === 'admin') {
          downloadUserPdfBtn.classList.remove("hidden");
          downloadUserPdfBtn.addEventListener("click", () => generateDoctorFullPDF(d));
        } else {
          downloadUserPdfBtn.classList.add("hidden");
        }
      }

      document.getElementById("close-view")?.addEventListener("click", () => { viewRecord = null; render(); });
      document.getElementById("close-view-btn")?.addEventListener("click", () => { viewRecord = null; render(); });
      document.getElementById("doctor-view-modal-backdrop")?.addEventListener("click", (e) => {
        if (e.target.id === "doctor-view-modal-backdrop") {
          viewRecord = null;
          render();
        }
      });
    } else {
      mContainer.innerHTML = "";
    }
  };

  const generatePassPDF = (u) => {
     const doc = new jsPDF();
     doc.setFillColor(13, 148, 136); doc.rect(0, 0, 210, 40, 'F');
     doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont("helvetica", "bold");
     doc.text("CLINICA PRO PORTAL", 105, 25, { align: "center" });
     
     doc.setTextColor(15, 23, 42); doc.setFontSize(15);
     doc.text("KIRISH MA'LUMOTLARI PROTOKOLI", 105, 55, { align: "center" });
     
     doc.setFontSize(11);
     doc.setFont("helvetica", "normal");
     doc.text(`Ism Familiya: ${u.last_name || ""} ${u.first_name || ""}`, 40, 75);
     doc.text(`Login: ${u.email || u.phone || ""}`, 40, 85);
     doc.setFont("helvetica", "bold");
     doc.text(`Kirish paroli: ${u.password}`, 40, 95);
     doc.setFont("helvetica", "normal");
     if (u.room_number) {
       doc.text(`Biriktirilgan amaliy xona: ${u.room_number}-xona`, 40, 102);
     }
     
     doc.setDrawColor(226, 232, 240); doc.line(40, 106, 170, 106);
     
     doc.setFontSize(9); doc.setTextColor(148, 163, 184);
     doc.text("Ushbu maxfiy ma'lumotlarni ehtiyotkorlik bilan saqlang.", 105, 114, { align: "center" });
     
    try {
      console.debug('generatePassPDF (doctor): creating blob');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const opened = (() => { try { return !!window.open(url, '_blank'); } catch (err) { return false; } })();
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Kalitlar_${u.first_name || 'Xodim'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('generatePassPDF (doctor) error, falling back to save():', e);
      try { doc.save(`Kalitlar_${u.first_name || 'Xodim'}.pdf`); } catch (err) { console.error('doc.save failed:', err); alert('PDF yaratishda xatolik: ' + err?.message); }
    }
  };

  const generateDoctorFullPDF = (d) => {
    const doc = new jsPDF();
    doc.setFillColor(13, 148, 136); doc.rect(0, 0, 210, 42, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.setFont("helvetica", "bold");
    doc.text("XODIM SHAXSIY ANKETASI", 105, 25, { align: "center" });
    
    doc.setTextColor(15, 23, 42); doc.setFontSize(11);
    doc.text(`Tayyorlangan kun: ${new Date().toLocaleDateString()}`, 20, 52);
    doc.setDrawColor(226, 232, 240); doc.line(20, 58, 190, 58);
    
    doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.text("Xodim Profil ma'lumotlari:", 20, 68);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    doc.text(`F.I.SH: ${d.last_name || ""} ${d.first_name || ""}`, 25, 78);
    doc.text(`Mantiqiy roli: ${d.role === 'doctor' ? 'SHIFOKOR MUTAXASSIS' : 'QABULXONA XODIMI'}`, 25, 86);
    doc.text(`Yo'nalish / Mutaxassisligi: ${d.specialty || "-"}`, 25, 94);
    if (d.room_number) {
      doc.text(`Biriktirilgan xona raqami: ${d.room_number}-xona`, 25, 102);
    }
    doc.text(`Bog'lanish telefoni: ${d.phone || "-"}`, 25, 110);
    doc.text(`Email ro'yxat: ${d.email || "-"}`, 25, 118);
    doc.text(`Tug'ilgan sanasi: ${d.birth_date || "-"}`, 25, 126);
    doc.text(`Yashash turar manzili: ${d.address || "-"}`, 25, 134);
    
    doc.line(20, 142, 190, 142);
    
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text("Qisqacha biografiyasi hamda tajribasi:", 20, 154);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const bioLines = doc.splitTextToSize(d.bio || "Ma'lumotlar topilmadi.", 165);
    doc.text(bioLines, 25, 164);
    
    let currentY = 164 + bioLines.length * 7 + 10;

    if (d.resume_text) {
        doc.addPage();
        doc.setFillColor(13, 148, 136); doc.rect(0, 0, 210, 25, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text("TAHLIL ETILGAN PROFESSIONAL REZYUME MATNI", 105, 16, { align: "center" });

        doc.setTextColor(30, 41, 59); doc.setFontSize(10); doc.setFont("helvetica", "normal");
        const resumeLines = doc.splitTextToSize(d.resume_text, 180);
        const resumeLinesBound = doc.splitTextToSize(d.resume_text, 180);
        
        let py = 35;
        resumeLinesBound.forEach(line => {
            if (py > 280) {
                doc.addPage();
                py = 20;
            }
            doc.text(line, 15, py);
            py += 6.5;
        });
        currentY = py + 10;
    }
    
    const finalY = Math.min(265, currentY + 15);
    doc.setDrawColor(13, 148, 136); doc.setLineWidth(1); doc.circle(165, finalY, 15);
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("CLINICA PRO", 165, finalY - 2, { align: "center" });
    doc.text("KADRLAR", 165, finalY + 2, { align: "center" });
    
    try {
      console.debug('generateDoctorFullPDF: creating blob');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const opened = (() => { try { return !!window.open(url, '_blank'); } catch (err) { return false; } })();
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Xodim_Karta_Ma'lumot_${d.last_name}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('generateDoctorFullPDF error, falling back to save():', e);
      try { doc.save(`Xodim_Karta_Ma'lumot_${d.last_name}.pdf`); } catch (err) { console.error('doc.save failed:', err); alert('PDF yaratishda xatolik: ' + err?.message); }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    const form = e.target;
    const data = new FormData(form);
    const dData = {
      first_name: data.get("firstName"),
      last_name: data.get("lastName"),
      email: data.get("email"),
      password: data.get("password"),
      role: data.get("role"),
      specialty: data.get("role") === "doctor" ? data.get("specialty") : "",
      phone: data.get("phone"),
      birth_date: data.get("birth_date"),
      address: data.get("address"),
      bio: data.get("bio"),
      resume_text: data.get("resume_text"),
      room_number: data.get("role") === "doctor" ? data.get("room_number") : "",
      doctorId: data.get("doctorId") || null
    };

    // If the current logged-in user is a doctor, enforce creating a patient and assign doctorId
    if (currentUserData?.role === 'doctor' && !editingId) {
      dData.role = 'patient';
      dData.doctorId = currentUserData.id;
    }
    try {
      let res;
      const headers = { 'Content-Type': 'application/json' };
      if (currentUserData?.role) headers['X-User-Role'] = currentUserData.role;
      if (currentUserData?.id) headers['X-User-Id'] = currentUserData.id;

      if (editingId) {
        res = await fetch(`/api/users/${editingId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify(dData)
        });
      } else {
        res = await fetch('/api/users', {
          method: 'POST',
          headers,
          body: JSON.stringify(dData)
        });
      }
      const resJSON = await safeJson(res) || {};
      if (!res.ok) throw new Error((editingId ? "Tahrirlashda xatolik: " : "Yaratishda xatolik: ") + (resJSON.error || "Ushbu ma'lumotlar bilan xodim allaqachon ro'yxatga olingan"));
      
      isModalOpen = false;
      const wasEditing = !!editingId;
      resetForm();
      fetchData();
      
      if (wasEditing) {
        alert("Xodim ma'lumotlari muvaffaqiyatli yangilandi.");
        render();
      } else {
        const mContainer = document.getElementById("modal-container");
        if (mContainer) {
          mContainer.innerHTML = doctorSuccessModalHtml;
          
          const roleText = document.getElementById("success-role-text");
          if (roleText) roleText.innerText = dData.role === 'doctor' ? 'Mutaxassis Shifokor' : 'Qabulxona boshqaruvchisi';

          const emailText = document.getElementById("success-email");
          if (emailText) emailText.innerText = dData.email;

          const passwordText = document.getElementById("success-password");
          if (passwordText) passwordText.innerText = dData.password;

          const successRoomContainer = document.getElementById("success-room-container");
          const successRoomText = document.getElementById("success-room-text");
          if (successRoomContainer && successRoomText && dData.room_number) {
            successRoomContainer.classList.remove("hidden");
            successRoomText.innerText = `${dData.room_number}-hona bosh shuning uchun ${dData.room_number}-hona sizga biriktirildi!`;
          }

          document.getElementById("close-success-view")?.addEventListener("click", render);
          document.getElementById("close-success-btn")?.addEventListener("click", render);
          document.getElementById("download-pass-pdf")?.addEventListener("click", () => generatePassPDF(dData));

          // Auto login credentials download
          try {
             generatePassPDF(dData);
          } catch (pdfErr) {
             console.warn("Auto PDF generation failed:", pdfErr.message);
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
    try {
      const res = await fetch('/api/users/' + id, { method: 'DELETE' });
      if (!res.ok) {
         const data = await safeJson(res);
         throw new Error(data.error || "Ushbu xodimni tizimdan o'chirib bo'lmagandi.");
      }
      fetchData();
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  const fetchData = async () => {
    try {
      loading = true;
      const [res, res2] = await Promise.all([
        fetch('/api/users?role=doctor'),
        fetch('/api/users?role=reception')
      ]);

      if (!res.ok || !res2.ok) throw new Error("API xatosi");

      const [d1, d2] = await Promise.all([
        safeJson(res),
        safeJson(res2)
      ]);

      let data = Array.isArray(d1) ? d1 : [];
      let data2 = Array.isArray(d2) ? d2 : [];
      doctors = [...(Array.isArray(data) ? data : []), ...(Array.isArray(data2) ? data2 : [])];
      doctorsCache = doctors;
      loading = false;
      renderTableBody();
    } catch(err) {
      console.error(err);
      loading = false;
      render();
    }
  };
  
  fetchData();
  render();
  
  return () => {};
}

export { renderDoctors };
