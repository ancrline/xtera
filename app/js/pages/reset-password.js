$(function () {
  const token = new URLSearchParams(window.location.search).get("token") || "";

  // Remove the token from the address bar so it isn't kept in history or shared by accident.
  if (token) {
    window.history.replaceState(null, "", window.location.pathname);
  }

  function showError(message) {
    $("#resetError").removeClass("d-none").text(message);
  }

  if (!token) {
    $("#resetForm").addClass("d-none");
    showError("This reset link is invalid. Please request a new one.");
    return;
  }

  $("#resetForm").on("submit", function (e) {
    e.preventDefault();
    $("#resetError").addClass("d-none");

    const password = $("#password").val();
    if (password !== $("#confirmPassword").val()) {
      showError("Passwords do not match.");
      return;
    }

    $("#resetBtn").prop("disabled", true);
    Api.resetPassword(token, password)
      .then(() => {
        $("#resetForm").addClass("d-none");
        $("#resetSuccess").removeClass("d-none");
      })
      .catch(err => {
        showError(err.message);
        $("#resetBtn").prop("disabled", false);
      });
  });
});
