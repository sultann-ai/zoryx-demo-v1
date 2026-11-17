// Side-effect import for tests that need the real DATABASE_URL: ES imports are evaluated in
// order, so importing this first loads .env before the Prisma client is constructed.
import dotenv from "dotenv";

dotenv.config();
