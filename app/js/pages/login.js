$(function () {
  if (Auth.user()) {
    window.location.href = "dashboard.html";
    return;
  }

  $("#loginForm").on("submit", function (e) {
    e.preventDefault();
    $("#loginError").addClass("d-none");
    $("#loginBtn").prop("disabled", true);

    Api.login($("#email").val().trim(), $("#password").val())
      .then(() => {
        window.location.href = "dashboard.html";
      })
      .catch(err => {
        $("#loginError").removeClass("d-none").text(err.message);
      })
      .finally(() => {
        $("#loginBtn").prop("disabled", false);
      });
  });
});
