/* XTERA Job Reports — authentication guards. */

const Auth = {
  async currentUser() {
    return await Api.currentUser();
  },

  async isAdmin() {
    const u = await this.currentUser();
    return u && u.role === "admin";
  },

  async requireAuth() {
    const u = await this.currentUser();
    if (!u) {
      window.location.href = "login.html";
      return null;
    }
    return u;
  },

  async requireAdmin() {
    const u = await this.requireAuth();
    if (!u) return null;
    if (u.role !== "admin") {
      window.location.href = "dashboard.html";
      return null;
    }
    return u;
  },

  async logout() {
    try {
      await Api.logout();
    } catch (e) {
      console.error("Logout error:", e);
    }
    window.location.href = "login.html";
  }
};
