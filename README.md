# AKASH SHOP C1 · Inventory Tracker

A password-protected inventory website for the shop. It runs as a static site from GitHub Pages, and Supabase handles the logins and stores the data.

## What it does

- **Sign-in required at all times.** Without a login, a visitor sees only the sign-in screen. The database itself refuses every request that isn't from an approved staff account, so the data is safe even if someone reads the site's code.
- **Dashboard** with 8 headline numbers and 6 charts:
  - Stock by brand
  - Stock health
  - Shop vs warehouse
  - 14-day stock movement
  - Value by brand
  - Top products by value
- **Lists on the dashboard:**
  - Low-stock alerts
  - Out of stock
  - Recent activity
  - A searchable, filterable table of every item
- **Separate shop and warehouse quantities** for every item.
- **Low-stock alerts.** Each item has its own alert level, and the item is marked low when shop + warehouse is at or below it.
- **Out-of-stock flag.** Mark an item out of stock even when units are on record (damaged, recalled, supplier problem). Adding stock clears the flag automatically.
- **"Refill shelf" hint** when the shop is empty but the warehouse still has stock.
- **Brand tabs.** Create one tab per brand. An item added anywhere goes into the dashboard *and* its brand tab automatically. Deleting a tab never deletes items; they move to an "Unbranded" tab.
- **Adjust stock window** for stock in, stock out or sold, and warehouse ↔ shop transfers. It shows a preview and won't allow quantities to go below zero.
- **Full stock history.** It is written by the database itself and can't be edited from the app.
- **CSV export**, which opens in Excel or Google Sheets.
- **Works on phones**, and follows the device's dark mode.
- **Automatic sign-out** after 30 minutes idle, and when the browser tab is closed. Both can be changed in `js/config.js`.

### Sales (Live Sales Counter)

- **Live Sales Counter** button on the dashboard opens a full-screen till:
  - top half: the **Sales Sheet** (quantities and prices can be changed on each line)
  - bottom half: every item in the shop as tap-able tiles (search + brand filters), a big **quantity circle** with − / + (or type a number), and a big **Add** button
  - a voice reads out the **item name and quantity** after each Add (never the price); the speaker button mutes it
  - the running **total** is always shown at the bottom
