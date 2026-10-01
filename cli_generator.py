import json
import os
import re
import sys
import time
import zipfile
import subprocess
import unicodedata
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = Path(__file__).resolve().parent
FONTS_DIR = BASE_DIR / "assets" / "fonts"

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
        if layer.get("is_dynamic", False):
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

def render_single_video(item_info):
    idx = item_info["idx"]
    name = item_info["name"]
    template_pattern = item_info["template_pattern"]
    is_uppercase = item_info["is_uppercase"]
    temp_dir = item_info["temp_dir"]
    session_dir = item_info["session_dir"]
    font_path = item_info["font_path"]
    font_size = item_info["font_size"]
    font_color = item_info["font_color"]
    x_expr = item_info["x_expr"]
    y_expr = item_info["y_expr"]
    alpha_expr = item_info["alpha_expr"]
    template_video = item_info["template_video"]
    composite_overlay_file = item_info["composite_overlay_file"]
    duration = item_info["duration"]

    display_name = name.upper() if is_uppercase else name
    if "{NAME}" in template_pattern:
        full_text = template_pattern.replace("{NAME}", display_name)
    else:
        full_text = f"{template_pattern} {display_name}".strip()

    text_tmp_path = temp_dir / f"txt_{idx}.txt"
    with open(text_tmp_path, "w", encoding="utf-8") as tf:
        tf.write(full_text)

    slug = sanitize_filename(name)
    out_file = session_dir / f"video_{slug}.mp4"

    drawtext_filter = (
        f"drawtext=fontfile='{font_path}':"
        f"textfile='{text_tmp_path.resolve()}':"
        f"fontsize={font_size}:"
        f"fontcolor={font_color}:"
        f"shadowcolor=black@0.65:shadowx=2:shadowy=2:"
        f"x={x_expr}:y={y_expr}{alpha_expr}"
    )

    cmd = [
        "ffmpeg", "-y",
        "-threads", "1",
        "-i", str(template_video),
        "-i", str(composite_overlay_file),
        "-filter_complex", f"[0:v][1:v]overlay=0:0[bg];[bg]{drawtext_filter}[outv]",
        "-map", "[outv]", "-map", "0:a?"
    ]

    if duration:
        cmd += ["-t", str(duration)]

    cmd += [
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "26",
        "-c:a", "copy",
        str(out_file)
    ]

    t0 = time.time()
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    t_elapsed = time.time() - t0

    if text_tmp_path.exists():
        text_tmp_path.unlink()

    return {
        "idx": idx,
        "name": name,
        "full_text": full_text,
        "out_file": out_file,
        "time": t_elapsed,
        "success": res.returncode == 0
    }

