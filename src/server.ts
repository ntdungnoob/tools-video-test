import { join, resolve } from "path";
import { existsSync, mkdirSync } from "fs";
import { renderSingleVideo } from "./ffmpeg";
import { createStoredZip, cleanupTemporaryFiles } from "./utils";
import type { RenderPayload, RenderResultItem, RenderResponse } from "./types";

// Static imports để nhúng trực tiếp giao diện vào file executable khi biên dịch qua bun build --compile
import embeddedIndexHtml from "../web_app/public/index.html" with { type: "text" };
import embeddedAppJs from "../web_app/public/app.js" with { type: "text" };
import embeddedStyleCss from "../web_app/public/style.css" with { type: "text" };

const ROOT_DIR = process.cwd();
const OUTPUT_DIR = join(ROOT_DIR, "output");
const ASSETS_DIR = join(ROOT_DIR, "assets");
const UPLOADS_DIR = join(ASSETS_DIR, "uploads");
const SCRATCH_DIR = join(ROOT_DIR, "scratch_temp");
const CONFIG_PATH = join(ROOT_DIR, "config.json");

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(UPLOADS_DIR, { recursive: true });
mkdirSync(SCRATCH_DIR, { recursive: true });

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

const server = Bun.serve({
  port: Number(process.env.PORT) || 8080,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ── Static Web UI ──────────────────────────────────────
    if (pathname === "/" || pathname === "/index.html") {
      const diskFile = Bun.file(join(ROOT_DIR, "web_app/public/index.html"));
      if (await diskFile.exists()) return new Response(diskFile, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      return new Response(embeddedIndexHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (pathname === "/style.css") {
      const diskFile = Bun.file(join(ROOT_DIR, "web_app/public/style.css"));
      if (await diskFile.exists()) return new Response(diskFile, { headers: { "Content-Type": "text/css; charset=utf-8" } });
      return new Response(embeddedStyleCss, { headers: { "Content-Type": "text/css; charset=utf-8" } });
    }

    if (pathname === "/app.js") {
      const diskFile = Bun.file(join(ROOT_DIR, "web_app/public/app.js"));
      if (await diskFile.exists()) return new Response(diskFile, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
      return new Response(embeddedAppJs, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    }

    // ── Serve Assets & Output (Native HTTP Range & Streaming) ─
    if (pathname.startsWith("/assets/")) {
      const relPath = pathname.slice("/assets/".length);
      const filePath = join(ASSETS_DIR, relPath);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, { headers: CORS_HEADERS });
      }
      return new Response("Not Found", { status: 404 });
    }

    if (pathname.startsWith("/output/")) {
      const relPath = pathname.slice("/output/".length);
      const filePath = join(OUTPUT_DIR, relPath);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, { headers: CORS_HEADERS });
      }
      return new Response("Not Found", { status: 404 });
    }

    // ── GET /api/config ────────────────────────────────────
    if (pathname === "/api/config" && req.method === "GET") {
      const configFile = Bun.file(CONFIG_PATH);
      if (await configFile.exists()) {
        return new Response(configFile, { headers: CORS_HEADERS });
      }
      return jsonResponse({ layers: [] });
    }

    // ── POST /api/save-config ──────────────────────────────
    if (pathname === "/api/save-config" && req.method === "POST") {
      try {
        const body = await req.json();
        await Bun.write(CONFIG_PATH, JSON.stringify(body, null, 2));
        return jsonResponse({ success: true });
      } catch (err) {
        return jsonResponse({ success: false, error: String(err) }, 400);
      }
    }

    // ── POST /api/cleanup ──────────────────────────────────
    if (pathname === "/api/cleanup" && req.method === "POST") {
      const deleted = await cleanupTemporaryFiles(OUTPUT_DIR, SCRATCH_DIR, UPLOADS_DIR);
      // Xóa thêm zip nếu có
      const zipFile = Bun.file(join(OUTPUT_DIR, "all_videos.zip"));
      if (await zipFile.exists()) {
        const { unlink } = await import("fs/promises");
        await unlink(join(OUTPUT_DIR, "all_videos.zip")).catch(() => {});
      }
      return jsonResponse({ success: true, deleted });
    }

    // ── POST /api/upload-video ─────────────────────────────
    if (pathname === "/api/upload-video" && req.method === "POST") {
      const fileData = await req.arrayBuffer();
      const filename = `user_bg_${Date.now()}.mp4`;
      const destPath = join(UPLOADS_DIR, filename);
      await Bun.write(destPath, fileData);
      return jsonResponse({
        success: true,
        url: `/assets/uploads/${filename}`,
        path: destPath,
      });
    }

    // ── GET /api/download-zip ──────────────────────────────
    if (pathname === "/api/download-zip" && req.method === "GET") {
      const zipPath = join(OUTPUT_DIR, "all_videos.zip");
      const zipFile = Bun.file(zipPath);

      if (!(await zipFile.exists())) {
        return new Response("ZIP file not found", { status: 404 });
      }

      // Auto-cleanup chạy ngầm sau 3 giây khi bắt đầu tải
      setTimeout(async () => {
        const deleted = await cleanupTemporaryFiles(OUTPUT_DIR, SCRATCH_DIR, UPLOADS_DIR);
        console.log(`🧹 [Bun Auto-Cleanup] Đã dọn dẹp ${deleted} video tạm sau khi ZIP được tải.`);
      }, 3000);

      return new Response(zipFile, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/zip",
          "Content-Disposition": 'attachment; filename="all_personalized_videos.zip"',
        },
      });
    }

    // ── POST /api/render & /api/render-advanced ─────────────
    if ((pathname === "/api/render" || pathname === "/api/render-advanced") && req.method === "POST") {
      let payload: RenderPayload;
      try {
        payload = await req.json();
      } catch {
        return jsonResponse({ success: false, error: "Invalid JSON" }, 400);
      }

      const layers = payload.layers || [];
      const names = (payload.names || []).map((n) => n.trim()).filter(Boolean);
      const duration = Number(payload.duration) || 10;
      const useGpu = Boolean(payload.use_gpu);
      let batchSize = Number(payload.batch_size) || 8;
      if (batchSize <= 0) batchSize = 8;

      let templateVideo = join(ASSETS_DIR, "gemini_generated_video_9e6c76b5.mp4");
      if (payload.video_url && payload.video_url.startsWith("/assets/")) {
        const customPath = join(ASSETS_DIR, payload.video_url.slice("/assets/".length));
        if (existsSync(customPath)) {
          templateVideo = customPath;
        }
      }

      const totalTasks = names.length;
      const totalBatches = Math.ceil(totalTasks / batchSize);
      const modeLabel = useGpu ? "GPU (VAAPI h264_vaapi)" : "CPU (libx264 ultrafast)";

      console.log(`\n🎬 [BUN RENDER BATCH | ${modeLabel}] Bắt đầu render ${totalTasks} video | ${totalBatches} đợt (${batchSize} video/đợt)...`);

      const tStart = performance.now();
      const results: RenderResultItem[] = [];

      // Chunked execution
      for (let bIdx = 0; bIdx < totalTasks; bIdx += batchSize) {
        const chunkNames = names.slice(bIdx, bIdx + batchSize);
        const curBatchNum = Math.floor(bIdx / batchSize) + 1;
        const tChunkStart = performance.now();

        const chunkPromises = chunkNames.map((name, i) =>
          renderSingleVideo({
            idx: bIdx + i + 1,
            name,
            layers,
            templateVideo,
            duration,
            outputDir: OUTPUT_DIR,
            scratchDir: SCRATCH_DIR,
            useGpu,
          })
        );

        const chunkResults = await Promise.all(chunkPromises);
        for (const res of chunkResults) {
          if (res.success) results.push(res);
        }

        const tChunkSpent = (performance.now() - tChunkStart) / 1000;
        const avgSpeed = tChunkSpent / Math.max(1, chunkNames.length);
        console.log(`  ⚡ [Đợt ${String(curBatchNum).padStart(2, "0")}/${totalBatches}] Hoàn tất ${results.length}/${totalTasks} video trong ${tChunkSpent.toFixed(2)}s (tốc độ: ${avgSpeed.toFixed(2)}s/video)`);
      }

      const totalTime = (performance.now() - tStart) / 1000;
      console.log(`🎉 [BUN HOÀN TẤT] Render thành công ${results.length}/${totalTasks} video trong ${totalTime.toFixed(2)}s! Đang tạo file ZIP...`);

      // 1. Tạo 1 ảnh preview mẫu từ video đầu tiên
      let samplePreviewUrl = "";
      if (results.length > 0) {
        const previewFile = join(OUTPUT_DIR, "sample_preview.png");
        const firstOutFile = results[0].filepath;
        const previewCmd = ["ffmpeg", "-y", "-ss", "00:00:02", "-i", firstOutFile, "-vframes", "1", previewFile];
        const previewProc = Bun.spawn(previewCmd, { stdout: "ignore", stderr: "ignore" });
        await previewProc.exited;
        samplePreviewUrl = "/output/sample_preview.png";
      }

      // 2. Đóng gói ZIP siêu tốc bằng Store method (~0.3s)
      const zipPath = join(OUTPUT_DIR, "all_videos.zip");
      const filesToZip = results.map((r) => ({ path: r.filepath, name: r.filename }));
      const zipBytes = await createStoredZip(filesToZip, zipPath);
      const zipSizeMb = Math.round((zipBytes / (1024 * 1024)) * 10) / 10;

      const responseData: RenderResponse = {
        success: true,
        count: results.length,
        total_time: Math.round(totalTime * 100) / 100,
        avg_time: Math.round((totalTime / Math.max(1, results.length)) * 100) / 100,
        sample_preview_url: samplePreviewUrl,
        zip_size_mb: zipSizeMb,
        items: results,
      };

      return jsonResponse(responseData);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 [Bun Studio Engine] Server đang chạy tại: http://localhost:${server.port}`);
