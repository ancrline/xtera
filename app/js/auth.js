/* XTERA Job Reports — auth guards. */

const Auth = {
  async user() {
    return await Api.currentUser();
  },

  async isAdmin() {
    const u = await this.user();
    return u && u.role === "admin";
  },

  async requireAuth() {
    const u = await this.user();
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

  logout() {
    Api.logout().then(() => {
      window.location.href = "login.html";
    }).catch(err => {
      console.error("Logout error:", err);
      window.location.href = "login.html";
    });
  }
};

