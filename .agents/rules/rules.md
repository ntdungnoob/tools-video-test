---
trigger: always_on
---

---
description: Rules for AI Agent behavior focusing on zero-leak security, context optimization, and strict execution control.
alwaysApply: true
---

# AGENTS.md

## Mục tiêu

Bảo mật tuyệt đối thông tin nhạy cảm, tối ưu hóa quota/context và kiểm soát chặt chẽ hành vi sửa đổi mã nguồn. Luôn đảm bảo mọi thay đổi code phải hiển thị qua giao diện Diff trực quan (Accept/Reject) của IDE.

---

## 1. Bảo mật & Giới hạn truy cập (BẮT BUỘC)

### 1.1 Blacklist (Tuyệt đối KHÔNG đọc, KHÔNG sửa, KHÔNG in ra màn hình)

- **Môi trường & Secrets:** `.env`, `.env.*` (ngoại trừ `.env.example`), `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `credentials.json`, `service-account.json`, token, secret keys, database URL.
- **Thư mục hệ thống & build:** `node_modules/`, `dist/`, `build/`, `.turbo/`, `.cache/`, `.git/`, `logs/`, `tmp/`.
- **File lock & dung lượng lớn:** `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb` (trừ khi có yêu cầu rõ ràng).

### 1.2 Whitelist Thư mục cho phép đọc

Mặc định chỉ đọc trong các thư mục sau (phù hợp cấu trúc Monorepo):

- `pages/` `packages/` `src/` `apps/` `app/`
- `components/` `services/` `controllers/` `hooks/`
- `utils/` `models/` `queries/` `lib/` `types/`

**Default rule — Thư mục không xác định:**
Mọi thư mục **không nằm trong Whitelist** và **không nằm trong Blacklist** (ví dụ: `config/`, `scripts/`, `migrations/`, `prisma/`) → **hỏi owner trước khi đọc**. Chỉ mở khi owner đồng ý rõ ràng trong yêu cầu hiện tại.

### 1.3 Lệnh nguy hiểm & Dịch vụ bên ngoài

- **CẤM SỬA FILE QUA TERMINAL (CRITICAL):** Tuyệt đối **KHÔNG** dùng các lệnh terminal/shell (như `node -e`, `python -c`, `sed`, `awk`, `echo >`, `cat <<EOF`, `tee`, bash scripts...) để tạo, ghi đè, nối hoặc sửa đổi nội dung file. Mọi can thiệp code **BẮT BUỘC** phải gọi qua công cụ sửa file tích hợp của IDE (File Edit Tool).
- **Lệnh cấm:** Không tự ý chạy `rm -rf`, `sudo`, `db migrate`, `prisma db push`, `docker prune`.
- **Database:** Không đọc `.env` hoặc các file có tên tương tự `env` để lấy chuỗi kết nối và không truy vấn trực tiếp vào database.
- **MCP & External Tools:** Không truy cập MCP, Slack, Jira, Notion, Cloud Services (AWS, GCP, Azure) nếu chưa có chỉ thị rõ ràng trong yêu cầu hiện tại.

---

## 2. Tiết kiệm Context & Quy trình Tìm kiếm (Search Protocol)

### 2.1 Quy trình tra cứu 3 bước

1. **Bước 1 (Active File):** Chỉ đọc file đang được mở hoặc file liên quan trực tiếp.
2. **Bước 2 (Imports):** Chỉ lần theo các file được `import` trực tiếp từ file ở Bước 1.
   - ⚠️ **Exception:** Nếu file được import thuộc **Blacklist** (`node_modules/`, `dist/`, `build/`...) → **bỏ qua, không đọc**.
3. **Bước 3 (Dừng lại hỏi):** Nếu sau 2 bước không xác định được nguyên nhân, **DỪNG LẠI NGAY** và xin ý kiến owner, không dùng `grep`/`find` quét toàn bộ dự án.

### 2.2 Quy tắc Debug bằng Log

- Khi cần debug, chỉ thêm log an toàn vào code và hướng dẫn owner cách chạy.
- Khi nhờ owner gửi lại log, bắt buộc cảnh báo owner xóa/che các key, token hoặc thông tin nhạy cảm trước khi gửi.

---

## 3. Chế độ Hoạt động (Operating Modes)

### 🔸 Chế độ 0: Ambiguous Intent (XỬ LÝ INTENT MƠ HỒ)

- Kích hoạt khi câu hỏi **chứa từ khóa Chế độ 2** nhưng đặt trong ngữ cảnh phân tích/hỏi đáp:
  - Dấu hiệu nhận biết: câu có dấu `?`, hoặc bắt đầu bằng _tại sao, giải thích, lỗi gì, khi nào, thế nào_...
  - Ví dụ: _"tại sao update bị lỗi?"_, _"fix này có ý nghĩa gì?"_
- **Hành vi:** Xử lý theo **Chế độ 1** (Read-Only). Không tự ý chuyển sang Chế độ 2.
- Nếu thực sự không chắc intent → **hỏi lại owner** trước khi hành động.

### 🔹 Chế độ 1: Read-Only Analysis (MẶC ĐỊNH)

- Tự động kích hoạt khi nhận câu hỏi: _tại sao, giải thích, kiểm tra, review, phân tích, tìm lỗi, tối ưu thế nào..._
- **Hành vi:** Chỉ phân tích logic và đưa ra code gợi ý trong tin nhắn. **TUYỆT ĐỐI KHÔNG DÙNG TOOL SỬA FILE.**

### 🔹 Chế độ 2: Code Modification (CHỈ KHI CÓ LỆNH RÕ RÀNG)

- Chỉ kích hoạt khi owner dùng các từ khóa chỉ thị **trực tiếp, là động từ mệnh lệnh** (không nằm trong câu hỏi): **sửa**, **fix**, **implement**, **refactor**, **update**, **thêm**, **xóa**, **áp dụng**, **viết**, **tạo**, **add**, **create**, **write**.
- **Quy tắc thực thi sửa file (BẮT BUỘC):**
  - 🛑 **Luôn dùng công cụ IDE Edit Tool:** Khi sửa file, AI **chỉ được gọi công cụ sửa file tích hợp** để IDE hiển thị giao diện Diff trực quan (vùng xanh/đỏ) và nút Accept/Reject cho owner duyệt. Tuyệt đối không can thiệp ngầm qua dòng lệnh terminal.
  - 🛑 **Chốt chặn an toàn (Checkpoints):** Sửa > 3 file HOẶC tổng số dòng thay đổi (cộng dồn tất cả file) > 100 dòng: Phải liệt kê danh sách file & giải thích Action Plan, chờ owner duyệt trước khi sửa.
  - 🛑 **Không tự tạo file rác:** Cấm tự tạo file tạm (`debug.js`, `temp.ts`, `test.js`).
    -> _Ngoại lệ:_ Khi owner yêu cầu rõ ràng "lập file kế hoạch", "tạo file docs/plan", "viết tài liệu" -> được phép tạo trực tiếp file `.md` vào thư mục chỉ định.
  - 🛑 **Không tự sửa cấu hình:** Không tự ý sửa `package.json`, `Dockerfile`, `docker-compose.yml`, GitHub Workflows trừ khi có yêu cầu cụ thể.

---

## 4. Quy tắc Git & Phản hồi

- **Git:** Chỉ chạy lệnh đọc an toàn (`git status`, `git diff`, `git log -n 5`) để kiểm tra trạng thái khi cần. **Không dùng `git diff` trong terminal để thay thế cho giao diện Diff của IDE**. Không tự `commit`, `push`, `reset`, `rebase`, `merge`.
- **Ngôn ngữ:** Trả lời bằng tiếng Việt. Giữ nguyên thuật ngữ kỹ thuật, tên file, command, error message bằng tiếng Anh.
- **Format phản hồi sau khi sửa code:**

  ```txt
  Đã sửa:
  - [file A]: nội dung sửa ngắn gọn (1-2 câu)
  Lưu ý / Rủi ro: (nếu có)
  ```

---

## 5. Quy tắc Khắc phục Lỗi & Thay đổi Logic (Fix & Refactor Protocol)

Khi phát hiện bug hoặc owner yêu cầu fix/refactor:

1. **Với tác vụ thông thường (<= 3 file, <= 100 dòng):**
   - Phân tích đúng root cause và **trực tiếp gọi công cụ sửa file tích hợp của IDE** để kích hoạt diff thay đổi (vùng xanh/đỏ) cho owner duyệt.
   - Tuyệt đối không chạy script terminal để tự động fix ngầm rồi tự chạy build test.
   - Phản hồi ngắn gọn theo format mục 4 (Đã sửa / Lưu ý).

2. **Với tác vụ lớn (> 3 file HOẶC > 100 dòng) hoặc chưa rõ giải pháp:**
   - Dừng lại, trình bày kế hoạch theo cấu trúc 4 bước (Root Cause, New Logic, Action Plan, Side Effects) và chờ owner duyệt trước khi bắt đầu sửa.

### 5.1 Quy tắc tạo File Kế Hoạch (Plan Documentation Protocol)

Khi owner dùng các từ khóa như "lập file kế hoạch", "tạo file plan", "viết docs kế hoạch":

1. Không chỉ tóm tắt trên chat hay dùng artifact ẩn.
2. Tạo trực tiếp file Markdown chi tiết (ví dụ: `docs/plans/[TÊN_TÍNH_NĂNG]_PLAN.md` hoặc đường dẫn owner chỉ định).
3. File kế hoạch phải chứa đầy đủ: Hiện trạng, Giải pháp kỹ thuật, Danh sách file/route thay đổi, Rủi ro, và Checklist kiểm thử.
4. Trả lời ngắn gọn kèm clickable link đến file vừa tạo để owner review.

---

## 6. Quy tắc thay đổi logic giao diện & UI (UI/UX Change Protocol)

Khi owner yêu cầu chỉnh sửa giao diện, component, hoặc UX:

1. **KHÔNG** tự ý thay đổi vị trí, kích thước, màu sắc, font, hoặc layout trừ khi được yêu cầu rõ ràng.
2. **KHÔNG** tự ý thêm, xóa hoặc ẩn các trường thông tin trên giao diện.
3. **LUÔN LUÔN** phân tích yêu cầu, đề xuất thay đổi logic hiển thị, và trình bày rõ ràng **cấu trúc file** và **cách thức áp dụng** trước khi sửa.

**Cấu trúc phản hồi bắt buộc:**

```txt
1. Yêu cầu cần thực hiện:
- Tóm tắt lại yêu cầu của owner.

2. Phân tích logic hiện tại:
- Giải thích cách UI đang hoạt động.
- Chỉ ra các component nào đang chịu trách nhiệm cho phần giao diện cần thay đổi.

3. Đề xuất thay đổi & Luồng logic mới:
- Mô tả chi tiết thay đổi logic UI (ví dụ: "thêm điều kiện hiển thị X khi Y", "thay đổi cách sắp xếp Z").
- Chỉ rõ component/file nào cần sửa và dòng code cụ thể.

4. Tác động & Rủi ro:
- Nêu rõ thay đổi có ảnh hưởng đến tính năng khác không.

Chờ owner duyệt:
- [ ] Đồng ý triển khai theo kế hoạch
- [ ] Cần điều chỉnh UI/UX
```