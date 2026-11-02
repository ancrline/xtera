import { hashPassword } from "./password.js";

const password = process.argv[2];

if (!password) {
  console.error("Usage: npm run hash -- \"YourPasswordHere\"");
  process.exit(1);
}

console.log(hashPassword(password));
