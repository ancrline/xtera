const DEFAULT_PHONE = "027 555 1234";

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

document.getElementById("enquiryForm").addEventListener("submit", event => {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const subject = `Website enquiry: ${formData.get("service")}`;
  const body = [
    `Name: ${formData.get("name")}`,
    `Email: ${formData.get("email")}`,
    `Service required: ${formData.get("service")}`
  ].join("\n");

  window.location.href = `mailto:hello@xterra.co.nz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
