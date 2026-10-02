# Kế Hoạch Chuyển Đổi Sang Bun Runtime & Đóng Gói Standalone Executable

- **Mục tiêu:** Chuyển đổi toàn bộ backend từ Python sang **Bun (TypeScript)** trên nhánh `feat/bun-runtime`, loại bỏ phụ thuộc môi trường Python và đóng gói ứng dụng thành **1 file binary thực thi duy nhất (Standalone Executable)** thông qua `bun build --compile`.
- **Nhánh thực hiện:** `feat/bun-runtime`
- **Ngày lập:** 01/10/2026

---

## 1. Hiện trạng hệ thống (Python)

- **Backend hiện tại:** Viết bằng Python (`web_app/server.py`) sử dụng thư viện tiêu chuẩn `ThreadingHTTPServer`, `subprocess.run`, `Pillow` (PIL), `zipfile`.
- **Giao diện:** HTML/CSS/JS thuần (`web_app/public/index.html`, `app.js`, `style.css`).
- **Hạn chế của giải pháp Python hiện tại:**
  - Bắt buộc môi trường máy chạy phải cài đặt sẵn Python 3.10+, thư viện `Pillow`, quản lý môi trường ảo (`venv`).
  - Gặp khó khăn khi bàn giao hoặc phân phối cho người dùng nội bộ không am hiểu dòng lệnh.
  - Tốc độ xử lý I/O và khởi động tiến trình con của Python chậm hơn so với runtime hiện đại.

---

## 2. Giải pháp kỹ thuật với Bun

### 2.1. Core Runtime & Web Server
- Sử dụng **Bun (TypeScript native)**: Không cần biên dịch trung gian qua `tsc` hay `babel`.
- Thay thế `http.server` bằng `Bun.serve()`: Xử lý HTTP request với hiệu năng cao gấp 3-5 lần, hỗ trợ async non-blocking natively.

### 2.2. Nhúng Static Assets (Tạo file thực thi độc lập)
- Bun hỗ trợ nhúng trực tiếp nội dung các file tĩnh (HTML, CSS, JS) vào file binary thông qua static import:
  ```ts
  import indexHtml from "../public/index.html" with { type: "text" };
  import appJs from "../public/app.js" with { type: "text" };
  import styleCss from "../public/style.css" with { type: "text" };
  ```
- Khi biên dịch thành executable, toàn bộ giao diện web nằm gọn trong 1 file nhị phân duy nhất, không lo thất lạc thư mục `public/`.

### 2.3. Điều phối Render FFmpeg (Concurrency Control)
- Dùng `Bun.spawn()` thay cho `subprocess.run()`: Cải thiện hiệu suất tạo process con, quản lý trực tiếp luồng stdout/stderr.
- Xây dựng **Worker Pool / Semaphore Async** gọn nhẹ (không cần thư viện cồng kềnh) để giới hạn tải đồng thời (ví dụ: tối đa 8 process FFmpeg song song).
- Giữ nguyên toàn bộ logic FFmpeg filter chain (CPU `libx264 ultrafast` và GPU AMD `VAAPI h264_vaapi`).

### 2.4. Đóng gói Single Executable
- Sử dụng lệnh biên dịch native của Bun:
  ```bash
  bun build ./src/server.ts --compile --minify --outfile dist/video-tool
  ```
- Kết quả thu được: File thực thi nhị phân `dist/video-tool` (Linux ELF binary). Chạy trực tiếp bằng `./video-tool` mà **không cần cài Bun hay Node.js trên máy đích**.

---

## 3. Danh sách File & API Endpoints

### 3.1. Cấu trúc thư mục mới đề xuất
```text
tools-video-test/
├── assets/                  # Giữ nguyên (fonts, mẫu video)
├── input/                   # Giữ nguyên (danh sách tên)
├── src/                     # Source code TypeScript mới
│   ├── server.ts            # Entrypoint: Bun.serve & routing
│   ├── ffmpeg.ts            # FFmpeg command builder & process spawner
│   ├── queue.ts             # Async batch queue & concurrency pool
│   └── utils.ts             # Text sanitize, file helpers, ZIP archive
├── web_app/public/          # Giao diện web giữ nguyên
│   ├── index.html
│   ├── app.js
│   └── style.css
├── package.json             # Khai báo script build & project metadata
├── tsconfig.json            # Cấu hình TypeScript cho Bun
└── dist/
    └── video-tool           # File binary standalone sau khi compile
```

