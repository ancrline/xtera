/* XTERA Job Reports — API layer.
   Calls real backend API endpoints. Backend is at /api/ on the same origin.
   All requests include credentials (for session cookies).
*/

const BASE_URL = "/api";

const Api = {
  // ---- auth ----
  async login(email, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Login failed");
    }
    const data = await res.json();
    return data.user;
  },

  async logout() {
    const res = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Logout failed");
    }
    return res.json();
  },

  async currentUser() {
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        credentials: "include"
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  },

  // ---- jobs ----
  async listJobs({ status = "", search = "" } = {}) {
    const res = await fetch(`${BASE_URL}/jobs`, {
      credentials: "include"
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to load jobs");
    }
    const data = await res.json();
    let jobs = data.jobs || [];

    if (status) jobs = jobs.filter(j => j.status === status);
    if (search) {
      const q = search.toLowerCase();
      jobs = jobs.filter(j =>
        [j.jobNumber, j.clientName, j.clientEmail, j.propertyAddress, j.workType]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q))
      );
    }
    return jobs;
  },

  async getJob(id) {
    const jobs = await this.listJobs();
    const job = jobs.find(j => j.id === parseInt(id));
    if (!job) throw new Error("Job not found");
    return job;
  },

  async createJob(payload) {
    throw new Error("Create job endpoint not yet implemented on backend");
  },

  async updateJobStatus(id, status) {
    throw new Error("Update job status endpoint not yet implemented on backend");
  },

  async addNote(jobId, text) {
    throw new Error("Add note endpoint not yet implemented on backend");
  },

  async uploadJobImage(jobId, kind, dataUrl, caption) {
    throw new Error("Upload image endpoint not yet implemented on backend");
  },

  async acceptTerms(token, name) {
    throw new Error("Accept terms endpoint not yet implemented on backend");
  },

  async getTerms() {
    throw new Error("Get terms endpoint not yet implemented on backend");
  },

  async listTermsVersions() {
    throw new Error("List terms endpoint not yet implemented on backend");
  },

  async saveTerms(text) {
    throw new Error("Save terms endpoint not yet implemented on backend");
  },

  async sendTermsEmail(jobId) {
    throw new Error("Send terms email endpoint not yet implemented on backend");
  },

  async getJobByToken(token) {
    throw new Error("Get job by token endpoint not yet implemented on backend");
  },

  async listWorkTypes() {
    throw new Error("List work types endpoint not yet implemented on backend");
  },

  async getSettings() {
    throw new Error("Get settings endpoint not yet implemented on backend");
  },

  async updateSettings(payload) {
    throw new Error("Update settings endpoint not yet implemented on backend");
  }
};
