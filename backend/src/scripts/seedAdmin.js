import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../startup/connectDb.js';
import { seedAdmin } from '../startup/seedAdmin.js';

await connectDb();
await seedAdmin();
// eslint-disable-next-line no-console
console.log('Admin seed finished (created only if missing).');
await mongoose.disconnect();
process.exit(0);
