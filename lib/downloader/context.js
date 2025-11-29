
import axios from "axios";
import { DEFAULT_TIMEOUT_MS, DEFAULT_USER_AGENT } from "./utils.js";

export function create_context(options = {}) {
  const http = axios.create({
    timeout: (options?.timeout || DEFAULT_TIMEOUT_MS),
    headers: {
      "User-Agent": DEFAULT_USER_AGENT,
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  http.interceptors.response.use(
    (r) => r,
    (err) => {
      return Promise.reject(err);
    }
  );

  return { http, options };
}
