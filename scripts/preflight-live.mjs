import { base58 } from "@scure/base";

const required = [
  "GOOGLE_CLOUD_PROJECT",
  "APP_BASE_URL",
  "SVM_PRIVATE_KEY",
  "SVM_PAY_TO",
  "X402_FACILITATOR_URL",
];

const failures = [];
for (const name of required) {
  if (!process.env[name]?.trim()) failures.push(`${name} is required`);
}
if (process.env.PROOFBUY_MODE !== "live") {
  failures.push("PROOFBUY_MODE must be live");
}
if (process.env.PROOFBUY_STORAGE !== "firestore") {
  failures.push("PROOFBUY_STORAGE must be firestore");
}
if (process.env.SVM_PAY_TO && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(process.env.SVM_PAY_TO)) {
  failures.push("SVM_PAY_TO must look like a base58 Solana address");
}
if (process.env.SVM_PRIVATE_KEY) {
  try {
    const keyBytes = base58.decode(process.env.SVM_PRIVATE_KEY.trim());
    if (keyBytes.length !== 64) {
      failures.push("SVM_PRIVATE_KEY must decode to a 64-byte Solana secret key");
    }
  } catch {
    failures.push("SVM_PRIVATE_KEY must be valid base58");
  }
}
if (process.env.X402_FACILITATOR_URL) {
  try {
    const facilitator = new URL(process.env.X402_FACILITATOR_URL);
    if (facilitator.protocol !== "https:") {
      failures.push("X402_FACILITATOR_URL must use HTTPS");
    }
  } catch {
    failures.push("X402_FACILITATOR_URL must be a valid URL");
  }
}
if (process.env.APP_BASE_URL) {
  try {
    const app = new URL(process.env.APP_BASE_URL);
    if (app.protocol !== "https:") failures.push("APP_BASE_URL must use HTTPS");
  } catch {
    failures.push("APP_BASE_URL must be a valid URL");
  }
}

if (failures.length > 0) {
  console.error("REIN live preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("REIN live preflight passed without printing secret values.");
}
