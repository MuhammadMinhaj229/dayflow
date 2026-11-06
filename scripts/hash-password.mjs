import bcrypt from "bcryptjs";

const password = process.env.DAYFLOW_PASSWORD_TO_HASH;
if (!password || password.length < 14) {
  console.error("Set DAYFLOW_PASSWORD_TO_HASH to a password of at least 14 characters, then rerun this script.");
  process.exit(1);
}
const hash = await bcrypt.hash(password, 12);
console.log("DAYFLOW_ADMIN_PASSWORD_HASH (store only in Vercel env vars):\n" + hash);
