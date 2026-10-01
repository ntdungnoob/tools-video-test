import json
import os
import re
import sys
import time
import threading
import zipfile
import subprocess
import unicodedata
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, unquote
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "output"
ASSETS_DIR = BASE_DIR / "assets"
UPLOADS_DIR = ASSETS_DIR / "uploads"
FONTS_DIR = ASSETS_DIR / "fonts"
PUBLIC_DIR = BASE_DIR / "web_app" / "public"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

# GPU acceleration via VAAPI (AMD/Intel GPU)
VAAPI_DEVICE = "/dev/dri/renderD128"

FONT_MAP = {
    "sans_bold": FONTS_DIR / "sans_bold.ttf",
    "sans_regular": FONTS_DIR / "sans_regular.ttf",
    "serif_bold": FONTS_DIR / "serif_bold.ttf",
    "serif_regular": FONTS_DIR / "serif_regular.ttf",
    "mono_bold": FONTS_DIR / "mono_bold.ttf"
}

def sanitize_filename(text):
    nfkd = unicodedata.normalize('NFKD', text)
    no_accents = ''.join([c for c in nfkd if not unicodedata.combining(c)])
    no_accents = no_accents.replace('đ', 'd').replace('Đ', 'D')
    clean = re.sub(r'[^a-zA-Z0-9_\-\s]', '', no_accents)
    clean = re.sub(r'\s+', '_', clean.strip().lower())
    return clean or "guest"

def hex_to_rgb(hex_str, alpha=255):
    hex_str = hex_str.lstrip('#')
    if len(hex_str) == 3:
        hex_str = ''.join([c*2 for c in hex_str])
    if len(hex_str) == 6:
        r = int(hex_str[0:2], 16)
        g = int(hex_str[2:4], 16)
        b = int(hex_str[4:6], 16)
        return (r, g, b, alpha)
    return (255, 255, 255, alpha)

def render_static_overlay(layers, width=720, height=1280):
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for layer in layers:
        # Skip dynamic layer (handled by FFmpeg per-name)
        if layer.get("is_dynamic", False):
            continue
        # Skip animated layers (handled by FFmpeg with entrance+exit effects)
        if layer.get("animation", "none") != "none":
            continue

        text = layer.get("text", "")
        if not text:
            continue

        if layer.get("uppercase", False):
            text = text.upper()

        font_key = layer.get("font_family", "sans_bold")
        font_file = FONT_MAP.get(font_key, FONTS_DIR / "sans_bold.ttf")
        font_size = int(layer.get("font_size", 24))

        try:
            font = ImageFont.truetype(str(font_file), font_size)
        except Exception:
            font = ImageFont.load_default()

        color_hex = layer.get("color", "#ffffff")
        fill_color = hex_to_rgb(color_hex, int(layer.get("opacity", 1.0) * 255))
        shadow_color = (0, 0, 0, int(0.7 * 255))

        align = layer.get("align", "center")
        y_pos = int(layer.get("y", 100))
        x_pos = int(layer.get("x", 0))

        lines = text.split("\n")
        cur_y = y_pos

        for line in lines:
            bbox = draw.textbbox((0, 0), line, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]

            if align == "center":
                x = (width - text_w) // 2 + x_pos
            elif align == "right":
                x = width - text_w - 60 + x_pos
            else:
                x = 60 + x_pos

            if layer.get("shadow", True):
                draw.text((x + 2, cur_y + 2), line, font=font, fill=shadow_color)
            draw.text((x, cur_y), line, font=font, fill=fill_color)
            cur_y += text_h + int(layer.get("line_spacing", 8))

    return img

