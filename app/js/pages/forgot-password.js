$(function () {
  $("#forgotForm").on("submit", function (e) {
    e.preventDefault();
    $("#resetError, #resetSuccess").addClass("d-none");
    $("#forgotBtn").prop("disabled", true);

    Api.requestPasswordReset($("#email").val().trim())
      .then(data => {
        $("#resetSuccess").removeClass("d-none").text(data.message);
        $("#forgotForm").addClass("d-none");
      })
      .catch(err => {
        $("#resetError").removeClass("d-none").text(err.message);
      })
      .finally(() => {
        $("#forgotBtn").prop("disabled", false);
      });
  });
});
