$(async function () {
  const user = await Auth.requireAuth();
  if (!user) return;

  const jobId = new URLSearchParams(window.location.search).get("id");
  if (!jobId) {
    window.location.href = "dashboard.html";
    return;
  }

  $("#backBtn").attr("href", "job-detail.html?id=" + jobId);
  $("#printBtn").on("click", () => window.print());

  Promise.all([Api.getJob(jobId), Api.getSettings()])
    .then(([job, settings]) => {
      document.title = `Report ${job.jobNumber} | XTERA Job Reports`;

      $("#companyDetails").html(
        `${UI.escapeHtml(settings.companyName)}<br>${UI.escapeHtml(settings.email)} · ${UI.escapeHtml(settings.phone)} · ${UI.escapeHtml(settings.website)}`
      );
      $("#reportMeta").text("Generated " + UI.fmtDateTime(new Date().toISOString()));

      $("#jobNumber").text(job.jobNumber);
      $("#status").html(UI.statusBadge(job.status));
      $("#workType").text(job.workType);
      $("#createdAt").text(UI.fmtDateTime(job.createdAt) + " by " + job.createdBy);
      $("#description").text(job.description || "—");

      $("#clientName").text(job.clientName);
      $("#clientEmail").text(job.clientEmail);
      $("#clientPhone").text(job.clientPhone);
      $("#propertyAddress").text(job.propertyAddress);

      if (job.acceptance) {
        $("#acceptanceSection").html(`
          <p class="mb-1"><strong>Accepted by:</strong> ${UI.escapeHtml(job.acceptance.acceptedBy)}</p>
          <p class="mb-1"><strong>Accepted at:</strong> ${UI.fmtDateTime(job.acceptance.acceptedAt)}</p>
          <p class="mb-0"><strong>Terms version:</strong> ${job.acceptance.termsVersion}</p>`);
      } else {
        $("#acceptanceSection").html('<p class="text-muted mb-0">Terms &amp; conditions have not been accepted for this job.</p>');
      }

      if (job.notes.length) {
        $("#notesSection").html(job.notes.map(n => `
          <div class="note-item">
            <div>${UI.escapeHtml(n.text)}</div>
            <div class="note-meta">${UI.escapeHtml(n.author)} · ${UI.fmtDateTime(n.createdAt)}</div>
          </div>`).join(""));
      } else {
        $("#notesSection").html('<p class="text-muted mb-0">No notes recorded.</p>');
      }

      if (job.images.length) {
        const slot = img => img
          ? `<div class="report-photo">
               <img src="${img.dataUrl}" alt="${img.kind} photo">
               <div class="text-muted-small mt-1">${UI.escapeHtml(img.uploadedBy)} · ${UI.fmtDateTime(img.createdAt)}</div>
             </div>`
          : '<p class="text-muted">Not added yet</p>';
        $("#photosSection").html(UI.groupPhotoPairs(job.images).map(p => `
          <div class="report-pair mb-4">
            <h2 class="h6">Pair ${p.pairNo}</h2>
            <div class="row">
              <div class="col-6"><div class="small fw-semibold mb-1">Before</div>${slot(p.before)}</div>
              <div class="col-6"><div class="small fw-semibold mb-1">After</div>${slot(p.after)}</div>
            </div>
          </div>`).join(""));
      } else {
        $("#photosSection").html('<p class="text-muted mb-0">No photos uploaded.</p>');
      }

      $("#historySection").html(job.history.map(h =>
        `<li>${UI.fmtDateTime(h.at)} — ${UI.escapeHtml(h.event)} <em>(${UI.escapeHtml(h.by)})</em></li>`
      ).join(""));
    })
    .catch(err => {
      UI.toast(err.message, "danger");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
    });
});
