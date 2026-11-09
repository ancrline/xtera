/* XTERA Job Reports — Real API layer.
   Calls the Node.js backend at /api/...
   All endpoints use fetch with credentials: 'include' for session cookies.
*/

const API_BASE = '/api';

const Api = {
  // ---- auth ----
  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Login failed (${res.status})`);
    }
    const { user } = await res.json();
    return user;
  },

  async logout() {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Logout failed (${res.status})`);
    }
  },

  async requestPasswordReset(email) {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  async resetPassword(token, password) {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },

  async currentUser() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include'
      });
      if (!res.ok) return null;
      const { user } = await res.json();
      return user;
    } catch (e) {
      return null;
    }
  },

  // ---- jobs ----
  async listJobs() {
    const res = await fetch(`${API_BASE}/jobs`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load jobs (${res.status})`);
    }
    const { jobs } = await res.json();
    return jobs;
  },

  async getJob(id) {
    const res = await fetch(`${API_BASE}/jobs/${id}`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Job not found (${res.status})`);
    }
    const { job } = await res.json();
    return job;
  },

  async createJob(payload) {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to create job (${res.status})`);
    }
    const { job } = await res.json();
    return job;
  },

  async updateJob(id, payload) {
    const res = await fetch(`${API_BASE}/jobs/${id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update job (${res.status})`);
    }
    const { job } = await res.json();
    return job;
  },

  async addJobNote(jobId, text) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/notes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to add note (${res.status})`);
    }
    const { note } = await res.json();
    return note;
  },

  async getJobNotes(jobId) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/notes`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load notes (${res.status})`);
    }
    const { notes } = await res.json();
    return notes;
  },

  async uploadJobImage(jobId, kind, file, caption) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    formData.append('caption', caption || '');

    const res = await fetch(`${API_BASE}/jobs/${jobId}/images`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to upload image (${res.status})`);
    }
    const { image } = await res.json();
    return image;
  },

  async getJobImages(jobId) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/images`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load images (${res.status})`);
    }
    const { images } = await res.json();
    return images;
  },

  async deleteJobImage(imageId) {
    const res = await fetch(`${API_BASE}/images/${imageId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to delete image (${res.status})`);
    }
  },

  async acceptTerms(token, acceptedByName) {
    const res = await fetch(`${API_BASE}/jobs/accept/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acceptedByName })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to accept terms (${res.status})`);
    }
    const { job } = await res.json();
    return job;
  },

  async listWorkTypes() {
    const res = await fetch(`${API_BASE}/work-types`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed to load work types (${res.status})`);
    return data.workTypes;
  },

  async listAllWorkTypes() {
    const res = await fetch(`${API_BASE}/work-types?all=1`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed to load work types (${res.status})`);
    return data.workTypes;
  },

  async addWorkType(label) {
    const res = await fetch(`${API_BASE}/work-types`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed to add work type (${res.status})`);
    return data.workType;
  },

  async deactivateWorkType(id) {
    const res = await fetch(`${API_BASE}/work-types/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to remove work type (${res.status})`);
    }
  },

  async listUsers() {
    const res = await fetch(`${API_BASE}/users`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed to load users (${res.status})`);
    return data.users;
  },

  async addUser(payload) {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed to add user (${res.status})`);
    return data.user;
  },

  async getSettings() {
    const res = await fetch(`${API_BASE}/settings`, {
      credentials: 'include'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to load settings (${res.status})`);
    }
    const { settings } = await res.json();
    return settings;
  },

  async updateSettings(payload) {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Failed to update settings (${res.status})`);
    }
    const { settings } = await res.json();
    return settings;
  }
};
