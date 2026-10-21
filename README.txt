XTERRA Exterior Cleaning Services — HTML landing page

FILES
-----
index.html      Main responsive page
styles.css      Custom CSS
script.js       Editable contact details + localStorage
assets/         Separate photo assets cropped from the supplied reference

BOOTSTRAP
---------
Bootstrap 5.3.3 is loaded from jsDelivr CDN.
Bootstrap Icons are also loaded from jsDelivr CDN.

EDIT PHONE / WEBSITE / EMAIL
----------------------------
1. Open index.html.
2. Click the "Edit" button at the bottom-right.
3. Change phone, website and email.
4. Click "Save contact details".

The values are saved in the visitor's browser with localStorage.

For permanent default values, edit DEFAULT_CONTACT in script.js:

const DEFAULT_CONTACT = {
  phone: "0800326002",
  website: "xterra.co.nz",
  email: "infoxtera@gmail.com"
};

NOTES
-----
The original uploaded graphic was used as the visual reference.
The page is rebuilt as separate HTML/CSS elements instead of using the
entire original graphic as a single page background.
