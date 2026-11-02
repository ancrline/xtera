$(function () {
  const user = Auth.requireAuth();
  if (!user) return;

  UI.renderNavbar("dashboard");
  if (user.role !== "admin") $("#newJobBtn").hide();

  STATUS_FLOW.forEach(s => {
    $("#statusFilter").append(`<option value="${UI.escapeHtml(s)}">${UI.escapeHtml(s)}</option>`);
  });

  function loadJobs() {
    Api.listJobs({ status: $("#statusFilter").val(), search: $("#searchInput").val().trim() })
      .then(jobs => {
        const rows = jobs.map(j => `
          <tr data-id="${j.id}">
            <td class="fw-semibold">${UI.escapeHtml(j.jobNumber)}</td>
            <td>
              ${UI.escapeHtml(j.clientName)}
              <div class="text-muted-small">${UI.escapeHtml(j.clientEmail)}</div>
            </td>
            <td>${UI.escapeHtml(j.propertyAddress)}</td>
            <td>${UI.escapeHtml(j.workType)}</td>
            <td>${UI.fmtDate(j.createdAt)}</td>
            <td>${UI.statusBadge(j.status)}</td>
          </tr>`).join("");
        $("#jobsTbody").html(rows);
        $("#emptyState").toggleClass("d-none", jobs.length > 0);
      });
  }

  $("#jobsTbody").on("click", "tr", function () {
    window.location.href = "job-detail.html?id=" + $(this).data("id");
  });

  let searchTimer;
  $("#searchInput").on("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadJobs, 250);
  });
  $("#statusFilter").on("change", loadJobs);

  loadJobs();
});