- **Submit** → a confirmation pop-up → **customer details** (Private, Frequent customer drop-down, or New customer with "Save as frequent customer"; address and number optional) → **payment** (Amount due, Paid in full or Partial payment, Cash / Card / Bank transfer) → **Generate Invoice & Record Sale**.
- Recording a sale **takes the items off shop stock immediately** (it can't sell more than the shop holds) and logs each line in the stock history as "Sale C1-01001".
- A **PDF invoice** downloads straight away, ending with "Thanks For Shopping With Us". On phones a **Send to customer** button opens the share menu (WhatsApp, email…).
- **Invoices tab** – every invoice with sales metrics and charts; download any invoice again at any time.
- **Not Fully Paid tab** – everything still owed: total outstanding, who owes the most, oldest balance, tap-to-call numbers, and **Record payment** for money paid later. Once fully paid, the invoice leaves this tab, and its PDF shows the payment history.
- **Invoice details** (Invoices tab) sets the shop address, phone, email and bottom message printed on invoices. **Frequent customers** lets you add or remove saved customers.


### Backup, export and Sales Tracker

- **Backup** (top bar) → **Create backup** downloads one `.json` file containing everything: brand tabs, items, stock history, invoices, payments, frequent customers and invoice details. Keep these files somewhere safe (Google Drive, email to yourself, a USB stick).
- **Backup → Restore a backup**: choose a backup file, check the preview (date and counts), tick the confirm box. The tracker is put back exactly as it was in that file, with the same IDs, invoice numbers, dates and balances. A safety backup of the current data downloads first. The restore happens in one step: if the file is damaged, nothing changes. Logins are never affected.
- **Export** (top bar) → **Spreadsheet (CSV)** or **PDF report**. The PDF lists every item grouped by brand with all columns (shop, warehouse, total, alert level, price, value, status) plus summary figures.
- **Sales are counted when money is received.** An invoice that isn't fully paid only adds to sales on the day(s) the customer actually pays.
- **Sales Tracker** tab: animated sales graph (amount by date), a calendar to pick one day or a range (or presets like *This month*), the totals for that period, and **Generate Sales Report**. That downloads a PDF with a one-page summary followed by a bank-statement-style list of every sale in date order, with a running balance.

## Files

```
index.html            the page
css/styles.css        the look
js/config.js          ← your settings (Supabase keys, currency)
js/app.js             the app
js/pdf.js             builds the PDF invoices
js/reports.js         builds the inventory and sales report PDFs
supabase/schema.sql   database setup, run once in Supabase
supabase/sales.sql    sales/invoices setup, run once in Supabase
supabase/backup.sql   backup/restore setup, run once in Supabase
```

## Setup (about 20 minutes)

Supabase occasionally renames menu items. If a label below doesn't match exactly, look for the closest one.

### 1. Create the database

1. Sign up at **supabase.com** → **New project**. Pick a region near the shop and save the database password somewhere safe.
2. Open **SQL Editor** → **New query**. Paste in the whole of `supabase/schema.sql` and click **Run**. It should finish with "Success".

   Then do the same with `supabase/sales.sql`, and then `supabase/backup.sql` (each in a new query).

### 2. Lock down sign-ups and create the shopkeeper's login

1. Go to **Authentication** → **Sign In / Providers** (or **Settings**). Turn **off** "Allow new users to sign up".
2. Go to **Authentication** → **Users** → **Add user** → **Create new user**. Enter his email and a strong password, and tick **Auto Confirm User**.
3. Back in **SQL Editor**, run this with his email:
   ```sql
   insert into public.staff (user_id)
   select id from auth.users where email = 'his-email@example.com'
   on conflict do nothing;
   ```
   Only accounts listed in `staff` can see anything. To add a member of staff later, repeat steps 2–3 for them.

### 3. Connect the website to the database

1. In Supabase open **Project Settings** → **API** (or **API Keys**). Copy the **Project URL** and the **anon / publishable** key.
2. Paste both into `js/config.js`. Set `CURRENCY` and `LOCALE` for the shop too, for example `'GBP'` / `'en-GB'` or `'INR'` / `'en-IN'`.

   The anon key is designed to be public. Security comes from the database rules, not from hiding this key. **Never** put the `service_role` / secret key in this file.

### 4. Publish on GitHub Pages

1. Create a repository on GitHub and upload all the files, keeping the folders.
2. Go to **Settings** → **Pages** → **Deploy from a branch** → `main` / `(root)` → **Save**.
3. After a minute the site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.
4. Back in Supabase: **Authentication** → **URL Configuration**. Set the **Site URL** to that address and add it under **Redirect URLs**. Without this, "Forgot password" emails won't link back to the site.

Done. Open the site, sign in, create the first brand tab, and add items.

## Good to know

- **The code is visible, the data is not.** GitHub Pages sites are public, so anyone with the link can load the sign-in page and read the HTML/JS. They contain no stock data and no secrets. If you'd rather keep the code private too, a private repo works with GitHub Pages on paid GitHub plans, or free on Netlify, Vercel or Cloudflare Pages.
- **Supabase free plan:** a project that has no activity for 7 days is paused. Restore it with one click in the Supabase dashboard. Daily use keeps it awake.
- **Backups:** use **Backup → Create backup** regularly (for example weekly) and keep the files safe. Supabase paid plans add automatic backups too.
- **Two people editing at once:** the page refreshes its data when you return to the tab, and the **Refresh** button reloads instantly. Stock adjustments are applied safely in the database, so simultaneous changes never overwrite each other.
- **Large catalogues:** the app loads up to 1,000 items in one go, which is plenty for one shop. Beyond that, ask for pagination to be added.

## Settings (`js/config.js`)

| Setting | Default | Meaning |
|---|---|---|
| `CURRENCY` | `GBP` | Currency used for prices and values |
| `LOCALE` | `en-GB` | Number and date format |
| `REMEMBER_LOGIN` | `false` | `true` keeps him signed in after the browser closes |
| `IDLE_LOGOUT_MINUTES` | `30` | Auto sign-out after this much inactivity; `0` turns it off |
| `DEFAULT_LOW_STOCK` | `5` | Starting alert level for new items |