def build_anim_filter(layer_info, text_tmp_path, duration):
    """Build FFmpeg drawtext filter for one animated layer.
    All animations have BOTH entrance (in) and exit (out) effects."""
    animation = layer_info["animation"]
    y_pos   = layer_info["y_pos"]
    x_expr  = layer_info["x_expr"]
    dur     = max(duration, 1)
    fade_in  = 1.2   # entrance: 1.2s
    fade_out = 1.0   # exit: 1.0s before end

    if animation == "slide_up":
        y_expr   = f"'if(lt(t,{fade_in}), {y_pos}+45*(1-t/{fade_in}), {y_pos})'"
        alpha_expr = f":alpha='if(lt(t,{fade_in}), t/{fade_in}, if(gt(t,{dur}-{fade_out}), ({dur}-t)/{fade_out}, 1))'"
    elif animation in ("fade", "fade_in_out"):
        y_expr   = f"{y_pos}"
        alpha_expr = f":alpha='if(lt(t,{fade_in}), t/{fade_in}, if(gt(t,{dur}-{fade_out}), ({dur}-t)/{fade_out}, 1))'"
    else:  # "none" – shouldn't reach here but safe fallback
        y_expr   = f"{y_pos}"
        alpha_expr = ""

    return (
        f"drawtext=fontfile='{layer_info['font_path']}':"
        f"textfile='{text_tmp_path}':"
        f"fontsize={layer_info['font_size']}:"
        f"fontcolor={layer_info['font_color']}:"
        f"shadowcolor=black@0.65:shadowx=2:shadowy=2:"
        f"x={x_expr}:y={y_expr}{alpha_expr}"
    )

def render_worker(args):
    idx, name, animated_layers, template_video, overlay_file, duration, temp_dir, use_gpu = args
    slug = sanitize_filename(name)
    out_filename = f"video_{slug}.mp4"
    out_file = OUTPUT_DIR / out_filename

    text_tmp_files = []
    drawtext_chain = []

    for li, layer_info in enumerate(animated_layers):
        text_tmp = temp_dir / f"web_txt_{idx}_{li}_{int(time.time()*1000) % 100000}.txt"
        with open(text_tmp, "w", encoding="utf-8") as tf:
            tf.write(layer_info["text"])
        text_tmp_files.append(text_tmp)

        dt = build_anim_filter(layer_info, str(text_tmp.resolve()), duration)
        drawtext_chain.append(dt)

    # Build chained software filter: [bg]dt1[t0];...[sw]
    # GPU mode: append format=nv12,hwupload to push frames onto GPU VRAM after all CPU filters
    if drawtext_chain:
        parts = ["[0:v][1:v]overlay=0:0[bg]"]
        for i, dt in enumerate(drawtext_chain):
            in_lbl  = "[bg]" if i == 0 else f"[t{i-1}]"
            is_last = i == len(drawtext_chain) - 1
            if is_last and use_gpu:
                out_lbl = "[sw]"  # intermediate – will hwupload next
            else:
                out_lbl = "[outv]" if is_last else f"[t{i}]"
            parts.append(f"{in_lbl}{dt}{out_lbl}")
        if use_gpu:
            parts.append("[sw]format=nv12,hwupload[outv]")
        filter_complex = ";".join(parts)
    else:
        if use_gpu:
            filter_complex = "[0:v][1:v]overlay=0:0[sw];[sw]format=nv12,hwupload[outv]"
        else:
            filter_complex = "[0:v][1:v]overlay=0:0[outv]"

    if use_gpu:
        # GPU mode: VAAPI hardware encode (AMD RX 480/570/580 via /dev/dri/renderD128)
        cmd = [
            "ffmpeg", "-y",
            "-vaapi_device", VAAPI_DEVICE,
            "-i", str(template_video),
            "-i", str(overlay_file),
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "0:a?"
        ]
    else:
        # CPU mode: libx264 ultrafast, 1 thread per worker
        cmd = [
            "ffmpeg", "-y",
            "-threads", "1",
            "-i", str(template_video),
            "-i", str(overlay_file),
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "0:a?"
        ]

    if duration > 0:
        cmd += ["-t", str(duration)]

    if use_gpu:
        cmd += [
            "-c:v", "h264_vaapi",
            "-qp", "26",      # GPU quality (0-51, lower = better, ~equiv CRF)
            "-c:a", "copy",
            str(out_file)
        ]
    else:
        cmd += [
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "26",
            "-c:a", "copy",
            str(out_file)
        ]

    t0 = time.time()
    if use_gpu:
        # Capture stderr for GPU mode to surface errors
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if res.returncode != 0:
            err_text = res.stderr.decode('utf-8', errors='replace')[-800:]
            print(f"  ❌ [GPU] Lỗi render '{name}': {err_text}")
    else:
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t_render = time.time() - t0

    for tmp in text_tmp_files:
        try:
            tmp.unlink()
        except Exception:
            pass

    display_text = animated_layers[0]["text"] if animated_layers else name
    return {
        "success": res.returncode == 0,
        "name": name,
        "display_text": display_text,
        "video_url": f"/output/{out_filename}",
        "filename": out_filename,
        "filepath": str(out_file),
        "render_time": round(t_render, 2)
    }


class VideoToolHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def serve_file(self, filepath, content_type):
        if not filepath.exists() or not filepath.is_file():
            self.send_error(404, "File Not Found")
            return
        
        file_size = filepath.stat().st_size
        range_header = self.headers.get('Range')

        if range_header:
            match = re.search(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else file_size - 1
                length = end - start + 1
                self.send_response(206)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                self.send_header('Content-Length', str(length))
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    f.seek(start)
                    self.wfile.write(f.read(length))
                return

        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(file_size))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        with open(filepath, 'rb') as f:
            while chunk := f.read(65536):
                self.wfile.write(chunk)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path in ["/", "/index.html"]:
            self.serve_file(PUBLIC_DIR / "index.html", "text/html; charset=utf-8")
        elif path == "/style.css":
            self.serve_file(PUBLIC_DIR / "style.css", "text/css; charset=utf-8")
        elif path == "/app.js":
            self.serve_file(PUBLIC_DIR / "app.js", "application/javascript; charset=utf-8")
        elif path.startswith("/assets/"):
            rel_path = path[len("/assets/"):]
            target = ASSETS_DIR / rel_path
            content_type = "video/mp4" if target.suffix == ".mp4" else "image/png"
            if target.suffix in [".jpg", ".jpeg"]:
                content_type = "image/jpeg"
            self.serve_file(target, content_type)
        elif path.startswith("/output/"):
            rel_path = path[len("/output/"):]
            target = OUTPUT_DIR / rel_path
            content_type = "video/mp4" if target.suffix == ".mp4" else "image/png"
            self.serve_file(target, content_type)
        elif path == "/api/download-zip":
            zip_path = OUTPUT_DIR / "all_videos.zip"
            if not zip_path.exists():
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED) as zipf:
                    for f in OUTPUT_DIR.glob("video_*.mp4"):
                        zipf.write(f, arcname=f.name)
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', 'attachment; filename="all_personalized_videos.zip"')
            self.send_header('Content-Length', str(zip_path.stat().st_size))
            self.end_headers()
            with open(zip_path, 'rb') as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)

            # Auto-cleanup: xóa video tạm sau khi ZIP đã gửi xong (chạy ngầm, không block)
            def _auto_cleanup():
                import time as _time
                _time.sleep(3)  # Đợi trình duyệt nhận xong file ZIP
                deleted = 0
                for mp4 in OUTPUT_DIR.glob("video_*.mp4"):
                    try: mp4.unlink(); deleted += 1
                    except Exception: pass
                for png in OUTPUT_DIR.glob("*.png"):
                    try: png.unlink()
                    except Exception: pass
                # Giữ lại file ZIP để user có thể tải lại lần 2 nếu cần
                print(f"🧹 [Auto-Cleanup] Đã xóa {deleted} video tạm sau khi ZIP được tải xuống.")

            threading.Thread(target=_auto_cleanup, daemon=True).start()
        else:
            self.send_error(404, "Not Found")


    def do_POST(self):
        parsed = urlparse(self.path)

        # Cleanup temporary files endpoint
        if parsed.path == "/api/cleanup":
            deleted_count = 0
            for f in OUTPUT_DIR.glob("video_*.mp4"):
                try: f.unlink(); deleted_count += 1
                except Exception: pass
            for f in OUTPUT_DIR.glob("preview_*.png"):
                try: f.unlink()
                except Exception: pass
            for f in OUTPUT_DIR.glob("*.zip"):
                try: f.unlink()
                except Exception: pass

            res_bytes = json.dumps({"success": True, "deleted": deleted_count}).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)
            return

        # Upload custom background video
        if parsed.path == "/api/upload-video":
            content_length = int(self.headers.get('Content-Length', 0))
            file_data = self.rfile.read(content_length)
            filename = f"user_bg_{int(time.time())}.mp4"
            dest_path = UPLOADS_DIR / filename
            with open(dest_path, "wb") as f:
                f.write(file_data)
            
            resp = {
                "success": True,
                "url": f"/assets/uploads/{filename}",
                "path": str(dest_path)
            }
            res_bytes = json.dumps(resp).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)
            return

        # Render Batch Multi-threaded
        if parsed.path in ["/api/render", "/api/render-advanced"]:
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
            except Exception:
                self.send_error(400, "Invalid JSON")
                return

            layers = data.get("layers", [])
            names = data.get("names", [])
            video_url = data.get("video_url", "/assets/gemini_generated_video_9e6c76b5.mp4")
            duration = int(data.get("duration", 10))
            use_gpu  = bool(data.get("use_gpu", False))

            if video_url.startswith("/assets/"):
                template_video = ASSETS_DIR / video_url[len("/assets/"):]
            else:
                template_video = ASSETS_DIR / "gemini_generated_video_9e6c76b5.mp4"

            if not template_video.exists():
                template_video = ASSETS_DIR / "gemini_generated_video_9e6c76b5.mp4"

            # Render static overlay
            static_overlay_img = render_static_overlay(layers, width=720, height=1280)
            temp_dir = BASE_DIR / "scratch_temp"
            temp_dir.mkdir(parents=True, exist_ok=True)
            overlay_file = temp_dir / f"overlay_web_{int(time.time()*1000)}.png"
            static_overlay_img.save(overlay_file)


            # ── Collect ALL animated layers (is_dynamic OR animation != "none") ──
            # These are rendered via FFmpeg drawtext per video.
            # Layers with animation="none" and NOT dynamic → drawn in Pillow PNG (already done above).
            animated_layers_base = []
            has_dynamic = any(l.get("is_dynamic", False) for l in layers)

            # If no dynamic layer defined, inject a default one
            if not has_dynamic:
                layers.append({
                    "text": "DEAR {NAME}",
                    "y": 170, "x": 0,
                    "align": "center",
                    "font_size": 38, "font_family": "sans_bold",
                    "color": "#ffffff", "animation": "slide_up",
                    "is_dynamic": True, "uppercase": True, "shadow": True
                })

            for layer in layers:
                is_dynamic = layer.get("is_dynamic", False)
                animation  = layer.get("animation", "none")
                # Only include in FFmpeg pipeline if dynamic OR has animation
                if not is_dynamic and animation == "none":
                    continue

                alignment = layer.get("align", "center")
                x_offset  = int(layer.get("x", 0))
                if alignment == "center":
                    x_expr = f"(w-text_w)/2+{x_offset}"
                elif alignment == "left":
                    x_expr = f"60+{x_offset}"
                elif alignment == "right":
                    x_expr = f"w-text_w-60+{x_offset}"
                else:
                    x_expr = f"(w-text_w)/2+{x_offset}"

                font_key = layer.get("font_family", "sans_bold")
                animated_layers_base.append({
                    "font_path":    str(FONT_MAP.get(font_key, FONTS_DIR / "sans_bold.ttf")),
                    "font_size":    int(layer.get("font_size", 24)),
                    "font_color":   layer.get("color", "white"),
                    "x_expr":       x_expr,
                    "y_pos":        int(layer.get("y", 100)),
                    "animation":    animation if animation != "none" else "fade",
                    "is_dynamic":   is_dynamic,
                    "is_uppercase": layer.get("uppercase", False),
                    "template_text": layer.get("text", ""),
                })

            tasks_args = []
            for idx, raw_name in enumerate(names, start=1):
                clean_name = raw_name.strip()
                if not clean_name:
                    continue

                # Resolve final text for each layer for this specific name
                resolved_layers = []
                for base in animated_layers_base:
                    text = base["template_text"]
                    if base["is_dynamic"] and "{NAME}" in text:
                        display_name = clean_name.upper() if base["is_uppercase"] else clean_name
                        text = text.replace("{NAME}", display_name)
                    elif base["is_uppercase"]:
                        text = text.upper()
                    resolved_layers.append({**base, "text": text})

                tasks_args.append((
                    idx, clean_name, resolved_layers,
                    template_video, overlay_file, duration, temp_dir, use_gpu
                ))


            # SYNCHRONOUS CHUNKED BATCH EXECUTION (Default: 8 videos/batch, customizable)
            batch_size = int(data.get("batch_size", 8))
            if batch_size <= 0:
                batch_size = 8

            total_tasks = len(tasks_args)
            total_batches = (total_tasks + batch_size - 1) // batch_size
            mode_label = "GPU (VAAPI h264_vaapi)" if use_gpu else "CPU (libx264 ultrafast)"
            print(f"\n🎬 [RENDER BATCH | {mode_label}] Bắt đầu render {total_tasks} video | {total_batches} đợt ({batch_size} video/đợt)...")

            t_batch_start = time.time()
            results = []

            for b_idx in range(0, total_tasks, batch_size):
                chunk = tasks_args[b_idx:b_idx + batch_size]
                cur_batch_num = (b_idx // batch_size) + 1
                t_chunk_start = time.time()

                with ThreadPoolExecutor(max_workers=len(chunk)) as executor:
                    chunk_futures = [executor.submit(render_worker, arg) for arg in chunk]
                    for fut in as_completed(chunk_futures):
                        res = fut.result()
                        if res["success"]:
                            results.append(res)

                t_chunk_spent = time.time() - t_chunk_start
                avg_speed = t_chunk_spent / max(1, len(chunk))
                print(f"  ⚡ [Đợt {cur_batch_num:02d}/{total_batches}] Hoàn tất {len(results):3d}/{total_tasks} video trong {t_chunk_spent:4.2f}s (tốc độ: {avg_speed:.2f}s/video)")

            t_batch_total = time.time() - t_batch_start
            print(f"🎉 [HOÀN TẤT] Render thành công {len(results)}/{total_tasks} video trong {t_batch_total:.2f}s! Đang đóng gói ZIP...")

            # Generate ONLY 1 single preview image from the 1st video (saves 200 ffmpeg calls!)
            single_preview_url = ""
            if results:
                preview_file = OUTPUT_DIR / "sample_preview.png"
                first_out_file = results[0]["filepath"]
                preview_cmd = [
                    "ffmpeg", "-y", "-ss", "00:00:02",
                    "-i", str(first_out_file), "-vframes", "1",
                    str(preview_file)
                ]
                subprocess.run(preview_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                single_preview_url = "/output/sample_preview.png"

            # Pre-package ZIP with ZIP_STORED (takes 0.5s instead of 2 minutes!)
            zip_path = OUTPUT_DIR / "all_videos.zip"
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_STORED) as zipf:
                for item in results:
                    fpath = Path(item["filepath"])
                    if fpath.exists():
                        zipf.write(fpath, arcname=fpath.name)

            try:
                overlay_file.unlink()
            except Exception:
                pass

            response_data = {
                "success": True,
                "count": len(results),
                "total_time": round(t_batch_total, 2),
                "avg_time": round(t_batch_total / max(1, len(results)), 2),
                "sample_preview_url": single_preview_url,
                "zip_size_mb": round(zip_path.stat().st_size / (1024*1024), 1) if zip_path.exists() else 0,
                "items": results
            }
            res_bytes = json.dumps(response_data, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)
        else:
            self.send_error(404, "Not Found")

def run(port=8080):
    server_address = ('', port)
    # Use ThreadingHTTPServer for high concurrency
    httpd = ThreadingHTTPServer(server_address, VideoToolHandler)
    print(f"🚀 High-Performance Threaded Studio Server running at: http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run(port)
