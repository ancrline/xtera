$(async function () {
  const user = await Auth.requireAuth();
  if (!user) return;

  UI.renderNavbar("dashboard");

  const jobId = new URLSearchParams(window.location.search).get("id");
  if (!jobId) {
    window.location.href = "dashboard.html";
    return;
  }

  let job = null;
  let settings = null;

  function render() {
    $("#jobNumber").text(job.jobNumber);
    $("#jobStatusBadge").html(UI.statusBadge(job.status));
    $("#statusStepper").html(UI.statusStepper(job.status));
    document.title = `${job.jobNumber} | XTERA Job Reports`;

    $("#clientName").text(job.clientName);
    $("#clientEmail").text(job.clientEmail);
    $("#clientPhone").text(job.clientPhone);
    $("#propertyAddress").text(job.propertyAddress);
    $("#workType").text(job.workType);
    $("#createdAt").text(UI.fmtDateTime(job.createdAt) + " by " + job.createdBy);
    $("#description").text(job.description || "—");

    $("#reportBtn").attr("href", "report.html?id=" + job.id);

    renderAcceptance();
    renderStatusActions();
    renderNotes();
    renderPhotos();
    renderHistory();
  }

  function renderAcceptance() {
    if (job.acceptance) {
      $("#acceptanceBox").html(`
        <div class="alert alert-success mb-0">
          <i class="bi bi-check-circle-fill me-1"></i>
          <strong>Accepted</strong> by ${UI.escapeHtml(job.acceptance.acceptedBy)}<br>
          <span class="small">${UI.fmtDateTime(job.acceptance.acceptedAt)} · Terms version ${job.acceptance.termsVersion}</span>
        </div>`);
      $("#sendTermsLabel").text("Resend T&Cs email");
    } else if (job.termsSentAt) {
      $("#acceptanceBox").html(`
        <div class="alert alert-warning mb-0">
          <i class="bi bi-hourglass-split me-1"></i>
          <strong>Awaiting acceptance</strong><br>
          <span class="small">Sent ${UI.fmtDateTime(job.termsSentAt)} · Terms version ${job.termsVersion}</span>
        </div>`);
      $("#sendTermsLabel").text("Resend T&Cs email");
    } else {
      $("#acceptanceBox").html(`
        <div class="alert alert-secondary mb-0">
          <i class="bi bi-envelope me-1"></i> Terms &amp; conditions have not been sent yet.
        </div>`);
      $("#sendTermsLabel").text("Send T&Cs email");
    }
    $("#termsMeta").text("Client link: " + UI.acceptLink(job));
    // d-none (not .toggle()) because d-flex's !important overrides inline display:none
    $("#termsActions").toggleClass("d-none", user.role !== "admin");
  }

  function renderStatusActions() {
    const buttons = [];
    if (job.status === "Accepted") {
      buttons.push(`<button class="btn btn-primary w-100" data-status="In progress"><i class="bi bi-play-fill me-1"></i> Start job</button>`);
    }
    if (job.status === "In progress") {
      buttons.push(`<button class="btn btn-success w-100" data-status="Completed"><i class="bi bi-check-lg me-1"></i> Mark completed</button>`);
    }
    if (job.status === "Completed") {
      buttons.push(`<div class="text-muted-small text-center"><i class="bi bi-check-circle me-1"></i>This job is completed.</div>`);
    }
    if (job.status === "Draft" || job.status === "Awaiting acceptance") {
      buttons.push(`<div class="text-muted-small text-center">Waiting for the client to accept the terms &amp; conditions before work can begin.</div>`);
    }
    $("#statusActions").html(buttons.join(""));
  }

  function renderNotes() {
    if (!job.notes.length) {
      $("#notesList").html('<p class="text-muted-small mb-0">No notes yet.</p>');
      return;
    }
    $("#notesList").html(job.notes.map(n => `
      <div class="note-item">
        <div>${UI.escapeHtml(n.text)}</div>
        <div class="note-meta">${UI.escapeHtml(n.author)} · ${UI.fmtDateTime(n.createdAt)}</div>
      </div>`).join(""));
  }

  function photoCard(img) {
    return `
      <div class="photo-card">
        <img src="${img.dataUrl}" alt="${UI.escapeHtml(img.kind)} photo">
        <button class="btn btn-danger btn-sm photo-delete" data-id="${img.id}" title="Delete photo"><i class="bi bi-trash"></i></button>
        <div class="photo-caption">${UI.escapeHtml(img.uploadedBy)} · ${UI.fmtDateTime(img.createdAt)}</div>
      </div>`;
  }

  function renderPhotos() {
    const before = job.images.filter(i => i.kind === "before");
    const after = job.images.filter(i => i.kind === "after");
    $("#beforePhotos").html(before.length ? before.map(photoCard).join("") : '<div class="photo-empty">No before photos yet</div>');
    $("#afterPhotos").html(after.length ? after.map(photoCard).join("") : '<div class="photo-empty">No after photos yet</div>');
  }

  function renderHistory() {
    const items = job.history.slice().reverse().map(h =>
      `<li>${UI.fmtDateTime(h.at)} — ${UI.escapeHtml(h.event)} <em>(${UI.escapeHtml(h.by)})</em></li>`
    );
    $("#historyList").html(items.join(""));
  }

  // ---- events ----

  $("#statusActions").on("click", "button[data-status]", function () {
    const btn = $(this).prop("disabled", true);
    Api.updateJobStatus(job.id, btn.data("status")).then(updated => {
      job = updated;
      render();
      UI.toast("Status updated to " + job.status + ".");
    }).catch(err => {
      btn.prop("disabled", false);
      UI.toast(err.message, "danger");
    });
  });

  $("#noteForm").on("submit", function (e) {
    e.preventDefault();
    const text = $("#noteText").val().trim();
    if (!text) return;
    Api.addNote(job.id, text).then(() => {
      $("#noteText").val("");
      return Api.getJob(job.id);
    }).then(updated => {
      job = updated;
      renderNotes();
      UI.toast("Note added.");
    }).catch(err => UI.toast(err.message, "danger"));
  });

  $("input[type=file][data-kind]").on("change", function () {
    const file = this.files[0];
    const kind = $(this).data("kind");
    $(this).val("");
    if (!file) return;
    UI.readFileAsDataUrl(file)
      .then(dataUrl => Api.addImage(job.id, { kind, dataUrl }))
      .then(() => Api.getJob(job.id))
      .then(updated => {
        job = updated;
        renderPhotos();
        renderHistory();
        UI.toast(kind.charAt(0).toUpperCase() + kind.slice(1) + " photo added.");
      })
      .catch(err => UI.toast(err.message, "danger"));
  });

  $("#jobMain").on("click", ".photo-delete", function () {
    if (!confirm("Delete this photo?")) return;
    Api.deleteImage(job.id, $(this).data("id"))
      .then(() => Api.getJob(job.id))
      .then(updated => {
        job = updated;
        renderPhotos();
        renderHistory();
        UI.toast("Photo deleted.");
      })
      .catch(err => UI.toast(err.message, "danger"));
  });

  $("#sendTermsBtn").on("click", function () {
    UI.showEmailPreview(job, settings, () =>
      Api.sendTermsEmail(job.id).then(updated => {
        job = updated;
        render();
      })
    );
  });

  $("#copyLinkBtn").on("click", function () {
    const link = UI.acceptLink(job);
    navigator.clipboard.writeText(link)
      .then(() => UI.toast("Client link copied to clipboard."))
      .catch(() => window.prompt("Copy the client link:", link));
  });

  // ---- init ----
  Promise.all([Api.getJob(jobId), Api.getSettings()])
    .then(([j, s]) => {
      job = j;
      settings = s;
      render();
    })
    .catch(err => {
      UI.toast(err.message, "danger");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);
    });
});
