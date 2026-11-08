$(async function () {
  const user = await Auth.requireAdmin();
  if (!user) return;

  UI.renderNavbar("job-create");

  let sendAfterSave = false;

  function loadWorkTypes(selectValue) {
    return Api.listWorkTypes().then(types => {
      const options = ['<option value="">Select…</option>'].concat(
        types.map(t => `<option value="${UI.escapeHtml(t.label)}">${UI.escapeHtml(t.label)}</option>`)
      );
      $("#workType").html(options.join(""));
      if (selectValue) $("#workType").val(selectValue);
    });
  }

  $("#addWorkTypeBtn").on("click", function () {
    $("#newWorkTypeRow").removeClass("d-none");
    $("#newWorkTypeInput").trigger("focus");
  });

  $("#cancelWorkTypeBtn").on("click", function () {
    $("#newWorkTypeRow").addClass("d-none");
    $("#newWorkTypeInput").val("");
  });

  $("#saveWorkTypeBtn").on("click", function () {
    const label = $("#newWorkTypeInput").val().trim();
    if (!label) return;
    Api.addWorkType(label)
      .then(() => loadWorkTypes(label))
      .then(() => {
        $("#newWorkTypeRow").addClass("d-none");
        $("#newWorkTypeInput").val("");
        UI.toast(`Work type "${label}" added.`);
      });
  });

  $("#saveBtn").on("click", function () { sendAfterSave = false; });
  $("#saveAndSendBtn").on("click", function () { sendAfterSave = true; });

  $("#jobForm").on("submit", function (e) {
    e.preventDefault();

    const payload = {
      clientName: $("#clientName").val().trim(),
      clientEmail: $("#clientEmail").val().trim(),
      clientPhone: $("#clientPhone").val().trim(),
      propertyAddress: $("#propertyAddress").val().trim(),
      workType: $("#workType").val(),
      description: $("#description").val().trim()
    };

    Api.createJob(payload).then(job => {
      if (!sendAfterSave) {
        UI.toast(`Job ${job.jobNumber} created.`);
        window.location.href = "job-detail.html?id=" + job.id;
        return;
      }
      Api.getSettings().then(settings => {
        UI.showEmailPreview(job, settings, () =>
          Api.sendTermsEmail(job.id).then(() => {
            window.location.href = "job-detail.html?id=" + job.id;
          })
        );
      });
    });
  });

  loadWorkTypes();
});
