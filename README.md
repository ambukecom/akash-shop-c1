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

## Files

```
index.html            the page
css/styles.css        the look
js/config.js          ← your settings (Supabase keys, currency)
js/app.js             the app
supabase/schema.sql   database setup, run once in Supabase
```

## Setup (about 20 minutes)

Supabase occasionally renames menu items. If a label below doesn't match exactly, look for the closest one.

### 1. Create the database

1. Sign up at **supabase.com** → **New project**. Pick a region near the shop and save the database password somewhere safe.
2. Open **SQL Editor** → **New query**. Paste in the whole of `supabase/schema.sql` and click **Run**. It should finish with "Success".

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
- **Backups:** use **Export** in the app regularly. Supabase paid plans add automatic backups.
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
