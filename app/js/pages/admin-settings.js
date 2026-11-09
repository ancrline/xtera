$(async function () {
  const user = await Auth.requireAdmin();
  if (!user) return;

  UI.renderNavbar("admin-settings");

  // ---- Company ----
  Api.getSettings().then(s => {
    $("#companyName").val(s.companyName);
    $("#companyEmail").val(s.email);
    $("#companyPhone").val(s.phone);
    $("#companyWebsite").val(s.website);
  });

  $("#companyForm").on("submit", function (e) {
    e.preventDefault();
    Api.saveSettings({
      companyName: $("#companyName").val().trim(),
      email: $("#companyEmail").val().trim(),
      phone: $("#companyPhone").val().trim(),
      website: $("#companyWebsite").val().trim()
    }).then(() => UI.toast("Company details saved."));
  });

  // ---- Terms ----
  function loadTerms() {
    Api.getTerms().then(t => $("#termsText").val(t.text))
      .catch(err => UI.toast(err.message, "danger"));
    Api.listTermsVersions().then(versions => {
      $("#termsHistory").html(versions.slice().reverse().map(v =>
        `<li>Version ${v.version} — saved ${UI.fmtDateTime(v.createdAt)}</li>`
      ).join("") || "<li class=\"text-muted\">No versions saved yet.</li>");
    }).catch(err => UI.toast(err.message, "danger"));
  }

  const termsModal = new bootstrap.Modal(document.getElementById("confirmTermsModal"));

  $("#termsForm").on("submit", function (e) {
    e.preventDefault();
    if (!$("#termsText").val().trim()) {
      UI.toast("Terms text cannot be empty.", "warning");
      return;
    }
    termsModal.show();
  });

  $("#confirmTermsBtn").on("click", function () {
    const btn = $(this).prop("disabled", true);
    Api.saveTerms($("#termsText").val().trim())
      .then(entry => {
        termsModal.hide();
        UI.toast("Terms saved as version " + entry.version + ".");
        loadTerms();
      })
      .catch(err => {
        termsModal.hide();
        UI.toast(err.message, "danger");
      })
      .finally(() => btn.prop("disabled", false));
  });

  // ---- Work types ----
  function loadWorkTypes() {
    Api.listAllWorkTypes().then(types => {
      $("#workTypeList").html(types.map(t => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <span>${UI.escapeHtml(t.label)} ${t.active ? "" : '<span class="badge bg-secondary ms-2">inactive</span>'}</span>
          ${t.active ? `<button class="btn btn-outline-danger btn-sm" data-id="${t.id}"><i class="bi bi-x-lg me-1"></i> Remove</button>` : ""}
        </li>`).join(""));
    }).catch(err => UI.toast(err.message, "danger"));
  }

  $("#workTypeForm").on("submit", function (e) {
    e.preventDefault();
    const label = $("#workTypeInput").val().trim();
    if (!label) return;
    Api.addWorkType(label).then(() => {
      $("#workTypeInput").val("");
      loadWorkTypes();
      UI.toast(`Work type "${label}" added.`);
    }).catch(err => UI.toast(err.message, "danger"));
  });

  $("#workTypeList").on("click", "button[data-id]", function () {
    Api.deactivateWorkType($(this).data("id")).then(() => {
      loadWorkTypes();
      UI.toast("Work type removed (existing jobs keep their work type).");
    }).catch(err => UI.toast(err.message, "danger"));
  });

  // ---- Users ----
  function loadUsers() {
    Api.listUsers().then(users => {
      $("#userList").html(users.map(u => `
        <tr>
          <td>${UI.escapeHtml(u.name)}</td>
          <td>${UI.escapeHtml(u.email)}</td>
          <td><span class="badge ${u.role === "admin" ? "bg-primary" : "bg-secondary"}">${UI.escapeHtml(u.role)}</span></td>
        </tr>`).join(""));
    }).catch(err => UI.toast(err.message, "danger"));
  }

  $("#userForm").on("submit", function (e) {
    e.preventDefault();
    const form = this;
    Api.addUser({
      name: $("#userName").val().trim(),
      email: $("#userEmail").val().trim(),
      password: $("#userPassword").val(),
      role: $("#userRole").val()
    }).then(() => {
      form.reset();
      loadUsers();
      UI.toast("User added.");
    }).catch(err => UI.toast(err.message, "danger"));
  });

  // ---- Email log ----
  function loadEmailLog() {
    Api.listEmailLog().then(logs => {
      $("#emailLogEmpty").toggleClass("d-none", logs.length > 0);
      $("#emailLogList").html(logs.map(l => `
        <tr>
          <td>${UI.fmtDateTime(l.sentAt)}</td>
          <td>${UI.escapeHtml(l.to)}</td>
          <td>${UI.escapeHtml(l.subject)}</td>
          <td><a href="${UI.escapeHtml(l.link)}" target="_blank" class="small">Open link <i class="bi bi-box-arrow-up-right"></i></a></td>
        </tr>`).join(""));
    });
  }

  // Each section loads independently so one unavailable API can't block the others.
  [loadTerms, loadWorkTypes, loadUsers, loadEmailLog].forEach(load => {
    try {
      load();
    } catch (e) {
      console.warn("Settings section failed to load:", e.message);
    }
  });
});
