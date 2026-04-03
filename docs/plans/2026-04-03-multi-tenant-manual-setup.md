# Multi-Tenant Manual Setup Instructions

**Date:** 2026-04-03
**Related plan:** `2026-04-03-multi-tenant-roadmap-v2.md`
**Purpose:** Step-by-step instructions for manual actions required outside of code — Firebase Console, Google Cloud Console, GitHub, Microsoft Entra ID, and DNS configuration.

These steps are organized by phase and must be completed **before** the corresponding code changes are deployed.

---

## Table of Contents

1. [Phase 1.5: Firebase App Hosting Setup](#phase-15-firebase-app-hosting-setup)
2. [Phase 2: Cloud KMS, Firestore & Storage Setup](#phase-2-cloud-kms-firestore--storage-setup)
3. [Phase 3: Firebase Storage Rules](#phase-3-firebase-storage-rules)
4. [Phase 4: Microsoft Entra ID & Auth Updates](#phase-4-microsoft-entra-id--auth-updates)
5. [Phase 5: Domain & DNS (Optional)](#phase-5-domain--dns-optional)

---

## Phase 1.5: Firebase App Hosting Setup

### Step 1: Enable Firebase App Hosting in the Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select the **feefo-reviews** project
3. In the left sidebar, click **App Hosting** (under "Build")
4. If prompted, click **Get started** to enable the App Hosting service
5. Click **Create backend**

### Step 2: Connect the GitHub Repository

1. In the "Create backend" wizard, select **GitHub** as the source
2. Authenticate with GitHub if not already connected
3. Select the repository that contains the feefo-reviews code
4. Set the **root directory** to `app` (this is where `next.config.ts` and `package.json` live)
5. Set the **branch** to `main` (or your production branch)
6. Set the **framework** to **Next.js** (auto-detected)

### Step 3: Configure the Backend

1. **Backend ID:** `feefo-reviews-web` (or any descriptive name)
2. **Region:** `us-central1` (same region as your Cloud Functions for lowest latency)
3. **Environment variables:** Add the following:
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `feefo-reviews`
   - `NEXT_PUBLIC_FIREBASE_API_KEY` = (your Firebase Web API key from the current `app/.env.local`)
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `feefo-reviews.firebaseapp.com`
   - `NEXT_PUBLIC_FUNCTIONS_URL` = `https://us-central1-feefo-reviews.cloudfunctions.net`
4. Click **Create backend**

### Step 4: Verify the Deployment

1. After the backend is created, Firebase will trigger an initial build from your GitHub repo
2. Monitor the build logs in the Firebase Console under **App Hosting > Builds**
3. Once deployed, a URL will be provided (e.g., `feefo-reviews-web--[hash].us-central1.hosted.app`)
4. Test the URL to verify the app loads correctly

### Step 5: Connect Custom Domain (if applicable)

1. In the Firebase Console, go to **App Hosting > your backend > Custom domains**
2. Click **Add custom domain**
3. Enter your domain (e.g., `reviews.feefo-platform.com` or keep `feefo-reviews.web.app`)
4. Follow the DNS verification steps provided
5. Firebase will provision an SSL certificate automatically

### Step 6: Update Firebase Hosting (Legacy) — Redirect or Decommission

After Firebase App Hosting is working:

1. **Option A (Recommended for transition):** Keep the old Firebase Hosting active temporarily with a redirect:
   - In `firebase.json`, update the hosting section to redirect all traffic to the new App Hosting URL
   - This ensures existing bookmarks/links continue working

2. **Option B (Clean break):** Remove the `hosting` section from `firebase.json` entirely
   - Only do this once you've confirmed all users have updated their bookmarks
   - Note: `feefo-reviews.web.app` will stop serving if you remove hosting config

### Step 7: Update GitHub Actions Workflow

1. Go to your GitHub repository **Settings > Secrets and variables > Actions**
2. Firebase App Hosting auto-deploys on git push (no manual deploy step needed in GitHub Actions)
3. However, you still need the GitHub Actions workflow for:
   - Building and deploying **Cloud Functions** (`firebase deploy --only functions`)
   - Deploying **Firestore rules and indexes** (`firebase deploy --only firestore`)
4. Remove the `hosting` deploy target from your workflow since App Hosting handles it:

   **Change from:**
   ```
   firebase deploy --project feefo-reviews --only functions,hosting
   ```
   **Change to:**
   ```
   firebase deploy --project feefo-reviews --only functions,firestore
   ```

5. Remove the step that builds the Next.js static export (the `npm run build` in the `app/` directory) since App Hosting handles the frontend build
6. You may also want to add a step that runs `firebase apphosting:backends:get feefo-reviews-web` to verify the App Hosting backend is healthy after deploy

### Step 8: Configure App Hosting Build Settings

1. Create a file `apphosting.yaml` in the **repository root** (NOT inside `app/`):

   ```yaml
   runConfig:
     minInstances: 0        # Scale to zero when idle (cost-saving)
     maxInstances: 10       # Cap for cost control
     concurrency: 80        # Requests per instance
     cpu: 1
     memoryMiB: 512
   env:
     - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
       value: feefo-reviews
     - variable: NEXT_PUBLIC_FIREBASE_API_KEY
       value: AIzaSyDNU-M25IlolRoaWFCgdRWMJ5e6b08oIMU
     - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
       value: feefo-reviews.firebaseapp.com
     - variable: NEXT_PUBLIC_FUNCTIONS_URL
       value: https://us-central1-feefo-reviews.cloudfunctions.net
   ```

2. If the Next.js app is in a subdirectory (`app/`), you may need to set the `rootDirectory` in the Firebase Console backend settings to `app`

---

## Phase 2: Cloud KMS, Firestore & Storage Setup

### Step 1: Enable the Cloud KMS API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select the **feefo-reviews** project
3. Navigate to **APIs & Services > Library**
4. Search for **Cloud Key Management Service (Cloud KMS)**
5. Click **Enable**

### Step 2: Create a KMS Key Ring and Key

1. In the Google Cloud Console, navigate to **Security > Key Management**
2. Click **Create Key Ring**
   - **Key ring name:** `feefo-credentials`
   - **Location:** `us-central1` (same region as Cloud Functions)
   - Click **Create**
3. Inside the key ring, click **Create Key**
   - **Key name:** `org-credentials`
   - **Protection level:** **Software** (sufficient for this use case; HSM is more expensive)
   - **Purpose:** **Symmetric encrypt/decrypt**
   - **Rotation period:** 90 days (recommended)
   - Click **Create**

### Step 3: Grant Cloud Functions Service Account KMS Permissions

1. Find your Cloud Functions service account:
   - Go to **IAM & Admin > IAM**
   - Look for the service account with format: `feefo-reviews@appspot.gserviceaccount.com`
   - (Also check for the App Engine default service account or Cloud Functions service account)
2. Click **Grant Access** (or edit the existing entry)
3. Add the role: **Cloud KMS CryptoKey Encrypter/Decrypter** (`roles/cloudkms.cryptoKeyEncrypterDecrypter`)
4. Click **Save**
5. **Verify:** The service account should now have these roles:
   - `Cloud KMS CryptoKey Encrypter/Decrypter`
   - (Plus its existing roles like `Firebase Admin`, `Cloud Functions Invoker`, etc.)

### Step 4: Note the Full Key Resource Name

You'll need this in the Cloud Functions code. The format is:

```
projects/feefo-reviews/locations/us-central1/keyRings/feefo-credentials/cryptoKeys/org-credentials
```

Store this as an environment variable for Cloud Functions:
1. Go to **GitHub > Repository Settings > Secrets and variables > Actions**
2. Add a new secret: `KMS_KEY_NAME` with value: `projects/feefo-reviews/locations/us-central1/keyRings/feefo-credentials/cryptoKeys/org-credentials`

### Step 5: Create the Super-Admin Document in Firestore

This must be done manually for the FIRST super-admin (subsequent ones can be added via the platform admin UI in Phase 5).

1. Go to **Firebase Console > Firestore Database**
2. Click **Start collection** (or **Add collection** if Firestore is already initialized)
3. Set the **Collection ID** to: `platform`
4. Create a document with **Document ID:** `config`
   - Fields:
     - `maintenanceMode` (boolean): `false`
     - `allowSelfServiceSignup` (boolean): `false`
     - `defaultTheme` (map): `{ primary: "#1B3A5C", primaryDark: "#0F2A45", accent: "#C5A258", accentLight: "#D4B778", neutral: "#6B7280", surfaceWarm: "#F9F7F4" }`
5. Create a **subcollection** under `platform` called `super_admins`
6. Inside `super_admins`, create a document:
   - **Document ID:** (the Firebase Auth UID of the initial super-admin user)
     - To find this UID: go to **Firebase Console > Authentication > Users**, find the admin user's email, copy their **User UID**
   - Fields:
     - `email` (string): the admin's email
     - `addedAt` (timestamp): current time

### Step 6: Create Firestore Composite Indexes for New Collection Paths

After deploying the updated `firestore.indexes.json`, Firebase will create the indexes automatically. However, if you encounter "index required" errors during development, you can create them manually:

1. Go to **Firebase Console > Firestore > Indexes**
2. Click **Create index**
3. You'll need indexes for common query patterns in the new subcollections, such as:
   - Collection group: `reviews` (under `organizations/{orgId}/reviews`)
     - Fields: `merchantId` (Ascending) + `createdAt` (Descending)
     - Fields: `merchantId` (Ascending) + `serviceRating` (Ascending) + `createdAt` (Descending)
   - Collection group: `summaries` (under `organizations/{orgId}/summaries`)
     - Fields: as needed by existing query patterns

**Tip:** During development, Firestore will show error messages with a direct link to create the required index. Click those links for the fastest workflow.

### Step 7: Update Cloud Functions Environment Variables

Add the KMS key name to the Cloud Functions environment:

1. Go to **GitHub > Repository Settings > Secrets and variables > Actions**
2. Add or update:
   - `KMS_KEY_NAME` = `projects/feefo-reviews/locations/us-central1/keyRings/feefo-credentials/cryptoKeys/org-credentials`
3. Update `.github/workflows/firebase-deploy.yml` to write this into `functions/.env.feefo-reviews`:
   ```
   KMS_KEY_NAME=${{ secrets.KMS_KEY_NAME }}
   ```

### Step 8: Run the Data Migration (After Code Is Deployed)

This step happens AFTER the migration script from Phase 2 is written and deployed:

1. Ensure you have a **backup** of the current Firestore data:
   - Go to **Firebase Console > Firestore > Import/Export**
   - Click **Export** to a Cloud Storage bucket
   - Wait for the export to complete

2. Run the migration script in **dry-run mode** first:
   ```
   npx ts-node scripts/migrate-to-multi-tenant.ts --dry-run
   ```
   - Review the output to confirm it will migrate the expected documents

3. Run the migration for real:
   ```
   npx ts-node scripts/migrate-to-multi-tenant.ts
   ```

4. Verify the migration:
   - Check `organizations/uniworld-journeys` document exists in Firestore Console
   - Verify subcollections: `reviews`, `summaries`, `monthly_summaries`, `sync_meta`, `itinerary_mappings`, `users`
   - Compare document counts between old and new collections
   - Test the dashboard loads correctly with data from the new paths

5. **Do NOT delete the legacy top-level collections yet** — keep them for 30 days as a safety net

---

## Phase 3: Firebase Storage Rules

### Step 1: Set Up Firebase Storage Rules for Org-Scoped Uploads

1. Go to **Firebase Console > Storage**
2. If Storage isn't enabled yet, click **Get started** and choose a Cloud Storage location (use `us-central1` for consistency)
3. Go to the **Rules** tab
4. Replace the default rules with org-scoped rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Org-scoped assets (logos, etc.)
    match /organizations/{orgId}/assets/{fileName} {
      // Members can read assets; admins can upload
      allow read: if request.auth != null
        && firestore.exists(/databases/(default)/documents/organizations/$(orgId)/users/$(request.auth.uid));

      allow write: if request.auth != null
        && firestore.get(/databases/(default)/documents/organizations/$(orgId)/users/$(request.auth.uid)).data.role in ["admin", "owner"]
        && request.resource.size < 5 * 1024 * 1024  // 5MB max
        && request.resource.contentType.matches('image/.*');  // Images only
    }

    // Deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

5. Click **Publish**

### Step 2: Create the Storage Bucket Structure

No manual action needed — Firebase Storage creates paths on first upload. The code will write to `organizations/{orgId}/assets/logo` when an admin uploads a logo.

---

## Phase 4: Microsoft Entra ID & Auth Updates

### Step 1: Review Current Microsoft Entra ID App Registration

1. Go to [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Navigate to **Identity > Applications > App registrations**
3. Find the app registration used for the Feefo Reviews dashboard
4. Note the current configuration:
   - **Application (client) ID**
   - **Directory (tenant) ID** (currently: `c8e16ff7-b48e-48dc-8e88-56ca27c5c21c`)
   - **Redirect URIs**
   - **Supported account types**

### Step 2: Update Supported Account Types (If Needed)

The current app may be configured for **single tenant** (only users from one Azure AD directory). For multi-tenant SaaS:

1. In the app registration, go to **Authentication**
2. Under **Supported account types**, consider:
   - **Single tenant** (current): Only users from your Azure AD directory can sign in. Other organizations' users cannot.
   - **Multitenant**: Users from ANY Azure AD directory can sign in. This is needed if different Feefo customers use different Azure AD tenants.
   - **Multitenant + personal Microsoft accounts**: Broadest access.

3. **Decision point:**
   - If ALL your Feefo customers will use Microsoft 365 with their own Azure AD tenant, choose **Multitenant**
   - If some customers don't use Microsoft 365, you may need to add additional auth providers (Google, email/password) in Phase 4 code
   - For now, if all initial customers are Microsoft 365 users, **Multitenant** is the right choice

4. If changing to Multitenant:
   - Select **Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)**
   - Click **Save**

### Step 3: Update Redirect URIs

1. In the app registration, go to **Authentication**
2. Under **Platform configurations > Web > Redirect URIs**, add:
   - Your new Firebase App Hosting URL (e.g., `https://feefo-reviews-web--[hash].us-central1.hosted.app/__/auth/handler`)
   - Any custom domain you've configured (e.g., `https://reviews.feefo-platform.com/__/auth/handler`)
3. Keep the existing `https://feefo-reviews.web.app/__/auth/handler` during transition
4. Click **Save**

### Step 4: Update Firebase Auth Configuration

1. Go to **Firebase Console > Authentication > Sign-in method**
2. Verify **Microsoft** is enabled as a sign-in provider
3. If you changed to multitenant in Step 2:
   - The `AuthGate.tsx` code currently hardcodes the tenant ID: `c8e16ff7-b48e-48dc-8e88-56ca27c5c21c`
   - For multitenant, you may need to set the tenant to `common` or remove the tenant restriction entirely
   - This is a CODE change (in `AuthGate.tsx`), but note it here for awareness

### Step 5: Update CORS Configuration for Cloud Functions

1. After adding a new domain (Firebase App Hosting URL), update the allowed CORS origins:
   - In **GitHub > Repository Settings > Secrets**, update `CORS_ALLOWED_ORIGINS` to include the new domain
   - Format: comma-separated list of allowed origins
   - Example: `https://feefo-reviews.web.app,https://feefo-reviews-web--abc123.us-central1.hosted.app`

---

## Phase 5: Domain & DNS (Optional)

### Custom Domain Setup (If Needed Later)

If you want a custom domain like `reviews.feefo-platform.com`:

1. **Register/configure the domain** with your DNS provider
2. In **Firebase Console > App Hosting > Custom domains**:
   - Add the domain
   - Firebase will provide DNS records to add (typically a CNAME or A record)
3. Add the DNS records at your domain registrar:
   - Type: `CNAME`
   - Name: `reviews` (or whatever subdomain)
   - Value: (provided by Firebase)
4. Wait for DNS propagation (up to 48 hours)
5. Firebase will auto-provision an SSL certificate
6. Update the Microsoft Entra ID redirect URI to include the new domain (Step 3 above)
7. Update CORS origins for Cloud Functions

### Subdomain-Per-Tenant Setup (Future, NOT Recommended for Now)

If you ever need `uniworld.reviews.feefo-platform.com`:
- This requires wildcard DNS (`*.reviews.feefo-platform.com`)
- Firebase App Hosting does NOT natively support wildcard domains
- You'd need a reverse proxy (Cloudflare, Cloud Load Balancer) in front
- **Recommendation:** Defer this indefinitely. Path-based routing handles all use cases.

---

## Checklist Summary

### Phase 1.5 Checklist (Do Before Deploying Phase 1.5 Code)
- [ ] Enable Firebase App Hosting in Firebase Console
- [ ] Connect GitHub repository to App Hosting backend
- [ ] Set environment variables in App Hosting config
- [ ] Create `apphosting.yaml` in repo root
- [ ] Verify initial deployment succeeds
- [ ] Connect custom domain (if applicable)
- [ ] Update GitHub Actions to remove hosting deploy target
- [ ] Test: app loads at the new App Hosting URL
- [ ] Test: existing Cloud Functions still work

### Phase 2 Checklist (Do Before Deploying Phase 2 Code)
- [ ] Enable Cloud KMS API in Google Cloud Console
- [ ] Create KMS key ring: `feefo-credentials`
- [ ] Create KMS key: `org-credentials`
- [ ] Grant Cloud Functions service account the CryptoKey Encrypter/Decrypter role
- [ ] Add `KMS_KEY_NAME` to GitHub Secrets
- [ ] Create `platform/config` document in Firestore
- [ ] Create `platform/super_admins/{uid}` document for initial super-admin
- [ ] Export Firestore data as backup before migration
- [ ] Run migration script in dry-run mode
- [ ] Run migration script for real
- [ ] Verify migration: document counts, data integrity
- [ ] Test: dashboard loads with data from new collection paths
- [ ] Keep legacy collections for 30 days

### Phase 3 Checklist (Do Before Deploying Phase 3 Code)
- [ ] Enable Firebase Storage (if not already)
- [ ] Deploy Storage security rules (org-scoped)
- [ ] Test: admin can upload logo, viewer cannot
- [ ] Test: user from org A cannot read org B's assets

### Phase 4 Checklist (Do Before Deploying Phase 4 Code)
- [ ] Review Microsoft Entra ID app registration
- [ ] Decide: single-tenant vs multitenant auth
- [ ] Update supported account types if needed
- [ ] Add new redirect URIs for App Hosting domain
- [ ] Update CORS origins for Cloud Functions
- [ ] Test: SSO login works from new domain
- [ ] Test: users from different Azure AD tenants can sign in (if multitenant)

### Phase 5 Checklist (Optional)
- [ ] Configure custom domain in Firebase App Hosting
- [ ] Add DNS records at domain registrar
- [ ] Wait for DNS propagation and SSL provisioning
- [ ] Update Entra ID redirect URIs
- [ ] Update CORS origins

---

## Troubleshooting

### Firebase App Hosting Build Fails
- Check the build logs in Firebase Console > App Hosting > Builds
- Common issues:
  - `rootDirectory` not set correctly (should be `app` if Next.js is in a subdirectory)
  - Missing environment variables (check `apphosting.yaml`)
  - Node.js version mismatch (ensure `package.json` has an `engines.node` field matching the Cloud Run runtime)

### Cloud KMS Permission Denied
- Verify the service account has `roles/cloudkms.cryptoKeyEncrypterDecrypter`
- Verify the key ring location matches the Cloud Functions region
- Check the full key resource name is correct (no typos in project ID, location, key ring name, or key name)

### Firestore Security Rules Blocking Reads
- Use the **Firebase Console > Firestore > Rules playground** to test specific read/write scenarios
- Common issue: the `user_org_map` or `organizations/{orgId}/users/{uid}` document doesn't exist yet for a test user
- Check that the document ID matches the Firebase Auth UID exactly

### Microsoft SSO Redirect Loop
- Verify the redirect URI in Entra ID exactly matches the URL (including trailing slashes, `https://`, port)
- Clear browser cookies and try again
- Check Firebase Console > Authentication > Users to confirm the user record was created

### CORS Errors on Cloud Functions
- Verify `CORS_ALLOWED_ORIGINS` includes the exact origin (no trailing slash, correct protocol)
- Firebase App Hosting URL format: `https://feefo-reviews-web--[hash].[region].hosted.app`
- Restart the Cloud Functions emulator if testing locally