def main():
    config_file = BASE_DIR / "config.json"
    if not config_file.exists():
        print("Lỗi: Không tìm thấy file config.json")
        sys.exit(1)

    with open(config_file, "r", encoding="utf-8") as f:
        config = json.load(f)

    template_video = BASE_DIR / config.get("template_video", "assets/gemini_generated_video_9e6c76b5.mp4")
    names_file = BASE_DIR / config.get("names_file", "input/names.txt")
    duration = config.get("duration_seconds", 10)
    layers = config.get("layers", [])
    max_workers = config.get("max_workers", 6) # 6 workers for 12-core CPU

    # Temporary Session directory (tạm thời)
    session_id = int(time.time())
    session_dir = BASE_DIR / "output" / f"session_{session_id}"
    session_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = BASE_DIR / "scratch_temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    if not names_file.exists():
        print(f"Lỗi: Không tìm thấy file danh sách {names_file}")
        sys.exit(1)

    with open(names_file, "r", encoding="utf-8") as f:
        raw_names = [line.strip() for line in f if line.strip()]

    # Render static overlay dynamically in memory from layers
    static_overlay_img = render_static_overlay(layers, width=720, height=1280)
    composite_overlay_file = temp_dir / f"overlay_{session_id}.png"
    static_overlay_img.save(composite_overlay_file)

    # Dynamic layer
    dyn_layer = next((l for l in layers if l.get("is_dynamic", False)), None)
    if not dyn_layer:
        dyn_layer = {
            "text": "DEAR {NAME}",
            "y": 170,
            "x": 0,
            "align": "center",
            "font_family": "sans_bold",
            "font_size": 38,
            "color": "white",
            "animation": "slide_up",
            "uppercase": True
        }

    font_key = dyn_layer.get("font_family", "sans_bold")
    font_path = FONT_MAP.get(font_key, FONTS_DIR / "sans_bold.ttf")
    y_pos = int(dyn_layer.get("y", 170))
    x_offset = int(dyn_layer.get("x", 0))
    font_size = int(dyn_layer.get("font_size", 38))
    font_color = dyn_layer.get("color", "white")
    animation = dyn_layer.get("animation", "slide_up")
    alignment = dyn_layer.get("align", "center")
    is_uppercase = dyn_layer.get("uppercase", True)
    template_pattern = dyn_layer.get("text", "DEAR {NAME}")

    if alignment == "center":
        x_expr = f"(w-text_w)/2+{x_offset}"
    elif alignment == "left":
        x_expr = f"60+{x_offset}"
    elif alignment == "right":
        x_expr = f"w-text_w-60+{x_offset}"
    else:
        x_expr = f"(w-text_w)/2+{x_offset}"

    dur = duration if duration and duration > 0 else 10

    if animation == "fade":
        y_expr = f"{y_pos}"
        alpha_expr = ":alpha='if(lt(t,1.2), t/1.2, 1)'"
    elif animation == "slide_up":
        y_expr = f"'if(lt(t,1.2), {y_pos}+45*(1-t/1.2), {y_pos})'"
        alpha_expr = ":alpha='if(lt(t,1.2), t/1.2, 1)'"
    elif animation == "fade_in_out":
        y_expr = f"{y_pos}"
        alpha_expr = f":alpha='if(lt(t,1.2), t/1.2, if(gt(t,{dur}-1.0), ({dur}-t)/1.0, 1))'"
    else:
        y_expr = f"{y_pos}"
        alpha_expr = ""

    print("=" * 70)
    print("🚀 CÔNG CỤ TẠO VIDEO ĐA LUỒNG (MULTI-THREADING BATCH GENERATOR)")
    print("=" * 70)
    print(f"📁 Video nền:           {template_video.name}")
    print(f"⚡ Số luồng xử lý:      {max_workers} luồng song song (Tận dụng CPU 12 cores)")
    print(f"📁 Thư mục tạm phiên:   output/session_{session_id}/ (Lưu tạm thời)")
    print(f"👥 Tổng số khách mời:   {len(raw_names)}")
    print("-" * 70)

    # Prepare task arguments
    tasks = []
    for idx, raw_name in enumerate(raw_names, start=1):
        clean_name = raw_name.strip()
        if not clean_name:
            continue
        tasks.append({
            "idx": idx,
            "name": clean_name,
            "template_pattern": template_pattern,
            "is_uppercase": is_uppercase,
            "temp_dir": temp_dir,
            "session_dir": session_dir,
            "font_path": font_path,
            "font_size": font_size,
            "font_color": font_color,
            "x_expr": x_expr,
            "y_expr": y_expr,
            "alpha_expr": alpha_expr,
            "template_video": template_video,
            "composite_overlay_file": composite_overlay_file,
            "duration": duration
        })

    total_start = time.time()
    completed = 0
    generated_files = []
    batch_size = 8
    total_batches = (len(tasks) + batch_size - 1) // batch_size
    print(f"🎬 Bắt đầu render {len(tasks)} video chia làm {total_batches} đợt ({batch_size} video/đợt)...")

    for b_idx in range(0, len(tasks), batch_size):
        chunk = tasks[b_idx:b_idx + batch_size]
        cur_batch_num = (b_idx // batch_size) + 1
        t_chunk_start = time.time()

        with ThreadPoolExecutor(max_workers=len(chunk)) as executor:
            future_to_task = {executor.submit(render_single_video, t): t for t in chunk}
            for future in as_completed(future_to_task):
                res = future.result()
                completed += 1
                if res["success"]:
                    generated_files.append(res["out_file"])

        t_chunk_spent = time.time() - t_chunk_start
        print(f"  ⚡ [Đợt {cur_batch_num:02d}/{total_batches}] Hoàn tất {completed:3d}/{len(tasks)} video trong {t_chunk_spent:.2f}s (tốc độ: {t_chunk_spent/max(1, len(chunk)):.2f}s/video)")

    total_time = time.time() - total_start
    print("-" * 70)
    print(f"📦 Đang đóng gói trọn bộ {len(generated_files)} video thành 1 file ZIP duy nhất...")

    zip_file = BASE_DIR / "output" / f"batch_videos_{session_id}.zip"
    with zipfile.ZipFile(zip_file, 'w', zipfile.ZIP_STORED) as zipf:
        for f in generated_files:
            zipf.write(f, arcname=f.name)

    print(f"🎉 HOÀN THÀNH: {len(generated_files)} video trong {total_time:.2f}s!")
    print(f"⚡ Tốc độ trung bình: {total_time/len(generated_files):.2f}s/video (Chạy song song {max_workers} luồng)")
    print(f"🎁 File ZIP tải về:   {zip_file.resolve()} ({zip_file.stat().st_size / (1024*1024):.1f} MB)")
    print("=" * 70)
    # Tự động dọn dẹp các file video lẻ tạm thời, chỉ giữ lại file ZIP
    import shutil
    if session_dir.exists():
        shutil.rmtree(session_dir)
        print(f"🧹 Đã tự động dọn dẹp thư mục tạm {session_dir.name} để giải phóng dung lượng ổ cứng!")

    # Cleanup temp in-memory images
    try:
        composite_overlay_file.unlink()
        temp_dir.rmdir()
    except Exception:
        pass

if __name__ == "__main__":
    main()
