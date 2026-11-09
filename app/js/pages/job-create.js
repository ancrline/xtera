$(async function () {
  const user = await Auth.requireAdmin();
  if (!user) return;

  UI.renderNavbar("job-create");

  let sendAfterSave = false;
  let workTypes = [];
  const MAX_WORK_TYPE_LENGTH = 120;

  function selectedServices() {
    return $(".service-select").map(function () { return $(this).val(); }).get().filter(Boolean);
  }

  // Each dropdown only offers services not already chosen in another dropdown.
  function refreshServiceOptions() {
    const chosen = selectedServices();
    $(".service-select").each(function () {
      const current = $(this).val();
      const options = ['<option value="">Select…</option>'].concat(
        workTypes
          .filter(t => t.label === current || !chosen.includes(t.label))
          .map(t => `<option value="${UI.escapeHtml(t.label)}">${UI.escapeHtml(t.label)}</option>`)
      );
      $(this).html(options.join("")).val(current);
    });

    const hasEmptyRow = $(".service-select").filter(function () { return !$(this).val(); }).length > 0;
    const allUsed = workTypes.every(t => chosen.includes(t.label));
    $("#addServiceBtn").prop("disabled", hasEmptyRow || allUsed);
  }

  function addServiceRow() {
    const isFirst = $(".service-row").length === 0;
    const row = $(`
      <div class="input-group mb-2 service-row">
        <select class="form-select service-select" required ${isFirst ? 'id="workType"' : ""}></select>
        ${isFirst ? "" : '<button class="btn btn-outline-danger remove-service-btn" type="button" title="Remove this service"><i class="bi bi-x-lg"></i></button>'}
      </div>`);
    $("#serviceRows").append(row);
    refreshServiceOptions();
    if (!isFirst) row.find("select").trigger("focus");
  }

  function loadWorkTypes() {
    return Api.listWorkTypes().then(types => {
      workTypes = types;
      refreshServiceOptions();
    });
  }

  $("#addServiceBtn").on("click", addServiceRow);
  $("#serviceRows").on("change", ".service-select", refreshServiceOptions);
  $("#serviceRows").on("click", ".remove-service-btn", function () {
    $(this).closest(".service-row").remove();
    refreshServiceOptions();
  });

  $("#saveBtn").on("click", function () { sendAfterSave = false; });
  $("#saveAndSendBtn").on("click", function () { sendAfterSave = true; });

  $("#jobForm").on("submit", function (e) {
    e.preventDefault();

    const workType = selectedServices().join(", ");
    if (workType.length > MAX_WORK_TYPE_LENGTH) {
      UI.toast("Too many services selected. Please remove one or create a separate job.", "warning");
      return;
    }

    const payload = {
      clientName: $("#clientName").val().trim(),
      clientEmail: $("#clientEmail").val().trim(),
      clientPhone: $("#clientPhone").val().trim(),
      propertyAddress: $("#propertyAddress").val().trim(),
      workType,
      description: $("#description").val().trim()
    };

    Api.createJob(payload).then(job => {
      if (!sendAfterSave) {
        UI.toast(`Job ${job.jobNumber} created.`);
        window.location.href = "job-detail.html?id=" + job.id;
        return;
      }
      Api.getSettings().then(settings => {
        // The job exists now, so closing the preview must not leave the form open to a duplicate.
        $("#emailPreviewModal").one("hidden.bs.modal", () => {
          window.location.href = "job-detail.html?id=" + job.id;
        });
        UI.showEmailPreview(job, settings, () => Api.sendTermsEmail(job.id));
      }).catch(err => UI.toast(err.message, "danger"));
    }).catch(err => UI.toast(err.message, "danger"));
  });

  addServiceRow();
  loadWorkTypes().catch(err => UI.toast(err.message, "danger"));
});
