// MongoDB connection manager with resilient connection handling
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME ?? "cinema";

declare global {
  var _mongoClientPromise: Promise<MongoClient | null> | undefined;
  var _mongoLastFailureTime: number | undefined;
}

let client: MongoClient | null = null;

if (uri) {
  client = new MongoClient(uri, {
    // Fail fast if Atlas IP allowlist blocks the host or network is down
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 2000,
  });
}

/**
 * Connects to MongoDB with error resilience.
 * Returns null if MongoDB is unreachable (e.g., Atlas IP allowlist block).
 */
export async function getMongoClient(): Promise<MongoClient | null> {
  if (!client) {
    return null;
  }

  // If connection recently failed, cool down for 30s to avoid blocking requests
  if (global._mongoLastFailureTime && performance.now() - global._mongoLastFailureTime < 30000) {
    return null;
  }

  if (global._mongoClientPromise) {
    return global._mongoClientPromise;
  }

  const connectPromise = client
    .connect()
    .then((c) => {
      global._mongoLastFailureTime = undefined;
      return c;
    })
    .catch((err) => {
      console.warn(
        `[MongoDB] Warning: Could not connect to MongoDB (${(err as Error).message}). Falling back to in-memory store for high reliability.`
      );
      global._mongoLastFailureTime = performance.now();
      global._mongoClientPromise = undefined;
      return null;
    });

  if (process.env.NODE_ENV === "development") {
    global._mongoClientPromise = connectPromise;
  }

  return connectPromise;
}

/**
 * Returns the MongoDB database instance if connected, or null otherwise.
 */
export async function getDb(): Promise<Db | null> {
  try {
    const connectedClient = await getMongoClient();
    if (!connectedClient) {
      return null;
    }
    return connectedClient.db(dbName);
  } catch (error) {
    console.warn("[MongoDB] Failed to acquire database handle:", error);
    return null;
  }
}
