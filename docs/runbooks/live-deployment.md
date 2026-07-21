# Live Devnet Deployment Runbook

Status: executed and verified for the isolated REIN Devnet environment on 2026-07-21.

## Risk and rollback

Live deployment creates a public endpoint, stores run data in Firestore, invokes
billable Vertex/Cloud Run APIs, and signs transfers with test assets. Never use a
mainnet wallet or a key that has held real value. Roll back by routing traffic to
the prior Cloud Run revision, then disable or destroy the isolated Devnet key.

## 1. Create the narrow GCP identity

Run these commands only in the intended project and review every project ID:

```powershell
gcloud config set project YOUR_PROJECT_ID
gcloud services enable `
  aiplatform.googleapis.com `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  firestore.googleapis.com `
  run.googleapis.com `
  secretmanager.googleapis.com

gcloud iam service-accounts create rein-run `
  --display-name="REIN Cloud Run"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID `
  --member="serviceAccount:rein-run@YOUR_PROJECT_ID.iam.gserviceaccount.com" `
  --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID `
  --member="serviceAccount:rein-run@YOUR_PROJECT_ID.iam.gserviceaccount.com" `
  --role="roles/datastore.user"
```

Create Native-mode Firestore in a nearby supported region. Deploy the included
deny-all client rules if Firebase tooling is used; server Admin SDK access uses IAM.

## 2. Create an isolated Devnet wallet

1. Generate a new buyer wallet and a separate receiver address dedicated to
   REIN Devnet. `SVM_PAY_TO` is the receiver; the secret is the buyer.
2. Put only the buyer private key in Secret Manager as `rein-svm-private-key`.
3. Grant only the runtime identity access:

   ```powershell
   gcloud secrets add-iam-policy-binding rein-svm-private-key `
     --member="serviceAccount:rein-run@YOUR_PROJECT_ID.iam.gserviceaccount.com" `
     --role="roles/secretmanager.secretAccessor"
   ```

4. Fund the buyer and receiver with test USDC from
   <https://faucet.circle.com/?allow=true>. Funding the receiver creates the
   destination Associated Token Account required by the current x402 SVM client.
   The facilitator is the transaction fee payer, so the x402 path does not need
   buyer SOL. Only the direct-transfer fallback needs Devnet SOL from
   <https://faucet.solana.com/>.
5. Confirm the asset mint is exactly
   `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` before continuing.

Do not paste the key into a shell command, `.env` committed to Git, screenshot,
prompt, issue, CI log, or demo recording.

## 3. Configure budget notifications

Replace the billing account ID and use that account's billing currency. The
verified KRW project uses one monthly ₩35,000 budget with 20%, 40%, and 100%
thresholds (₩7,000/₩14,000/₩35,000).

```powershell
gcloud billing budgets create `
  --billing-account=YOUR_BILLING_ACCOUNT_ID `
  --display-name="REIN Devnet guardrail" `
  --budget-amount=35000KRW `
  --threshold-rule=percent=0.2 `
  --threshold-rule=percent=0.4 `
  --threshold-rule=percent=1.0
```

Cloud Billing budgets alert; they do not automatically stop services. The Cloud
Run instance cap and REIN daily atomic quota are the actual bounded controls.
Because the endpoint is public and has no user login, an unknown visitor can consume
the small test-asset quota. Disable live traffic or the secret when public access is
no longer needed, and never fund the wallet with real assets.

## 4. Preview, execute, verify

```powershell
# Read-only preview; no gcloud command is invoked.
.\scripts\deploy-cloud-run.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -PayTo YOUR_DEVNET_RECEIVER

# External write. Run only after reviewing IAM, secret, wallet, and project.
.\scripts\deploy-cloud-run.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -PayTo YOUR_DEVNET_RECEIVER `
  -Execute
```

The script prints the service URL and latest ready revision. Do not claim the
deployment succeeded until `/api/health`, catalog, Vertex response, two x402
settlements, Firestore records, and Explorer receipts pass the live smoke runbook.

## Rollback

```powershell
gcloud run revisions list --service=rein --region=asia-northeast3
gcloud run services update-traffic rein `
  --region=asia-northeast3 `
  --to-revisions=PREVIOUS_REVISION=100
```

After an unexpected signing event, stop traffic first, disable the secret
version, preserve payment records for reconciliation, and do not retry the run.
