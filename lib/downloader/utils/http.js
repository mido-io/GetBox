import axios from "axios";
import { DEFAULT_TIMEOUT_MS, DEFAULT_USER_AGENT } from "../utils.js";

export async function open_stream(url, headers = {}) {
    const response = await axios({
        method: "get",
        url,
        headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            ...headers,
        },
        responseType: "stream",
        timeout: DEFAULT_TIMEOUT_MS,
    });
    return response.data;
}

export async function get_html(url, headers = {}) {
    const response = await axios({
        method: "get",
        url,
        headers: {
            "User-Agent": DEFAULT_USER_AGENT,
            ...headers,
        },
        timeout: DEFAULT_TIMEOUT_MS,
    });
    return response.data;
}
