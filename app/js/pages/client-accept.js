$(function () {
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token) {
    $("#invalidLink").removeClass("d-none");
    return;
  }

  Api.getJobByToken(token)
    .then(({ job, terms, settings }) => {
      document.title = `Job ${job.jobNumber} — Review & Accept Terms | ${settings.companyName}`;
      $("#companyName").text(settings.companyName);
      $("#companyContact").text(`${settings.email} · ${settings.phone} · ${settings.website}`);

      $("#jobNumber").text(job.jobNumber);
      $("#clientName").text(job.clientName);
      $("#propertyAddress").text(job.propertyAddress);
      $("#workType").text(job.workType);
      $("#createdAt").text(UI.fmtDate(job.createdAt));
      $("#description").text(job.description || "—");

      $("#termsVersion").text("(version " + terms.version + ")");
      $("#termsText").text(terms.text);

      if (job.acceptance) {
        showAccepted(job.acceptance);
      }

      $("#acceptContent").removeClass("d-none");
    })
    .catch(() => {
      $("#invalidLink").removeClass("d-none");
    });

  function showAccepted(acceptance) {
    $("#acceptForm").addClass("d-none");
    $("#acceptedBox").removeClass("d-none");
    $("#acceptedDetail").text(` Accepted by ${acceptance.acceptedBy} on ${UI.fmtDateTime(acceptance.acceptedAt)} (terms version ${acceptance.termsVersion}).`);
  }

  $("#acceptBtn").on("click", function () {
    const name = $("#acceptName").val().trim();
    if (!name) {
      UI.toast("Please type your full name to accept.", "danger");
      $("#acceptName").trigger("focus");
      return;
    }
    $(this).prop("disabled", true);
    Api.acceptTerms(token, name)
      .then(job => {
        showAccepted(job.acceptance);
        UI.toast("Thank you — terms accepted.");
      })
      .catch(err => {
        UI.toast(err.message, "danger");
        $(this).prop("disabled", false);
      });
  });
});
