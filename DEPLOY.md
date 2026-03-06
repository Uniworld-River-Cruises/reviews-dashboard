# Deploying to GitHub Pages

## Quick Setup (5 minutes)

### Prerequisites
- [Git](https://git-scm.com/downloads) installed
- [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`)

### One-Time Deploy

Open a terminal, `cd` into this **Reviews** folder, and run:

```bash
# 1. Initialize a git repo
git init
git checkout -b main

# 2. Add all files
git add -A
git commit -m "Uniworld 2025 Review Intelligence site"

# 3. Create a GitHub repo (choose public or private)
gh repo create uniworld-2025-reviews --public --source=. --push

# 4. Enable GitHub Pages
gh api repos/{OWNER}/uniworld-2025-reviews/pages -X POST -f source.branch=main -f source.path=/
```

Replace `{OWNER}` with your GitHub username or organization name.

Your site will be live at: **https://{OWNER}.github.io/uniworld-2025-reviews/**

### Updating the Site

After making changes:

```bash
git add -A
git commit -m "Update review data"
git push
```

Changes typically go live within 1-2 minutes.

### Alternative: Manual Upload

If you prefer not to use the command line:

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository called `uniworld-2025-reviews`
3. Click **"uploading an existing file"**
4. Drag and drop all files from this folder
5. Commit the changes
6. Go to **Settings > Pages** and set source to `main` branch, root folder
7. Your site will be live within a couple minutes

### Sharing

Once deployed, share this URL with your team:
- **Landing page:** `https://{OWNER}.github.io/uniworld-2025-reviews/`
- **Fleet dashboard:** `https://{OWNER}.github.io/uniworld-2025-reviews/overview/executive-dashboard.html`

Note: The `.docx` files in each folder will download when clicked from the browser.
