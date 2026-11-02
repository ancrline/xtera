/* XTERA Job Reports — mock database (localStorage).
   Swap point: when a real backend exists, Api in api.js calls fetch() instead. */

const DB_KEY = "xtera_app_db";
const SESSION_KEY = "xtera_app_session";

const DEFAULT_TERMS_TEXT = `TERMS AND CONDITIONS OF SERVICE

1. QUOTES AND PRICING
All quotes are based on information provided at the time of quoting. Final pricing may vary if the scope of work changes or conditions on site differ from those described.

2. ACCESS AND WATER/POWER SUPPLY
The client agrees to provide reasonable access to the property, including access to an outdoor water supply and, where required, a power outlet. Please ensure gates are unlocked and pets are secured on the day of service.

3. PRE-EXISTING DAMAGE
Our team will take reasonable care while working on your property. We are not responsible for pre-existing damage, including but not limited to loose paint, oxidised surfaces, cracked joinery, or degraded sealant. Before photos are taken for record purposes.

4. WEATHER
Exterior cleaning is weather dependent. We may reschedule at short notice if conditions are unsafe or unsuitable. There is no charge for weather-related rescheduling.

5. PAYMENT
Payment is due on completion of the work unless otherwise agreed in writing. Overdue accounts may incur collection costs.

6. CANCELLATION
Please provide at least 24 hours notice for cancellations or rescheduling.

7. ACCEPTANCE
By clicking "I Accept" and providing your full name, you confirm that you have read, understood, and agree to these terms and conditions, and you authorise the work described in this job to proceed.`;

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const MockData = {
  seed() {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();

    return {
      users: [
        { id: uid("usr"), name: "Admin User", email: "admin@xtera.co.nz", password: "admin123", role: "admin" },
        { id: uid("usr"), name: "Sam Tradie", email: "staff@xtera.co.nz", password: "staff123", role: "staff" }
      ],
      settings: {
        companyName: "XTERA Exterior Cleaning",
        email: "infoxtera@gmail.com",
        phone: "0800326002",
        website: "xtera.co.nz"
      },
      workTypes: [
        { id: uid("wt"), label: "House Wash", active: true },
        { id: uid("wt"), label: "Roof Wash", active: true },
        { id: uid("wt"), label: "Window Cleaning", active: true },
        { id: uid("wt"), label: "Gutter Cleaning", active: true },
        { id: uid("wt"), label: "Driveway Cleaning", active: true },
        { id: uid("wt"), label: "Fence Cleaning", active: true },
        { id: uid("wt"), label: "Building Wash", active: true },
        { id: uid("wt"), label: "Commercial Wash", active: true }
      ],
      terms: [
        { version: 1, text: DEFAULT_TERMS_TEXT, createdAt: now }
      ],
      jobs: [
        {
          id: uid("job"),
          jobNumber: "XT-0001",
          clientName: "Jane Smith",
          clientEmail: "jane.smith@example.com",
          clientPhone: "021 555 123",
          propertyAddress: "12 Kauri Street, Remuera, Auckland",
          workType: "House Wash",
          description: "Full exterior house wash including gutters and windows. Two-storey weatherboard home.",
          status: "Accepted",
          createdAt: yesterday,
          createdBy: "Admin User",
          token: makeToken(),
          termsSentAt: yesterday,
          termsVersion: 1,
          acceptance: {
            acceptedBy: "Jane Smith",
            acceptedAt: now,
            termsVersion: 1
          },
          notes: [
            { id: uid("note"), author: "Admin User", text: "Client requested morning start, park on driveway.", createdAt: yesterday }
          ],
          images: [],
          history: [
            { at: yesterday, by: "Admin User", event: "Job created" },
            { at: yesterday, by: "Admin User", event: "Terms & conditions sent to client" },
            { at: now, by: "Jane Smith", event: "Terms & conditions accepted" }
          ]
        },
        {
          id: uid("job"),
          jobNumber: "XT-0002",
          clientName: "Coastal Properties Ltd",
          clientEmail: "manager@coastalproperties.co.nz",
          clientPhone: "09 555 8899",
          propertyAddress: "88 Beach Road, Takapuna, Auckland",
          workType: "Building Wash",
          description: "Three-storey apartment block exterior wash. Body corporate approval attached to email thread.",
          status: "Awaiting acceptance",
          createdAt: now,
          createdBy: "Admin User",
          token: makeToken(),
          termsSentAt: now,
          termsVersion: 1,
          acceptance: null,
          notes: [],
          images: [],
          history: [
            { at: now, by: "Admin User", event: "Job created" },
            { at: now, by: "Admin User", event: "Terms & conditions sent to client" }
          ]
        }
      ],
      emailLog: []
    };
  },

  load() {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const db = this.seed();
      this.save(db);
      return db;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error("Corrupt mock DB, reseeding.", e);
      const db = this.seed();
      this.save(db);
      return db;
    }
  },

  save(db) {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  },

  reset() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    return this.load();
  },

  nextJobNumber(db) {
    const max = db.jobs.reduce((m, j) => {
      const n = parseInt((j.jobNumber || "").replace(/\D/g, ""), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return "XT-" + String(max + 1).padStart(4, "0");
  }
};
