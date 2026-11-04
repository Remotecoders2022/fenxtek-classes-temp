# FenxTek Shorthand Classes — multi-page site

Static multi-page website with a student portal and an admin CRM. Pages are plain HTML/CSS/JS; Firebase Authentication + Realtime Database provide sign-in and live content.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Home (legacy single-page is still `fenxtek-v2.html`) |
| `courses.html` | Batches and fee plans |
| `exams.html` | Exam patterns |
| `method.html` | Three-step method + why FenxTek |
| `about.html` | Director and testimonials |
| `membership.html` | Pricing and FAQ |
| `contact.html` | Join form and contact details |
| `auth.html` | Student sign in / sign up (email + Google) |
| `dashboard.html` | Signed-in student dashboard |
| `admin.html` | Admin CRM (content, collections, students, leads) |

Shared code lives in `assets/css/site.css` (design system), `assets/css/portal.css` (portal/CRM), and `assets/js/`.

- `chrome.js` injects the sprite, header, mobile menu, footer and page effects.
- `site.js` handles interactions (preloader, reveals, counters, FAQ, join form, footer wordmark).
- `content.js` mirrors RTDB content onto the public pages.
- `auth-ui.js` updates the header “Portal” link after sign-in.
- `firebase.js` loads the Firebase v10 SDK on demand and wraps auth/database helpers.

## Local preview

The site must be served over HTTP — ES modules, Firebase Auth and Realtime Database do not work from `file://`.

```powershell
cd C:\Users\tanma\OneDrive\Documents\fenxtek
python -m http.server 8123
```

Open <http://localhost:8123>. Without Firebase keys every public page still works from the static HTML; only the portal/CRM are inactive and show a “Firebase not configured” notice.

## Firebase setup

### Current project

`assets/js/firebase-config.js` is filled in for the **whatsappy-b69e1** project, and the deployed
Realtime Database rules already match `database.rules.json` (public reads on site content, create-only
leads, admin-only writes).

Still to do in the Firebase console:

1. **Authentication → Sign-in method → Google**: turn it on (Email/Password is already enabled).
2. **Authentication → Settings → Authorized domains**: add `127.0.0.1` if you browse via that address
   (`localhost` is allowed by default, `127.0.0.1` is not) and add your production domain after deploy.
3. Admin owner: `ADMIN_EMAILS` and the rules still use `admin@example.com`. Create an account with that
   address on `auth.html` (Firebase does not require inbox verification), or change both files to a real
   Gmail and republish the rules.

### From scratch

1. Create a project at <https://console.firebase.google.com>.
2. Add a **Web app** and copy the config object.
3. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
4. **Build → Realtime Database**: create a database (start in locked mode).
5. Paste your values into `assets/js/firebase-config.js`:

```js
export const firebaseConfig = {
  apiKey: "…",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "…",
  appId: "…"
};

export const ADMIN_EMAILS = ["your-admin@gmail.com"];
```

6. Open `database.rules.json` and replace **both** `admin@example.com` references with the same admin email. In the Firebase console go to **Realtime Database → Rules**, paste the file contents and publish.
7. **Authentication → Settings → Authorized domains**: add `localhost` (already default) and your production domain.

> The config values are not secrets; the database rules are what protect the data. Never commit a service-account key.

### Admin access

The first sign-in with the email listed in `ADMIN_EMAILS` self-claims `admins/{uid}` (the rules allow exactly that email to do it). After that the CRM opens from `admin.html`, and the header link changes to **CRM**.

To make another account an admin, open **Realtime Database → Data** and add:

```json
admins
  └── <their-uid>: true
```

To revoke access, set the value to `false` or delete the node.

## Realtime Database shape

```
site
 ├── content        { heroLead, announcement, price, students, dictations, patterns,
 │                    phone, email, telegram, instagram, directorName, directorMessage }
 ├── batches        { <id>: { title, tag, order } }
 ├── fees           { <id>: { label, note, price, was, order } }
 ├── faqs           { <id>: { q, a, order } }
 ├── testimonials   { <id>: { quote, name, exam, badge, order } }
 └── leads          { <pushId>: { email, source, at } }

users
 └── <uid>          { name, email, phone, exam, speed, createdAt, lastLogin }

admins
 └── <uid>          true
```

- Public read access: `site/content`, `site/batches`, `site/fees`, `site/faqs`, `site/testimonials`.
- Public write access: create-only on `site/leads` (email validated by the rules).
- `users/<uid>` is readable/writable by that user; admins can read all students.
- Everything else requires an admin entry under `admins/`.

## Using the CRM

Open `admin.html` and sign in with the admin account.

- **Overview** — live counts, current price, published announcement.
- **Site content** — hero paragraph, counters, starting price, phone/email/social handles, director details and the student-dashboard announcement.
- **Batches / Fees / FAQs / Testimonials** — add, edit, reorder or remove rows, then **Save**. Public pages re-render from RTDB immediately (no rebuild).
- **Students** — accounts created through the portal.
- **Leads** — emails captured by the public “Join now” forms, with CSV export and delete.
- **Load starter content** — writes the default website content (from `assets/js/cms-defaults.js`) to RTDB.

If a node is missing, the public pages fall back to the HTML that shipped with the site, so a half-filled database never leaves blank sections.

## Notes

- `_build.ps1` regenerates the seven public pages from `fenxtek-v2.html`. Running it **overwrites** those files, so make content edits in the CRM afterwards (or re-run the seed button).
- `new (1).html` and `fenxtek-v2.html` are kept as the previous single-page versions and are not part of the new navigation.
- The footer wordmark, palette, typography and all section copy are shared with `fenxtek-v2.html`.

## Deploy (optional)

`firebase.json` is included for Firebase Hosting plus Realtime Database rules.

```powershell
npm install -g firebase-tools
firebase login
firebase use --add        # choose your Firebase project
firebase deploy --only hosting,database
```

Then open the Hosting URL, sign in with the admin account once to claim `admins/{uid}`, and load the starter content from the CRM.

