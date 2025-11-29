import path from "path";
import fs from "fs";
import process from "process";
import ffmpegStatic from "ffmpeg-static";
import ytDlp from "yt-dlp-exec";

export function getFfmpegPath() {
    // 1. Try environment variable
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }

    // 2. Try ffmpeg-static default
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
        return ffmpegStatic;
    }

    // 3. Try local node_modules (common in some deployments)
    const isWin = process.platform === "win32";
    const binName = isWin ? "ffmpeg.exe" : "ffmpeg";
    const localPath = path.join(process.cwd(), "node_modules", "ffmpeg-static", binName);
    if (fs.existsSync(localPath)) return localPath;

    // 4. Fallback to system PATH
    return binName;
}

export function getYtDlpPath() {
    // 1. Try environment variable
    if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
        return process.env.YTDLP_PATH;
    }

    const isWin = process.platform === "win32";
    const binName = isWin ? "yt-dlp.exe" : "yt-dlp";

    // 2. Try local node_modules (yt-dlp-exec wrapper)
    // yt-dlp-exec usually puts binary in node_modules/yt-dlp-exec/bin/yt-dlp
    const localPath = path.join(process.cwd(), "node_modules", "yt-dlp-exec", "bin", binName);
    if (fs.existsSync(localPath)) return localPath;

    // 3. Fallback to system PATH
    return binName;
}
