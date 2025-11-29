
import { v4 as uuidv4 } from "uuid";

const CACHE = new Map();
const TTL_MS = 1000 * 60 * 60; // 1 hour
const MAX_ENTRIES = 2000;

export function setDownloadData(data) {
  const id = uuidv4();
  CACHE.set(id, {
    ...data,
    timestamp: Date.now()
  });

  // Cleanup old entries
  if (CACHE.size > MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, val] of CACHE.entries()) {
      if (now - val.timestamp > TTL_MS) CACHE.delete(key);
    }
  }

  return id;
}

export function getDownloadData(id) {
  const data = CACHE.get(id);
  if (!data) return null;
  // TTL check
  if (Date.now() - data.timestamp > TTL_MS) {
    CACHE.delete(id);
    return null;
  }
  // Return all stored fields
  return { ...data };
}

export function deleteDownloadData(id) {
  return CACHE.delete(id);
}
