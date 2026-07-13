import mongoose, { ClientSession } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sexus_rmg';

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 100,             // Allows up to 100 parallel database connections per server instance
      minPoolSize: 10,              // Keeps 10 connections always warmed up
      socketTimeoutMS: 45000,       // Closes stagnant sockets after 45 seconds
      retryWrites: true,
      w: 'majority'                 // Guarantees transaction validation across Atlas cluster replica sets
    });
    console.log("Production MongoDB Pool Initialized Successfully.");
  } catch (error) {
    console.error("Database connection failure:", error);
    process.exit(1);
  }
};

/**
 * Runs a set of operations in a strict Mongoose/MongoDB Client Session Transaction.
 * Automatically handles transaction creation, committing, and aborting on error.
 */
export const runInTransaction = async <T>(
  operations: (session: ClientSession) => Promise<T>
): Promise<T> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const result = await operations(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    console.error('Transaction aborted due to error:', error);
    throw error;
  } finally {
    session.endSession();
  }
};
