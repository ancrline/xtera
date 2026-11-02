/* XTERA Job Reports — API layer.
   Every page talks ONLY to Api.* (promise-based). Each function maps 1:1 to a
   future REST endpoint, so swapping in a real backend means rewriting this file
   only — pages stay unchanged.

   Future mapping examples:
     Api.login(email, password)      -> POST /api/login
     Api.listJobs(filters)           -> GET  /api/jobs?status=&search=
     Api.getJob(id)                  -> GET  /api/jobs/:id
     Api.createJob(payload)          -> POST /api/jobs
     Api.addNote(jobId, text)        -> POST /api/jobs/:id/notes
     Api.acceptTerms(token, name)    -> POST /api/accept/:token
*/

const Api = {
  // ---- auth ----
  login(email, password) {
    // POST /api/login
    const db = MockData.load();
    const user = db.users.find(
      u => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password
    );
    if (!user) return Promise.reject(new Error("Invalid email or password."));
    const session = { userId: user.id, name: user.name, email: user.email, role: user.role };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return Promise.resolve(session);
  },

  logout() {
    // POST /api/logout
    localStorage.removeItem(SESSION_KEY);
    return Promise.resolve();
  },

  currentUser() {
    // GET /api/me
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  // ---- jobs ----
  listJobs({ status = "", search = "" } = {}) {
    // GET /api/jobs
    const db = MockData.load();
    let jobs = db.jobs.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (status) jobs = jobs.filter(j => j.status === status);
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j =>
        [j.jobNumber, j.clientName, j.clientEmail, j.propertyAddress, j.workType]
          .filter(Boolean)
          .some(v => v.toLowerCase().includes(q))
      );
    }
    return Promise.resolve(jobs);
  },

  getJob(id) {
    // GET /api/jobs/:id
    const db = MockData.load();
    const job = db.jobs.find(j => j.id === id);
    return job ? Promise.resolve(job) : Promise.reject(new Error("Job not found."));
  },

  createJob(payload) {
    // POST /api/jobs
    const db = MockData.load();
    const user = this.currentUser();
    const job = {
      id: uid("job"),
      jobNumber: MockData.nextJobNumber(db),
      clientName: payload.clientName,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      propertyAddress: payload.propertyAddress,
      workType: payload.workType,
      description: payload.description || "",
      status: "Draft",
      createdAt: new Date().toISOString(),
      createdBy: user ? user.name : "Unknown",
      token: makeToken(),
      termsSentAt: null,
      termsVersion: null,
      acceptance: null,
      notes: [],
      images: [],
      history: [{ at: new Date().toISOString(), by: user ? user.name : "Unknown", event: "Job created" }]
    };
    db.jobs.push(job);
    MockData.save(db);
    return Promise.resolve(job);
  },

  updateJobStatus(id, status) {
    // PATCH /api/jobs/:id/status
    const db = MockData.load();
    const job = db.jobs.find(j => j.id === id);
    if (!job) return Promise.reject(new Error("Job not found."));
    const user = this.currentUser();
    job.status = status;
    job.history.push({ at: new Date().toISOString(), by: user ? user.name : "Unknown", event: `Status changed to ${status}` });
    MockData.save(db);
    return Promise.resolve(job);
  },

  addNote(jobId, text) {
    // POST /api/jobs/:id/notes
    const db = MockData.load();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return Promise.reject(new Error("Job not found."));
    const user = this.currentUser();
    const note = {
      id: uid("note"),
      author: user ? user.name : "Unknown",
      text,
      createdAt: new Date().toISOString()
    };
    job.notes.push(note);
    MockData.save(db);
    return Promise.resolve(note);
  },

  addImage(jobId, { kind, dataUrl, caption = "" }) {
    // POST /api/jobs/:id/images  (kind: "before" | "after")
    const db = MockData.load();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return Promise.reject(new Error("Job not found."));
    const user = this.currentUser();
    const image = {
      id: uid("img"),
      kind,
      dataUrl,
      caption,
      uploadedBy: user ? user.name : "Unknown",
      createdAt: new Date().toISOString()
    };
    job.images.push(image);
    try {
      MockData.save(db);
    } catch (e) {
      return Promise.reject(new Error("Storage limit reached. Image too large for the prototype (localStorage ~5MB)."));
    }
    return Promise.resolve(image);
  },

  deleteImage(jobId, imageId) {
    // DELETE /api/jobs/:id/images/:imageId
    const db = MockData.load();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return Promise.reject(new Error("Job not found."));
    job.images = job.images.filter(i => i.id !== imageId);
    MockData.save(db);
    return Promise.resolve();
  },

  // ---- terms & acceptance ----
  getTerms() {
    // GET /api/terms/current
    const db = MockData.load();
    return Promise.resolve(db.terms[db.terms.length - 1]);
  },

  listTermsVersions() {
    // GET /api/terms
    const db = MockData.load();
    return Promise.resolve(db.terms.slice());
  },

  saveTerms(text) {
    // POST /api/terms  (creates a NEW version; old acceptances keep their version)
    const db = MockData.load();
    const version = db.terms.length + 1;
    const entry = { version, text, createdAt: new Date().toISOString() };
    db.terms.push(entry);
    MockData.save(db);
    return Promise.resolve(entry);
  },

  sendTermsEmail(jobId) {
    // POST /api/jobs/:id/send-terms  (mock: logs to emailLog, sets status)
    const db = MockData.load();
    const job = db.jobs.find(j => j.id === jobId);
    if (!job) return Promise.reject(new Error("Job not found."));
    const user = this.currentUser();
    const terms = db.terms[db.terms.length - 1];
    job.termsSentAt = new Date().toISOString();
    job.termsVersion = terms.version;
    if (job.status === "Draft") job.status = "Awaiting acceptance";
    job.history.push({ at: new Date().toISOString(), by: user ? user.name : "Unknown", event: "Terms & conditions sent to client" });
    db.emailLog.push({
      id: uid("eml"),
      jobId: job.id,
      to: job.clientEmail,
      subject: `${db.settings.companyName} — Job ${job.jobNumber}: please review and accept our terms`,
      sentAt: new Date().toISOString(),
      link: `client-accept.html?token=${job.token}`
    });
    MockData.save(db);
    return Promise.resolve(job);
  },

  getJobByToken(token) {
    // GET /api/public/jobs/:token  (no auth)
    const db = MockData.load();
    const job = db.jobs.find(j => j.token === token);
    if (!job) return Promise.reject(new Error("Invalid or expired link."));
    const terms = db.terms.find(t => t.version === (job.acceptance ? job.acceptance.termsVersion : (job.termsVersion || db.terms[db.terms.length - 1].version)));
    return Promise.resolve({ job, terms, settings: db.settings });
  },

  acceptTerms(token, fullName) {
    // POST /api/public/accept/:token
    const db = MockData.load();
    const job = db.jobs.find(j => j.token === token);
    if (!job) return Promise.reject(new Error("Invalid or expired link."));
    if (job.acceptance) return Promise.reject(new Error("These terms have already been accepted."));
    const terms = db.terms.find(t => t.version === job.termsVersion) || db.terms[db.terms.length - 1];
    job.acceptance = {
      acceptedBy: fullName,
      acceptedAt: new Date().toISOString(),
      termsVersion: terms.version
    };
    job.status = "Accepted";
    job.history.push({ at: new Date().toISOString(), by: fullName, event: "Terms & conditions accepted" });
    MockData.save(db);
    return Promise.resolve(job);
  },

  // ---- work types ----
  listWorkTypes() {
    // GET /api/work-types
    const db = MockData.load();
    return Promise.resolve(db.workTypes.filter(w => w.active));
  },

  listAllWorkTypes() {
    // GET /api/work-types?all=1
    const db = MockData.load();
    return Promise.resolve(db.workTypes.slice());
  },

  addWorkType(label) {
    // POST /api/work-types
    const db = MockData.load();
    const existing = db.workTypes.find(w => w.label.toLowerCase() === label.toLowerCase());
    if (existing) {
      existing.active = true;
      MockData.save(db);
      return Promise.resolve(existing);
    }
    const wt = { id: uid("wt"), label, active: true };
    db.workTypes.push(wt);
    MockData.save(db);
    return Promise.resolve(wt);
  },

  deactivateWorkType(id) {
    // DELETE /api/work-types/:id  (soft delete: keeps existing jobs intact)
    const db = MockData.load();
    const wt = db.workTypes.find(w => w.id === id);
    if (!wt) return Promise.reject(new Error("Work type not found."));
    wt.active = false;
    MockData.save(db);
    return Promise.resolve();
  },

  // ---- settings & users ----
  getSettings() {
    // GET /api/settings
    const db = MockData.load();
    return Promise.resolve(db.settings);
  },

  saveSettings(settings) {
    // PUT /api/settings
    const db = MockData.load();
    db.settings = Object.assign({}, db.settings, settings);
    MockData.save(db);
    return Promise.resolve(db.settings);
  },

  listUsers() {
    // GET /api/users
    const db = MockData.load();
    return Promise.resolve(db.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
  },

  addUser({ name, email, password, role }) {
    // POST /api/users
    const db = MockData.load();
    if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return Promise.reject(new Error("A user with that email already exists."));
    }
    const user = { id: uid("usr"), name, email, password, role };
    db.users.push(user);
    MockData.save(db);
    return Promise.resolve({ id: user.id, name, email, role });
  },

  listEmailLog() {
    // GET /api/email-log
    const db = MockData.load();
    return Promise.resolve(db.emailLog.slice().sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt)));
  }
};
