/* XTERA Job Reports — mock auth guards. */

const Auth = {
  user() {
    return Api.currentUser();
  },

  isAdmin() {
    const u = this.user();
    return u && u.role === "admin";
  },

  requireAuth() {
    const u = this.user();
    if (!u) {
      window.location.href = "login.html";
      return null;
    }
    return u;
  },

  requireAdmin() {
    const u = this.requireAuth();
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
    });
  }
};
