/* XTERA Job Reports — shared UI helpers (requires jQuery + Bootstrap). */

const STATUS_FLOW = ["Draft", "Awaiting acceptance", "Accepted", "In progress", "Completed"];

const STATUS_BADGE = {
  "Draft": "bg-secondary",
  "Awaiting acceptance": "bg-warning text-dark",
  "Accepted": "bg-info text-dark",
  "In progress": "bg-primary",
  "Completed": "bg-success"
};

const UI = {
  escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
  },

  fmtDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  },

  statusBadge(status) {
    return `<span class="badge ${STATUS_BADGE[status] || "bg-secondary"}">${this.escapeHtml(status)}</span>`;
  },

  statusStepper(current) {
    const idx = STATUS_FLOW.indexOf(current);
    return STATUS_FLOW.map((s, i) => {
      const cls = i < idx ? "step done" : i === idx ? "step current" : "step";
      return `<span class="${cls}">${this.escapeHtml(s)}</span>`;
    }).join('<span class="step-arrow"><i class="bi bi-chevron-right"></i></span>');
  },

  toast(message, type = "success") {
    const id = "toast-" + Date.now();
    const html = `
      <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert">
        <div class="d-flex">
          <div class="toast-body">${this.escapeHtml(message)}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>`;
    let container = document.getElementById("toastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "toastContainer";
      container.className = "toast-container position-fixed bottom-0 end-0 p-3";
      document.body.appendChild(container);
    }
    container.insertAdjacentHTML("beforeend", html);
    const el = document.getElementById(id);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    el.addEventListener("hidden.bs.toast", () => el.remove());
    t.show();
  },

  renderNavbar(active) {
    const user = Auth.user();
    if (!user) return;
    const links = [
      { href: "dashboard.html", label: "Dashboard", key: "dashboard" },
      { href: "job-create.html", label: "New Job", key: "job-create", admin: true },
      { href: "admin-settings.html", label: "Settings", key: "admin-settings", admin: true }
    ];
    const items = links
      .filter(l => !l.admin || user.role === "admin")
      .map(l => `<li class="nav-item"><a class="nav-link ${l.key === active ? "active" : ""}" href="${l.href}">${l.label}</a></li>`)
      .join("");

    $("#appNavbar").html(`
      <nav class="navbar navbar-expand-lg navbar-dark xt-app-nav">
        <div class="container-fluid">
          <a class="navbar-brand d-flex align-items-center gap-2" href="dashboard.html">
            <img src="assets/logo/xtera-logo-landscape-512x128.png" alt="XTERA" class="brand-logo d-none d-sm-inline-block" width="152" height="38">
            <img src="assets/logo/xtera-logo-square-icon-512x512.png" alt="XTERA" class="brand-logo brand-logo-icon d-sm-none" width="38" height="38">
            <span class="text-white-50 small">Job Reports</span>
          </a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#appNav">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="appNav">
            <ul class="navbar-nav me-auto">${items}</ul>
            <div class="d-flex align-items-center gap-3">
              <span class="text-white-50 small">
                <i class="bi bi-person-circle me-1"></i>${UI.escapeHtml(user.name)}
                <span class="badge bg-light text-dark ms-1">${UI.escapeHtml(user.role)}</span>
              </span>
              <button class="btn btn-outline-light btn-sm" id="logoutBtn"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
            </div>
          </div>
        </div>
      </nav>`);
    $("#logoutBtn").on("click", () => Auth.logout());
  },

  acceptLink(job) {
    const base = window.location.href.replace(/[^/]*$/, "");
    return `${base}client-accept.html?token=${job.token}`;
  },

  buildTermsEmail(job, settings) {
    const link = this.acceptLink(job);
    return {
      to: job.clientEmail,
      subject: `${settings.companyName} — Job ${job.jobNumber}: please review and accept our terms`,
      body:
`Hi ${job.clientName},

Thank you for choosing ${settings.companyName}.

Your job "${job.workType}" at ${job.propertyAddress} (Job ${job.jobNumber}) has been scheduled for review.

Before we begin, please review and accept our terms and conditions using the secure link below:

${link}

If you have any questions, reply to this email or call us on ${settings.phone}.

Kind regards,
${settings.companyName}
${settings.email} | ${settings.phone} | ${settings.website}`
    };
  },

  showEmailPreview(job, settings, onSend) {
    const email = this.buildTermsEmail(job, settings);
    $("#emailPreviewTo").text(email.to);
    $("#emailPreviewSubject").text(email.subject);
    $("#emailPreviewBody").text(email.body);
    const modal = new bootstrap.Modal(document.getElementById("emailPreviewModal"));
    $("#emailPreviewSend").off("click").on("click", () => {
      onSend().then(() => {
        modal.hide();
        UI.toast("Email sent to " + email.to + " (mock — logged in email log).");
      }).catch(err => UI.toast(err.message, "danger"));
    });
    modal.show();
  },

  readFileAsDataUrl(file, maxWidth = 1200) {
    // Downscale large photos so base64 fits in localStorage for the prototype.
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Invalid image file."));
        img.onload = () => {
          if (img.width <= maxWidth) return resolve(reader.result);
          const scale = maxWidth / img.width;
          const canvas = document.createElement("canvas");
          canvas.width = maxWidth;
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
};
