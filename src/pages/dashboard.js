import { currentUserData } from "../auth.js";
import { jsPDF } from "jspdf/dist/jspdf.umd.min.js";
import { db } from "../firebase.js";
import { collection, getDocs, query, where } from "firebase/firestore";
import { hideStrict, showStrict } from "../ui.js";
import { safeJson } from "../lib/api.js";
import dashboardHtml from "./templates/dashboard.html?raw";

async function renderDashboard(container) {
  const { jsPDF } = await import("jspdf/dist/jspdf.umd.min.js");
  let stats = { patients: 0, doctors: 0, diagnoses: 0 };
  let myDoctor = null;
  let myDiagnoses = [];
  let recentDiagnosesCombined = [];
  const isAdmin = currentUserData?.role === 'admin';
  const isDoctor = currentUserData?.role === 'doctor';
  const isReception = currentUserData?.role === 'reception';
  const isPatient = currentUserData?.role === 'patient';
  
  const render = () => {
    // Determine the user role and welcome text
    const roleLabel = isAdmin
      ? "Bosh Administrator"
      : isDoctor
        ? "Shifokor-Mutaxassis"
        : isReception
          ? "Registratura"
          : "Bemor";

    container.innerHTML = dashboardHtml;
    
    const dashboardDateElem = document.getElementById("dashboard-date");
    if (dashboardDateElem) {
      dashboardDateElem.innerText = `Tizim yangilandi: bugun, ${new Date().toLocaleDateString("en-US")}`;
    }

    const roleLabelElem = document.getElementById("dashboard-role-label");
    if (roleLabelElem) {
      roleLabelElem.innerHTML = `${roleLabel} paneli <span class="text-slate-300 dark:text-slate-700 mx-1.5">•</span> Clinica Pro tizimi`;
    }

    const userNameElem = document.getElementById("user-name");
    if (userNameElem) {
      userNameElem.innerText = currentUserData.first_name || "Foydalanuvchi";
    }

    const liveCalElem = document.getElementById("live-calendar-date");
    if (liveCalElem) {
      liveCalElem.innerText = new Date().toLocaleDateString("uz-UZ", { day: '2-digit', month: 'long', year: 'numeric' });
    }

    if (isPatient) {
      const spravkaContainer = document.getElementById("download-spravka-container");
      if (spravkaContainer) {
        spravkaContainer.innerHTML = `<button id="download-spravka" class="btn-primary flex-none cursor-pointer">
              <svg xmlns="http://www.w3.org/2500/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              YUKLAB OLISH (PDF)
            </button>`;
      }
    }
    
    // Fill Stats Grid Visibilities
    const patientsCard = document.getElementById("stats-patients-card");
    const doctorsCard = document.getElementById("stats-doctors-card");
    const diagnosesCard = document.getElementById("stats-diagnoses-card");

    const isAdminOrReception = isAdmin || isReception;

    if (patientsCard) {
      if (isAdmin) {
        showStrict(patientsCard);
        const label = document.getElementById("stats-patients-label");
        const countElem = document.getElementById("stats-patients-count");
        if (label) label.innerText = "Bemorlar Kartotekasi";
        if (countElem) countElem.innerText = stats.patients;
      } else if (isDoctor) {
        showStrict(patientsCard);
        const countElem = document.getElementById("stats-patients-count");
        const label = document.getElementById("stats-patients-label");
        if (label) label.innerText = "Mening Bemorlarim";
        if (countElem) countElem.innerText = stats.patients;
      } else if (isReception) {
        showStrict(patientsCard);
        const countElem = document.getElementById("stats-patients-count");
        const label = document.getElementById("stats-patients-label");
        if (label) label.innerText = "Qabuldagi Bemorlar";
        if (countElem) countElem.innerText = stats.patients;
      } else {
        hideStrict(patientsCard);
      }
    }

    if (doctorsCard) {
      if (isAdmin) {
        showStrict(doctorsCard);
        const countElem = document.getElementById("stats-doctors-count");
        const label = document.getElementById("stats-doctors-label");
        if (label) label.innerText = "Klinika Mutaxassislari";
        if (countElem) countElem.innerText = stats.doctors;
      } else if (isReception) {
        showStrict(doctorsCard);
        const countElem = document.getElementById("stats-doctors-count");
        const label = document.getElementById("stats-doctors-label");
        if (label) label.innerText = "Qabuldagi Shifokorlar";
        if (countElem) countElem.innerText = stats.doctors;
      } else {
        hideStrict(doctorsCard);
      }
    }

    if (diagnosesCard) {
      if (isAdmin) {
        showStrict(diagnosesCard);
        const countElem = document.getElementById("stats-diagnoses-count");
        const label = document.getElementById("stats-diagnoses-label");
        if (label) label.innerText = "Rasmiy Tashxis Qaydlari";
        if (countElem) countElem.innerText = stats.diagnoses;
      } else if (isDoctor) {
        showStrict(diagnosesCard);
        const countElem = document.getElementById("stats-diagnoses-count");
        const label = document.getElementById("stats-diagnoses-label");
        if (label) label.innerText = "Mening Tashxislarim";
        if (countElem) countElem.innerText = stats.diagnoses;
      } else if (isReception) {
        hideStrict(diagnosesCard);
      } else {
        hideStrict(diagnosesCard);
      }
    }

    // Doctor info representation
    const docInfoCard = document.getElementById("doctor-info-card");
    if (isPatient && myDoctor && docInfoCard) {
      showStrict(docInfoCard);
      
      const avatarElem = document.getElementById("doc-avatar-text");
      if (avatarElem) avatarElem.innerText = myDoctor.last_name?.[0] || myDoctor.first_name?.[0] || 'D';

      const dFullNameElem = document.getElementById("doc-fullname-text");
      if (dFullNameElem) dFullNameElem.innerText = `Dr. ${myDoctor.last_name || ""} ${myDoctor.first_name || ""}`;

      const dSpecialtyElem = document.getElementById("doc-specialty-text");
      if (dSpecialtyElem) dSpecialtyElem.innerText = myDoctor.specialty || "Terapevt Mutaxassis";

      const dPhoneElem = document.getElementById("doc-phone-text");
      if (dPhoneElem) dPhoneElem.innerText = myDoctor.phone || "Telefon raqam mavjud emas";

      const dEmailElem = document.getElementById("doc-email-text");
      if (dEmailElem) dEmailElem.innerText = myDoctor.email || "Email kiritilmagan";

      const dBioSection = document.getElementById("doc-bio-section");
      const dBioElem = document.getElementById("doc-bio-text");
        if (dBioSection && dBioElem) {
        if (myDoctor.bio) {
          showStrict(dBioSection);
          dBioElem.innerText = myDoctor.bio;
        } else {
          hideStrict(dBioSection);
        }
      }
    } else if (docInfoCard) {
      hideStrict(docInfoCard);
    }

    // Set diagnoses table title
    const tableTitle = document.getElementById("diagnoses-table-title");
    if (tableTitle) {
      tableTitle.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-teal-600"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>${isPatient ? "Mening Tibbiy Tashxislarim Tarixi" : isDoctor ? "Mening Tashxislarim Tarixi" : isReception ? "Qabul Qilingan Bemorlar" : "Klinika So'nggi Rasmiy Tashxislari"}</span>
      `;
    }

    // Populate recent diagnoses body
    const tbody = document.getElementById("dashboard-recent-diagnoses-rows");
    if (tbody) {
      if (recentDiagnosesCombined.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="p-12 text-center text-slate-400 italic font-bold">Hozirda hech qanday tibbiy muloqot tashxislari mavjud emas.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = recentDiagnosesCombined.map(diag => `
          <tr class="hover:bg-slate-50/20 dark:hover:bg-slate-900/10 transition-colors">
            <td class="py-4 font-black font-mono text-teal-650">${new Date(diag.created_at).toLocaleDateString()}</td>
            <td class="py-4">
                <div class="font-extrabold text-[#111827] dark:text-white">${diag.patientName || diag.docName || "Noma'lum"}</div>
                ${diag.specialty ? `<div class="text-[10px] text-slate-405 font-bold font-mono mt-0.5">${diag.specialty}</div>` : ""}
            </td>
            <td class="py-4 font-semibold text-slate-500 dark:text-slate-400 max-w-xs truncate">${diag.description}</td>
            <td class="py-4 text-right">
                <span class="text-[9px] font-black uppercase text-teal-605 bg-teal-50 dark:bg-teal-950/40 border border-teal-100/30 px-2.5 py-1 rounded-lg">Tasdiqlandi</span>
            </td>
          </tr>
        `).join("");
      }
    }

    // Footer actions configs
    const footerNavLabel = document.getElementById("footer-nav-label");
    const footerNavBtn = document.getElementById("footer-nav-btn");
    if (footerNavLabel && footerNavBtn) {
      if (isAdmin) {
        footerNavLabel.innerText = "Bemorlarni ko'rish";
        footerNavBtn.onclick = () => window.navigate('patients');
      } else if (isReception) {
        footerNavLabel.innerText = "Bemorlarni ko'rish";
        footerNavBtn.onclick = () => window.navigate('patients');
      } else if (isDoctor) {
        footerNavLabel.innerText = "Tashxis yozish";
        footerNavBtn.onclick = () => window.navigate('diagnoses');
      } else {
        footerNavLabel.innerText = "Metrikalar xulosasini ko'rish";
        footerNavBtn.onclick = () => window.navigate('diagnoses');
      }
    }

    const downloadBtn = document.getElementById("download-spravka");
    if (downloadBtn) downloadBtn.addEventListener("click", async () => {
      const btn = downloadBtn;
      const origHtml = btn.innerHTML;
      try {
        btn.disabled = true;
        btn.innerHTML = 'Yuklanmoqda...';
        const resp = await fetch(`/api/spravka?patientId=${currentUserData?.id || ''}`, {
          method: 'GET',
          headers: {
            'X-User-Role': currentUserData?.role || '',
            'X-User-Id': currentUserData?.id || ''
          }
        });
        if (!resp.ok) {
          if (resp.status === 403) {
            alert('Sizda ushbu faylni yuklab olish uchun ruxsat yo\'q.');
            return;
          }
          throw new Error('Server returned ' + resp.status);
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Klinika_Ma'lumotnoma_${currentUserData?.last_name || 'Bemor'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Server download failed, falling back to client PDF generation:', e);
        generateTotalSpravka();
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });

    const showSecurityBtn = document.getElementById("show-security-btn");
    const securityModal = document.getElementById("security-modal");
    const closeSecurityBtn = document.getElementById("close-security-btn");

    if (showSecurityBtn && securityModal && closeSecurityBtn) {
      showSecurityBtn.addEventListener("click", () => {
        showStrict(securityModal);
      });
      closeSecurityBtn.addEventListener("click", () => {
        hideStrict(securityModal);
      });
      securityModal.addEventListener("click", (e) => {
        if (e.target === securityModal) hideStrict(securityModal);
      });
    }

    // Clinical simulation seeder and database clearing elements removed for production cleanliness
  };

  const generateTotalSpravka = () => {
    const downloadBtnEl = document.getElementById('download-spravka');
    let origHtml = null;
    if (downloadBtnEl) {
      downloadBtnEl.disabled = true;
      origHtml = downloadBtnEl.innerHTML;
      downloadBtnEl.innerHTML = 'Yuklanmoqda...';
    }
    const doc = new jsPDF();
    const p = currentUserData;
    
    // Header
    doc.setFillColor(13, 148, 136); // Teal-600
    doc.rect(0, 0, 210, 42, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont("helvetica", "bold");
    doc.text("YAGONA TIBBIY MA'LUMOTNOMA", 105, 24, { align: "center" });
    doc.setFontSize(10); doc.text("KLINIKA PRO - INTEGRALLASHGAN TIBBIY PORTAL TIZIMI", 105, 33, { align: "center" });
    
    // Bemor Info Box
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("Bemor shaxsiy ma'lumotlari:", 20, 58);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`F.I.SH: ${p.last_name || ""} ${p.first_name || ""}`, 25, 68);
    doc.text(`Tug'ilgan sana: ${p.birth_date || "-"}`, 25, 76);
    doc.text(`Telefon raqami: ${p.phone || "-"}`, 25, 84);
    doc.text(`Doimiy yashash manzili: ${p.address || "-"}`, 25, 92);
    
    doc.setDrawColor(226, 232, 240); doc.line(20, 99, 190, 99);
    
    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("KASALLIK VA TASHXISLAR INTEGRAL TARIXI:", 20, 114);
    
    let yPos = 126;
    doc.setFontSize(11);
    if (myDiagnoses.length > 0) {
      myDiagnoses.forEach((diag, index) => {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFont("helvetica", "bold");
        doc.text(`${index + 1}. Sana: ${new Date(diag.created_at).toLocaleDateString()}`, 25, yPos);
        yPos += 7;
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(diag.description, 160);
        doc.text(lines, 25, yPos);
        yPos += lines.length * 7 + 10;
      });
    } else {
       doc.setFont("helvetica", "italic");
       doc.text("Hozirda hech qanday tibbiy tashxis xronikasi mavjud emas.", 25, yPos);
    }
    
    // Seal Stamp
    const finalY = Math.min(255, yPos + 15);
    doc.setDrawColor(13, 148, 136); doc.setLineWidth(1); doc.circle(165, finalY, 15);
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("CLINICA PRO", 165, finalY - 2, { align: "center" });
    doc.text("TASDIQLANDI", 165, finalY + 2, { align: "center" });
 
    try {
      console.debug('generateTotalSpravka: creating blob');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      // Try opening new tab first (user gesture). If blocked, fall back to anchor download.
      const opened = (() => {
        try { return !!window.open(url, '_blank'); } catch (err) { return false; }
      })();
      if (!opened) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `Klinika_Ma'lumotnoma_${p.last_name || "Bemor"}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.warn('generateTotalSpravka error, falling back to save():', e);
      try { doc.save(`Klinika_Ma'lumotnoma_${p.last_name || "Bemor"}.pdf`); } catch (err) { console.error('doc.save failed:', err); alert('PDF yaratishda xatolik: ' + err?.message); }
    }
    finally {
      if (downloadBtnEl) {
        downloadBtnEl.disabled = false;
        if (origHtml) downloadBtnEl.innerHTML = origHtml;
      }
    }
  };

  const fetchStats = async () => {
    try {
      const [resPats, resDiag, resDocs] = await Promise.all([
        fetch('/api/users?role=patient'),
        fetch('/api/diagnoses', { headers: { 'X-User-Role': currentUserData?.role || '', 'X-User-Id': currentUserData?.id || '' } }),
        fetch('/api/users?role=doctor')
      ]);

      const allPatients = (resPats.ok ? await safeJson(resPats) : []) || [];
      const diagData = (resDiag.ok ? await safeJson(resDiag) : []) || [];
      const allDoctors = (resDocs.ok ? await safeJson(resDocs) : []) || [];

      if (isAdmin || isReception || isDoctor) {
        stats.patients = allPatients.length;
        stats.doctors = allDoctors.length;
      }

      if (isPatient) {
        myDiagnoses = diagData.filter(d => d.patient_id === currentUserData.id);
        stats.diagnoses = myDiagnoses.length;
        if (myDiagnoses.length > 0) {
           const lastDiag = myDiagnoses[0];
           myDoctor = allDoctors.find(doc => doc.id === lastDiag.doctor_id) || null;
        }

        recentDiagnosesCombined = myDiagnoses.slice(0, 5).map(diag => {
          const doctor = allDoctors.find(d => d.id === diag.doctor_id) || { first_name: 'Noma\'lum', last_name: 'Shifokor', specialty: 'Mutaxassis' };
          return {
            ...diag,
            docName: `Dr. ${doctor.last_name || ""} ${doctor.first_name || ""}`,
            specialty: doctor.specialty || 'Terapevt'
          };
        });

      } else if (isDoctor) {
        const docDiags = diagData.filter(d => d.doctor_id === currentUserData.id);
        stats.diagnoses = docDiags.length;
        const uniquePatients = new Set(docDiags.map(d => d.patient_id).filter(Boolean));
        stats.patients = uniquePatients.size;

        recentDiagnosesCombined = docDiags.slice(0, 5).map(diag => {
          const patient = allPatients.find(p => p.id === diag.patient_id) || { first_name: 'Noma\'lum', last_name: 'Bemor' };
          return {
            ...diag,
            patientName: `${patient.last_name || ""} ${patient.first_name || ""}`
          };
        });

      } else {
        stats.diagnoses = diagData.length;

        recentDiagnosesCombined = diagData.slice(0, 5).map(diag => {
          const patient = allPatients.find(p => p.id === diag.patient_id) || { first_name: 'Noma\'lum', last_name: 'Bemor' };
          const doctor = allDoctors.find(d => d.id === diag.doctor_id) || { first_name: 'Noma\'lum', last_name: 'Shifokor', specialty: 'Mutaxassis' };
          return {
            ...diag,
            patientName: `${patient.last_name || ""} ${patient.first_name || ""}`,
            docName: `Dr. ${doctor.last_name || ""} ${doctor.first_name || ""}`,
            specialty: doctor.specialty || 'Terapevt'
          };
        });
      }

      // Reception dashboard should stay operational but not expose diagnosis creation flows.
      if (isReception) {
        recentDiagnosesCombined = allPatients.slice(0, 5).map(p => ({
          id: p.id,
          created_at: p.created_at,
          patientName: `${p.last_name || ""} ${p.first_name || ""}`,
          description: p.phone || p.email || 'Yangi bemor',
          specialty: p.role || 'patient'
        }));
      }
      render();
    } catch (err) { console.error(err); }
  };

  const init = async () => {
    await fetchStats();
  };

  init();
  return () => {};
}

export { renderDashboard };
