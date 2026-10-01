# PERSONALIZED VIDEO GENERATOR (CÔNG CỤ TẠO VIDEO THIỆP MỜI HÀNG LOẠT)

Hệ thống tạo video thiệp mời / thư cảm ơn cá nhân hóa tự động với video nền lụa đỏ chuyển động, hỗ trợ căn chỉnh vị trí linh hoạt và xuất hàng loạt không giới hạn số lượng.

---

## 🚀 CÁCH 1: DÙNG SCRIPT DÒNG LỆNH (CLI)

Phù hợp khi muốn render siêu nhanh số lượng lớn (hàng trăm đến hàng nghìn khách mời).

1. Mở file `config.json` để tùy chỉnh thông số (nếu cần):
   - `"y_position": 170`: Độ cao của dòng chữ DEAR...
   - `"font_size": 38`: Kích cỡ chữ
   - `"duration_seconds": 10`: Thời lượng mỗi video (giây)
   - `"prefix": "DEAR "`: Tiền tố trước tên khách mời

2. Dán danh sách tên vào file `input/names.txt` (mỗi dòng 1 tên).

3. Chạy lệnh:
   ```bash
   python3 cli_generator.py
   ```

4. Các video thành phẩm sẽ được lưu tự động trong thư mục `output/`.

---

## 🌐 CÁCH 2: DÙNG GIAO DIỆN WEB TRỰC QUAN (WEB STUDIO)

Phù hợp cho việc căn chỉnh mắt thấy tai nghe, kéo thả trực tiếp trên video trước khi xuất.

1. Chạy lệnh khởi động web server:
   ```bash
   python3 web_app/server.py 8080
   ```

2. Mở trình duyệt web truy cập:
   👉 **http://localhost:8080**

3. Tính năng trên giao diện Web:
   - **Live Preview:** Xem video lụa đỏ chuyển động theo thời gian thực.
   - **Thanh trượt vị trí Y:** Kéo thanh trượt để dòng chữ `DEAR ...` di chuyển lên/xuống trực quan trên video.
   - **Cỡ chữ & Tiền tố:** Tùy biến kích thước, kiểu chữ in hoa, tiền tố.
   - **Dán danh sách khách mời:** Dán hàng loạt tên vào khung văn bản.
   - **Xuất video 1-click:** Bấm nút xuất, xem tiến trình và tải từng video hoặc tải toàn bộ qua file `.ZIP`.