### 3.2. Đảm bảo tính tương thích của API Endpoints (100% giữ nguyên cho Frontend)
Frontend `app.js` không cần sửa đổi lớn vì backend Bun sẽ cung cấp chính xác các endpoints cũ:
1. `GET /` — Phục vụ trang chủ `index.html`.
2. `GET /api/config` & `POST /api/save-config` — Quản lý cấu hình lớp text, animation, font.
3. `POST /api/upload-video` & `POST /api/upload-image` — Tiếp nhận file upload bằng `FormData`.
4. `POST /api/preview` — Xuất 1 frame mẫu của video qua FFmpeg (`-vframes 1`) trả về ảnh PNG xem trước.
5. `POST /api/render-batch` — Xử lý render hàng loạt tên khách, trả về tiến độ và thời gian hoàn thành.
6. `GET /api/download-zip` — Tải gói ZIP chứa các video đã tạo.
7. `POST /api/cleanup-temp` — Dọn dẹp video tạm thời ngay sau khi tải ZIP hoặc khi tải lại trang.

---

## 4. Phân tích Rủi ro & Biện pháp Giảm thiểu

| Rủi ro | Mức độ | Biện pháp giảm thiểu |
| :--- | :---: | :--- |
| **Phụ thuộc FFmpeg ngoài** | Trung bình | File binary Bun đóng gói JS/TS runtime nhưng không nhúng sẵn binary `ffmpeg` (vì ffmpeg quá lớn). **Giải pháp:** Khi ứng dụng khởi động, thực hiện check lệnh `ffmpeg -version`, nếu thiếu sẽ in thông báo hướng dẫn rõ ràng. |
| **Xử lý font tiếng Việt** | Thấp | FFmpeg `drawtext` trỏ đường dẫn trực tiếp tới file `assets/fonts/*.ttf`. Đảm bảo copy thư mục `assets/` đi kèm file binary, hoặc dùng đường dẫn cấu hình linh hoạt. |
| **Quá tải RAM khi nén file lớn** | Thấp | Dùng stream ZIP hoặc gọi trực tiếp công cụ `zip` qua spawn thay vì load toàn bộ file vào buffer bộ nhớ RAM. |

---

## 5. Kế hoạch Thực hiện & Checklist Kiểm thử

### Các bước thực hiện:
- [ ] **Bước 1:** Khởi tạo `package.json` và cấu hình TypeScript cho Bun.
- [ ] **Bước 2:** Cập nhật `.gitignore` để loại bỏ `node_modules/`, `dist/`.
- [ ] **Bước 3:** Viết module `src/ffmpeg.ts` (xử lý logic tạo tham số lệnh FFmpeg CPU & GPU).
- [ ] **Bước 4:** Viết module `src/server.ts` cung cấp đầy đủ các API và phục vụ static files.
- [ ] **Bước 5:** Thử nghiệm chạy dev với `bun run src/server.ts`, render test 5 video và 200 video để đối chiếu tốc độ.
- [ ] **Bước 6:** Đóng gói thử nghiệm executable bằng `bun build --compile` và kiểm tra chạy độc lập không qua Bun CLI.

### Tiêu chí nghiệm thu (Checklist):
- [ ] Render đơn lẻ và cập nhật xem trước (Preview) hoạt động mượt mà.
- [ ] Render batch 200 video ổn định, không bị nghẽn luồng hay crash process.
- [ ] Tính năng chọn GPU Mode (VAAPI) hoạt động bình thường trên phần cứng hỗ trợ.
- [ ] Tải file ZIP thành công và tự động xóa file tạm đúng logic.
- [ ] File nhị phân `dist/video-tool` có thể khởi động độc lập và mở được giao diện trên trình duyệt `http://localhost:8080`.
