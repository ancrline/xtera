const DEFAULT_PHONE = "0800326002";

function applyPhone(phone) {
  document.querySelectorAll("[data-phone]").forEach(el => {
    el.textContent = phone;
  });

  document.querySelectorAll("[data-phone-href]").forEach(el => {
    el.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
  });
}

applyPhone(DEFAULT_PHONE);
document.getElementById("year").textContent = new Date().getFullYear();

const enquiryForm = document.getElementById("enquiryForm");
const enquiryStatus = document.getElementById("enquiryStatus");

function showEnquiryStatus(type, message) {
  enquiryStatus.className = `mt-3 alert alert-${type} py-2`;
  enquiryStatus.textContent = message;
}

enquiryForm.addEventListener("submit", async event => {
  event.preventDefault();

  const submitButton = enquiryForm.querySelector("button[type='submit']");
  const endpoint = enquiryForm.action.replace("formsubmit.co/", "formsubmit.co/ajax/");
  submitButton.disabled = true;
  enquiryStatus.className = "mt-3";
  enquiryStatus.textContent = "";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(enquiryForm)
    });
    const result = await response.json();

    if (!response.ok || result.success === "false" || result.success === false) {
      throw new Error(result.message || "Submission failed");
    }

    enquiryForm.reset();
    sessionStorage.setItem("enquirySubmitted", "true");
    window.location.href = "thank-you.html";
    return;
  } catch (error) {
    showEnquiryStatus("danger", `Sorry, something went wrong. Please call us on ${DEFAULT_PHONE} or try again.`);
  } finally {
    submitButton.disabled = false;
  }
});