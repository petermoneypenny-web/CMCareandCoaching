# CM Care and Coaching — Personal Training Session Tracker & Invoicing

A static web application built for **CM Care and Coaching** to track personal training sessions per month, manage clients and session types, maintain a monthly history database, and generate printable/PDF end-of-month invoices in GBP (`£`).

## Features

1. **Monthly Session Tracker**
   - Month-by-month selector (`YYYY-MM`) with KPI cards for total sessions, billable revenue (`£`), and active clients.
   - Quick **+1 Session** counter cards for each active client (uses their default session type) plus custom dated session logging.
   - Filterable monthly session log table with full edit and delete support.
2. **Client Management (Add / Edit / Remove)**
   - Store client contact details, billing address, coaching notes, status (`Active` / `Archived`), and default session package.
3. **Session Types & Rates (Add / Edit / Remove)**
   - Configure session types, duration in minutes, standard GBP (`£`) rates, colour badges, and descriptions.
4. **Monthly History Database**
   - Browse every recorded month's session counts, client breakdowns, and revenue totals, and jump directly to any past month's tracker or invoices.
5. **End-of-Month Invoice Builder & PDF Print View**
   - Select any client and billing month (`YYYY-MM`).
   - Switch between **Itemized by Session Date & Type** or **Grouped Summary by Session Type**.
   - Customise invoice numbers, issue/due dates, discounts, and client notes.
   - Clean A4 print stylesheet (`Print / Save Invoice as PDF`).
6. **GitHub Repository Sync (`data/db.json`) + Local Backup**
   - Syncs directly with `data/db.json` in `petermoneypenny-web/CMCareandCoaching` via the GitHub Contents API using a fine-grained Personal Access Token.
   - Includes one-click JSON export and import backups.

---

## Hosting on GitHub Pages

1. Commit and push these files (`index.html`, `styles.css`, `app.js`, `data/db.json`, `README.md`) to the `main` branch of `https://github.com/petermoneypenny-web/CMCareandCoaching`.
2. On GitHub, go to **Settings &rarr; Pages**.
3. Under **Build and deployment**, set:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` / `/ (root)`
4. Click **Save**. Your site will be live at `https://petermoneypenny-web.github.io/CMCareandCoaching/`.

---

## Setting Up GitHub API Database Sync

To save updates directly back to `data/db.json` in your GitHub repository from the hosted website:

1. On GitHub, go to **Settings &rarr; Developer settings &rarr; Personal access tokens &rarr; Fine-grained tokens**.
2. Click **Generate new token**:
   - **Repository access**: Select **Only select repositories** &rarr; `petermoneypenny-web/CMCareandCoaching`.
   - **Repository permissions**: Set **Contents** to **Read and write**.
3. Copy the generated token.
4. Open the website, go to **Business & GitHub Sync**, paste the token into the **GitHub Personal Access Token** field, optionally enable **Automatically push changes to GitHub**, and click **Save GitHub Settings**.

---

## Setting Up Google Drive Invoice Storage (`Year / Month / Invoice.pdf`)

1. Open [Google Cloud Console](https://console.cloud.google.com/), create (or select) a project, and enable the **Google Drive API**.
2. Go to **APIs & Services &rarr; OAuth consent screen**, configure your app (External, Testing mode with your Google email added as a Test User).
3. Go to **APIs & Services &rarr; Credentials &rarr; Create Credentials &rarr; OAuth client ID** (Application type: **Web application**).
4. Under **Authorized JavaScript origins**, add `https://petermoneypenny-web.github.io`.
5. Copy the generated **Client ID**, open the website's **Business & GitHub Sync** tab, paste it into **Google OAuth 2.0 Client ID**, and paste your existing Google Drive folder link (or ID) into **Target Google Drive Folder URL or Folder ID**.
6. Click **Connect & Test Google Drive**. From **End-of-Month Invoices**, you can now click **Upload All to Google Drive (Year/Month/)** or **Download All as ZIP (Year/Month/*.pdf)**.

