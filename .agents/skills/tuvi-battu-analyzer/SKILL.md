---
name: tuvi-battu-analyzer
description: |
  Phân tích toàn diện lá số Tử Vi kết hợp lá số Bát Tự (Tứ Trụ) để tạo bản luận giải 
  chuyên sâu, chính xác, khách quan về tất cả khía cạnh đời sống. Hỗ trợ 2 chế độ: 
  (1) Luận giải tổng hợp toàn bộ 12 cung + Bát Tự, (2) Phân tích chuyên sâu 1-2 khía cạnh 
  cụ thể (tình duyên, tài bạch, sự nghiệp, sức khỏe...). 
  Kích hoạt khi user nói "phân tích tử vi", "luận giải lá số", "phân tích bát tự", 
  "xem tử vi", "phân tích tình duyên/tài bạch/sự nghiệp", "luận giải tử vi bát tự",
  "analyze horoscope", "tử vi bát tự", "đọc lá số".
---

# Goal

Phân tích kết hợp lá số Tử Vi và Bát Tự (Tứ Trụ) để tạo ra bản luận giải chuyên sâu, 
chính xác về các khía cạnh đời sống của đương số — giúp họ hiểu rõ bản thân, vận mệnh, 
và có hướng hành động tích cực, xây dựng.

---

# Instructions

## Bước 0: Xác định chế độ hoạt động

Đọc yêu cầu user để xác định chế độ:

| Tình huống | Chế độ | Output |
|------------|--------|--------|
| User nói "luận giải tổng hợp", "phân tích toàn diện", "xem tử vi đầy đủ" | **Full Report** | Luận giải tổng hợp 12 cung + Bát Tự + lời khuyên |
| User nói "phân tích tình duyên", "xem tài bạch", "phân tích sức khỏe"... | **Deep Dive** | Phân tích chuyên sâu 1-2 khía cạnh cụ thể |
| User chưa rõ | → Hỏi: "Anh/chị muốn em phân tích tổng hợp toàn diện, hay đi sâu vào khía cạnh cụ thể nào (tình duyên, tài bạch, sự nghiệp, sức khỏe, con cái...)?" |

---

## Bước 1: Thu thập Input — Xác nhận dữ liệu đầu vào

1. Yêu cầu user cung cấp **lá số Tử Vi** (file markdown hoặc dạng text liệt kê 12 cung + sao)
2. Yêu cầu user cung cấp **lá số Bát Tự / Tứ Trụ** (file markdown hoặc bảng Tứ Trụ)
3. Xác nhận thông tin cá nhân: **họ tên, giới tính, ngày giờ sinh (dương lịch + âm lịch), tuổi, bản mệnh**
4. **Nếu thiếu một trong hai lá số** → Hỏi user:
   - Thiếu Tử Vi: "Em cần lá số Tử Vi để phân tích 12 cung. Anh/chị có file không?"
   - Thiếu Bát Tự: "Em cần lá số Bát Tự (Tứ Trụ) để phân tích ngũ hành, Dụng Thần. Anh/chị có file không?"
   - Nếu chỉ có 1 lá số → vẫn phân tích được nhưng PHẢI cảnh báo: "⚠️ Chỉ phân tích [Tử Vi/Bát Tự] riêng lẻ, kết quả chưa được đối chiếu chéo nên độ chính xác giảm."
5. Xác nhận năm xem (để phân tích lưu niên nếu cần)

---

## Bước 2: Phân tích lá số Tử Vi — Tuần tự 12 cung

> 📚 Tham khảo `resources/tuvi_knowledge_base.md` cho kiến thức nền về sao, cách cục, trạng thái.

Với **MỖI CUNG** trong 12 cung (Mệnh → Huynh Đệ), thực hiện:

### 2.1. Liệt kê cấu trúc cung
- Tên cung, vị trí (địa chi), vòng Trường sinh (Mộ/Thai/Đế vượng...), thứ hạn
- Danh sách chính tinh + **trạng thái bắt buộc**: Miếu (M) / Vượng (V) / Đắc (Đ) / Bình (B) / Hãm (H)
- Danh sách phụ tinh + trạng thái (nếu có)
- Tứ Hóa bay vào cung (Hóa Lộc / Quyền / Khoa / Kỵ) — ghi rõ Tứ Hóa hóa cho sao nào
- Tuần / Triệt có án ngữ tại cung không?

### 2.2. Phân tích **từng sao riêng biệt**
- Ý nghĩa bản chất của sao
- Trạng thái sao tại cung này ảnh hưởng thế nào (Miếu → tốt nhất, Hãm → tiêu cực)
- Vai trò cụ thể trong ngữ cảnh cung (VD: Thái Âm ở cung Mệnh ≠ Thái Âm ở cung Tài Bạch)

### 2.3. Phân tích **sự kết hợp cụm sao** (cách cục)
- Nhận diện cách cục nổi tiếng (VD: Đồng Âm Vượng Tý = "Thủy trừng quế ngạc", Cơ Lương Miếu Thìn, Cự Nhật Dần Thân, Tử Sát đồng cung...)
- Phân tích synergy hoặc xung đột giữa các sao trong cùng cung
- Ảnh hưởng cụm cát tinh vs hung tinh: liệt kê riêng, đánh giá cán cân
- **Luận giải nâng cao (📚 ref KB Section 13):** Sử dụng triết lý Đông phương (Ngũ hành → hình tượng thiên nhiên, Âm Dương → đối lập bổ sung) và ẩn dụ để mô tả cách cục. VD: Liêm Tham Hãm + Song Lộc = "Thanh kiếm rỉ sét nhưng núi vàng bên cạnh — phải mài kiếm thì mới dùng vàng được".
- **Synergy sâu:** Không chỉ liệt kê sao, mà phải phân tích cơ chế tương tác: sao A sinh/khắc/hỗ trợ sao B thế nào? Tứ Hóa kích hoạt sao nào? Tuần/Triệt phong ấn sao nào?

### 2.4. Phân tích ảnh hưởng đặc biệt
- **Tuần/Triệt**: Nếu có → giải thích cơ chế "phong ấn" (kìm cả tốt lẫn xấu, giải dần theo thời gian)
- **Vòng Trường sinh**: Trạng thái cung (Mộ → ẩn mình, Thai → tái sinh, Đế vượng → cực thịnh, Tuyệt → phai nhạt...)
- **Tứ Hóa**: Ý nghĩa Hóa Lộc/Quyền/Khoa/Kỵ bay vào cung + bay cho sao nào + trạng thái sao đó
- **Lai Nhân (📚 ref KB Section 15):** Tại cung **Phúc Đức**, xác định Lai Nhân dựa trên Nạp Âm năm sinh → nghiệp tiền kiếp, phúc đức tổ tiên, nguyên nhân sâu xa ảnh hưởng đời này. Đối chiếu Lai Nhân với cách cục cung Phúc Đức + cung Mệnh để hiểu "gốc rễ" cuộc đời.

### 2.5. Xem xét **cung chiếu** và **tam hợp**
- Cung đối diện (chiếu) có sao gì? Ảnh hưởng thế nào?
- Bộ tam hợp hội tụ những sao nào? Tạo thành bức tranh tổng thể ra sao?

### 2.6. Kết luận cung
- Tóm gọn 2-3 câu: cung này nói gì về khía cạnh đó trong đời sống
- Lời khuyên cụ thể (nếu có)

### 2.7. Hệ thống sao Lưu Niên Tử Vi (📚 ref KB Section 14)

Khi phân tích **lưu niên** (năm cụ thể), BẮT BUỘC tra và phân tích:
- **Lưu Tứ Hóa**: Tra theo Can của năm → 4 sao nhận Hóa Lộc/Quyền/Khoa/Kỵ → bay vào cung nào?
- **Lưu Lộc Tồn**: Tra theo Can năm → Lộc Tồn lưu niên tọa cung nào?
- **Lưu Hồng Loan / Lưu Thiên Hỷ**: Tra theo Chi năm → Hồng Loan/Thiên Hỷ tọa cung nào? → duyên hôn nhân năm đó
- **Lưu Thiên Mã**: Tra theo Chi năm → Thiên Mã tọa cung nào? → di chuyển, thay đổi năm đó
- **Lưu Thái Tuế và bộ**: Tra theo Chi năm → vòng Thái Tuế lưu niên

---

## Bước 3: Phân tích lá số Bát Tự (Tứ Trụ)

> 📚 Tham khảo `resources/battu_knowledge_base.md` cho kiến thức nền.

### 3.1. Nhận diện Nhật chủ
- Thiên Can Nhật chủ là gì? (VD: Quý Thủy — Âm Thủy)
- Tính cách bản chất của Nhật chủ (mỗi Can có tính cách riêng)

### 3.2. Phân tích ngũ hành trong tứ trụ
- Lập **bảng đếm điểm** ngũ hành: đếm từ Thiên Can + Địa Chi + Tàng Ẩn
- Xác định hành nào VƯỢNG, hành nào NHƯỢC, hành nào THIẾU

### 3.3. Xác định Thân vượng / Thân nhược
- Dựa trên: Ấn tinh (sinh thân), Tỷ Kiên (trợ thân) vs Tài tinh (tiêu hao), Quan Sát (khắc thân), Thực Thương (tiết khí)
- Kết luận rõ ràng: **THÂN VƯỢNG** hay **THÂN NHƯỢC** + giải thích tại sao

### 3.4. Xác định Dụng Thần, Hỷ Thần, Kỵ Thần
- **Dụng Thần**: Hành nào cần nhất để cân bằng mệnh cục? Tại sao?
- **Hỷ Thần**: Hành nào hỗ trợ Dụng Thần? Tại sao?
- **Kỵ Thần**: Hành nào làm mất cân bằng? Tại sao?
- Ứng dụng: màu sắc, hướng, số may mắn, ngành nghề

### 3.5. Phân tích Hợp — Xung — Hình — Hại + Thiên Can Hợp nâng cao
- Liệt kê TẤT CẢ các quan hệ Địa Chi trong tứ trụ:
  - Lục hợp (2 chi hợp nhau)
  - Tam hợp (3 chi hợp cục)
  - Tương xung (2 chi xung nhau)
  - Tương hình (3 chi hình nhau)
  - Lục hại (2 chi hại nhau)
- Ý nghĩa từng quan hệ ứng vào đời sống (VD: Nhật chi xung Nguyệt chi = xung đột nội tại, biến động tình cảm)
- **Thiên Can Hợp nâng cao (📚 ref KB Battu 2b):**
  - Xác định các cặp Can hợp trong tứ trụ (Giáp-Kỷ, Ất-Canh, Bính-Tân, Đinh-Nhâm, Mậu-Quý)
  - Kiểm tra **điều kiện hóa thành**: hợp có hóa không? (cần đủ điều kiện: tháng sinh, lực lượng)
  - **Vị trí hợp:** Niên-Nguyệt hợp (gia đình) ≠ Nhật-Thời hợp (vợ chồng-con cái) ≠ Niên-Thời hợp (tổ tiên-hậu duệ)
  - **Nhiều cặp hợp:** Nếu có ≥2 cặp (VD: Mậu-Quý ở cả Niên-Nhật lẫn Thời-Nguyệt) → phân tích ý nghĩa đặc biệt

### 3.6. Phân tích Thần Sát
- Liệt kê thần sát nguyên cục (Văn Xương, Đào Hoa, Tướng Tinh, Dịch Mã...)
- Ý nghĩa từng thần sát đối với đương số

### 3.7. Phân tích Không Vong
- **Niên Không** (Không vong theo năm): Chi nào bị rỗng?
- **Nhật Không** (Không vong theo ngày): Chi nào bị rỗng?
- Đối chiếu: Chi bị rỗng rơi vào cung nào trong Tử Vi? → Ảnh hưởng gì?

### 3.8. Phân tích Đại Vận
- Liệt kê bảng Đại vận (Can Chi, tuổi, năm bắt đầu)
- Phân tích **Đại vận ĐANG HÀNH**: Can là gì (Thập Thần gì)? Chi là gì (Ngũ hành gì)? Ảnh hưởng ra sao?
- Phân tích **2-3 Đại vận TIẾP THEO**: xu hướng tốt / xấu / thử thách
- Phân tích các **Lưu niên** quan trọng trong Đại vận hiện tại

---

## Bước 4: Đối chiếu Tử Vi ↔ Bát Tự (BẮT BUỘC — Bước quan trọng nhất)

> 📚 Tham khảo `resources/cross_reference_guide.md` cho hướng dẫn đối chiếu.

Với **MỖI KHÍA CẠNH** đời sống, tìm sự:

### 4.1. TRÙNG KHỚP — Cả hai hệ thống nói cùng 1 điều
- VD: Tang Môn (H) + Linh Tinh (H) ở cung Mệnh (TửVi) = Dậu-Dậu tự hình + Kiêu Ấn vượng (BátTự) → **CẢ HAI XÁC NHẬN** nội tâm bất an, dễ suy nghĩ tiêu cực
- VD: Liêm Phá Hãm + Tuần-Triệt ở Tử Tức (TửVi) = Kiêu Thần Đoạt Thực (BátTự) → **CẢ HAI XÁC NHẬN** đường con cái gian nan

### 4.2. BỔ SUNG — Một hệ thống bổ sung thông tin mà hệ kia không có
- VD: Bát Tự cho biết cụ thể Hỏa (Tài tinh) cực nhược → giải thích rõ hơn TẠI SAO cung Tài Bạch (Tử Vi) lại bấp bênh
- VD: Tử Vi cho biết cụ thể ngành nghề phù hợp (Cơ Lương → y dược, giáo dục) → Bát Tự bổ sung Dụng Thần Mộc → Thực Thương thoát tú

### 4.3. MÂU THUẪN — Hai hệ thống nói khác nhau (hiếm nhưng cần xử lý)
- Nếu phát hiện mâu thuẫn → nêu rõ cả hai góc nhìn, giải thích tại sao có sự khác biệt
- Đưa ra nhận định tổng hợp cân bằng

### 4.4. Ánh xạ Không Vong BT → Cung Tử Vi (BẮT BUỘC — 📚 ref cross_ref Section 4)
- **Từ lá số BT:** Xác định Niên Không và Nhật Không (2 chi bị rỗng)
- **Ánh xạ sang TV:** Dùng quy trình step-by-step trong cross_reference_guide → tìm chi rỗng nằm ở cung TV nào
- **Đánh giá:** Cung TV bị Không Vong → ý nghĩa giảm nhẹ (nếu cung xấu) hoặc suy yếu (nếu cung tốt)
- **Ví dụ:** Nhật Không tại Dậu → Dậu = cung Quan Lộc → sự nghiệp có yếu tố "hữu danh vô thực" ban đầu, nhưng chỉ là rỗng nhất thời

**Format đối chiếu mỗi khía cạnh:**
```markdown
#### Đối chiếu [Khía cạnh X]:
- **Tử Vi nói:** [Tóm tắt nhận định từ cung liên quan]
- **Bát Tự nói:** [Tóm tắt nhận định từ phân tích Tứ Trụ]
- **Kết luận chéo:** [Trùng khớp / Bổ sung / Mâu thuẫn] — [Giải thích]
```

---

## Bước 5: Luận giải theo khía cạnh đời sống

### Chế độ Full Report — Multi-file Output (4 file)

Full Report **BẮT BUỘC** xuất ra **4 file riêng biệt** thay vì 1 file lớn, theo thứ tự:

1. **File `01_ban_the.md`** — Bản thể & Sức khỏe
   - Template: `resources/template_01_ban_the.md`
   - Phạm vi: Mệnh, Thân cư, Tật Ách, Phúc Đức, Vòng Thái Tuế
   
2. **File `02_quan_he_tai_loc.md`** — Quan hệ & Tài lộc
   - Template: `resources/template_02_quan_he_tai_loc.md`
   - Phạm vi: Phu Thê, Tử Tức, Phụ Mẫu, Huynh Đệ, Tài Bạch, Điền Trạch, Quan Lộc, Nô Bộc, Thiên Di

3. **File `03_van_trinh.md`** — Vận trình & Lời khuyên
   - Template: `resources/template_03_van_trinh.md`
   - Phạm vi: Đại hạn TV, Đại vận BT, Lưu niên, Hóa giải, Phong thủy

4. **File `00_tong_hop.md`** — Tổng hợp (VIẾT CUỐI CÙNG)
   - Template: `resources/template_00_tong_hop.md`
   - Phạm vi: Thông tin cơ bản, Sơ đồ 12 cung, Tứ Trụ tóm tắt, **Tổng hợp cross-reference**, Điểm mạnh/yếu, Lời khuyên tổng quát, Link đến 3 file chi tiết

> **Lưu ý thứ tự:** Viết file 01 → 02 → 03 trước (chi tiết), rồi viết file 00 cuối cùng (để tổng hợp từ các file đã viết, đảm bảo cross-reference chính xác).

> **Về vị trí file:** Tất cả 4 file đặt trong cùng 1 thư mục output. VD: `tuvi/nguyen_quang_huy/`

### Chế độ Deep Dive — 1 file duy nhất

- Template: `resources/report_template_deep.md`
- Đào sâu 1-2 khía cạnh cụ thể, không cần chia file
- Vẫn giữ nguyên cơ chế 1 file vì Deep Dive ngắn hơn Full Report

### Yêu cầu chung cho MỌI khía cạnh:
- Phân tích cả **MẶT TÍCH CỰC** và **MẶT TIÊU CỰC** — cân bằng, khách quan
- Mỗi khía cạnh PHẢI có phần **Đối chiếu Bát Tự** (bước 4)
- Mỗi khía cạnh PHẢI kết thúc bằng **📌 Kết luận** ngắn gọn + **Lời khuyên thực tiễn**

---

## Bước 6: Dự báo vận trình theo dòng thời gian

### 6.0. Xác nhận quá khứ (BẮT BUỘC)
- Phân tích ≥ 2-3 **Đại hạn ĐÃ QUA** → liệt kê ≥ 3 sự kiện dự đoán ngược
- Mỗi sự kiện phải có "bằng chứng" từ cả TV lẫn BT
- Giúp đương số verify lá số bằng cách nhận ra sự kiện đã xảy ra

### 6.1. Phân tích Đại hạn Tử Vi — TPTC Đại Hạn BẮT BUỘC (📚 ref KB Section 12.4 + cross_ref Section 6)
1. Phân tích **Đại hạn ĐANG HÀNH** — chi tiết nhất:
   - Sao tọa cung đại hạn + trạng thái + Tứ Hóa
   - **TPTC Đại Hạn (BẮT BUỘC):** Tam hợp (Quan Lộc ĐH + Tài Bạch ĐH) + Xung chiếu (Thiên Di ĐH) → liệt kê sao chiếu về, đánh giá cát/hung cán cân
   - Tuần/Triệt có lọt vào tam phương đại hạn không?
2. Phân tích **2-3 Đại hạn TIẾP THEO** — xu hướng tổng quan + TPTC tóm tắt

### 6.2. Đối chiếu Đại Vận Bát Tự
- Bảng đối chiếu song song: Đại hạn TV | Đại vận BT | Kết luận
- Xác nhận trùng khớp hay mâu thuẫn

### 6.3. Phân tích Lưu niên (📚 ref KB Section 14)
- **Lưu niên BT:** Can Chi năm → tương tác gì với nguyên cục? Xung/Hợp/Hình/Hại gì?
- **Lưu niên TV — BẮT BUỘC tra sao lưu niên:**
  - **Lưu Tứ Hóa:** Tra theo Can năm → 4 sao nhận Hóa → bay vào cung nào? Kích hoạt gì?
  - **Lưu Lộc Tồn:** Tra theo Can năm → tọa cung nào?
  - **Lưu Hồng Loan / Lưu Thiên Hỷ:** Tra theo Chi năm → duyên hôn nhân năm đó
  - **Lưu Thiên Mã:** Tra theo Chi năm → di chuyển, đổi nhà, xuất ngoại
- Dự báo theo **quý** (Q1-Q4) hoặc tối thiểu **nửa năm** (T1-T6, T7-T12)

### 6.4. Timeline tổng hợp
4. Tạo **bảng timeline** tổng hợp: năm → sự kiện tài chính + tình duyên + sức khỏe
5. (Nếu Deep Dive) Tạo **biểu đồ dòng chảy** text-based:
```
     Tiền vận               Trung vận                 Hậu vận
   (Dưới Xt)              (X-Yt)                    (Yt trở đi)
        │                      │                          │
   ─────┤                      │                          │
        │  ▁▁▂▂▃              │  ▃▄▅▆▇                   │  ████████
        │  [Mô tả]            │  [Mô tả]                 │  [Mô tả]
```

---

## Bước 7: Tổng hợp & Lời khuyên

1. **Điểm mạnh nổi bật** — liệt kê 5-7 điểm sáng nhất, kèm viện dẫn sao/cung/hành cụ thể
2. **Điểm cần chú ý** — liệt kê 5-7 điểm cần cẩn trọng, kèm viện dẫn cụ thể
3. **Lời khuyên theo từng giai đoạn:**
   - Giai đoạn hiện tại (dựa trên Đại vận đang hành)
   - Về sự nghiệp
   - Về tình duyên
   - Về tài chính
   - Về sức khỏe
   - Về tâm linh & phong thủy (hướng, màu, số theo Dụng/Hỷ Thần)
4. Kết thúc bằng câu khích lệ tích cực (không hù dọa)

---

## Bước 8: Verify & Confidence — Kiểm tra chất lượng

Trước khi giao output, tự kiểm tra:

### 8.1. Checklist kiểm tra tính nhất quán:
- [ ] Mỗi chính tinh có ghi trạng thái (M/V/Đ/B/H)?
- [ ] Tuần/Triệt được phân tích đầy đủ ở mọi cung bị ảnh hưởng?
- [ ] Mỗi khía cạnh có phần Đối chiếu TV ↔ BT?
- [ ] Mỗi khía cạnh có Kết luận + Lời khuyên?
- [ ] Phân tích cân bằng tích cực/tiêu cực (không toàn tốt, không toàn xấu)?
- [ ] Không có sao nào bị liệt kê sai cung? (cross-check với input)
- [ ] Trạng thái sao khớp với input (không ghi Miếu khi input ghi Hãm)?
- [ ] Dụng Thần xác định hợp lý? (Thân vượng → tiết khí/khắc thân, Thân nhược → sinh trợ)

### 8.2. Confidence Score:
- 🟢 **Cao (≥80%)**: Có đầy đủ lá số TV + BT, đối chiếu chéo hoàn chỉnh, không phát hiện mâu thuẫn → Giao output
- 🟡 **Trung bình (50-79%)**: Chỉ có 1 trong 2 lá số, hoặc phát hiện 1-2 điểm chưa rõ → Đánh dấu ⚠️, giao kèm cảnh báo
- 🔴 **Thấp (<50%)**: Thiếu quá nhiều dữ liệu, sao không rõ trạng thái → HỎI LẠI user

---

# Examples

> 📚 Xem ví dụ chi tiết đầy đủ tại thư mục `examples/`:

## Ví dụ 1: Full Report — Luận giải tổng hợp

**Context:** User cung cấp lá số Tử Vi + Bát Tự, yêu cầu phân tích toàn diện.

**Input:**
- File `examples/example_input_tuvi.md` (Lá số Tử Vi — Lê Thị Minh Châu)
- File `examples/example_input_battu.md` (Lá số Bát Tự — Lê Thị Minh Châu)
- Yêu cầu: "Luận giải tổng hợp tử vi bát tự cho em"

**Output:** 4 file trong thư mục `examples/`:
  - `00_tong_hop.md` — Tổng hợp & Tổng quan + link 3 file chi tiết
  - `01_ban_the.md` — Mệnh + Thân + Tật Ách + Phúc Đức
  - `02_quan_he_tai_loc.md` — Phu Thê + Tử Tức + Tài Bạch + Quan Lộc + ...
  - `03_van_trinh.md` — Đại hạn + Lưu niên + Hóa giải

---

## Ví dụ 2: Deep Dive — Phân tích chuyên sâu Tình Duyên & Tài Bạch

**Context:** User đã có bản luận giải tổng hợp, muốn đào sâu 2 khía cạnh cụ thể.

**Input:**
- File `examples/example_input_tuvi.md` (Lá số Tử Vi)
- File `examples/example_input_battu.md` (Lá số Bát Tự)
- Yêu cầu: "Phân tích chuyên sâu tình duyên và tài bạch cho em"

**Output:**
- File `examples/example_output_deep.md` — Bản phân tích chuyên sâu:
  - PHẦN 1: Tình duyên (timeline tiền hôn nhân → chuyển giao → hình ảnh bạn đời → nghệ thuật gìn giữ)
  - PHẦN 2: Tài bạch (timeline xây dựng → chuyển giao → thu hoạch + ngành nghề)
  - PHẦN 3: Biểu đồ dòng chảy + Bảng mốc thời gian
  - Tổng kết: Thông điệp cốt lõi

---

# Constraints

## Về tính chính xác
- 🚫 **TUYỆT ĐỐI KHÔNG** bịa sao không có trong lá số, hoặc gán sai trạng thái (Miếu thành Hãm, Hãm thành Vượng)
- 🚫 **KHÔNG ĐƯỢC** phân tích sao mà không đặt trong ngữ cảnh cung + cách cục + trạng thái
- 🚫 **KHÔNG ĐƯỢC** tự suy diễn Tứ Hóa, Tuần/Triệt nếu input không ghi rõ
- ✅ **LUÔN LUÔN** ghi rõ trạng thái Miếu (M) / Vượng (V) / Đắc (Đ) / Bình (B) / Hãm (H) của mỗi chính tinh
- ✅ **LUÔN LUÔN** cross-check sao và trạng thái với dữ liệu input trước khi viết luận giải

## Về tính toàn diện
- 🚫 **KHÔNG ĐƯỢC** phân tích Tử Vi và Bát Tự rời rạc thuần túy — BẮT BUỘC có bước đối chiếu chéo (Bước 4)
- 🚫 **KHÔNG ĐƯỢC** bỏ qua Tuần/Triệt khi chúng án ngữ tại cung đang phân tích
- 🚫 **KHÔNG ĐƯỢC** bỏ qua Không Vong (Niên Không, Nhật Không) trong Bát Tự
- 🚫 **KHÔNG ĐƯỢC** bỏ qua TPTC Đại Hạn khi đánh giá vận trình — BẮT BUỘC phân tích Tam Phương Tứ Chính cho mỗi đại hạn quan trọng
- 🚫 **KHÔNG ĐƯỢC** dự báo lưu niên mà KHÔNG tra sao Lưu Niên TV (Lưu Tứ Hóa, Lưu Lộc Tồn, Lưu Hồng Loan, Lưu Thiên Mã)
- ✅ **LUÔN LUÔN** phân tích cả cát tinh LẪN hung tinh — cân bằng hai mặt
- ✅ **LUÔN LUÔN** phân tích cung chiếu và tam hợp, không chỉ phân tích sao trong cung
- ✅ **LUÔN LUÔN** ánh xạ Không Vong BT → Cung TV khi đối chiếu chéo (Bước 4.4)

## Về giọng văn & đạo đức
- 🚫 **TUYỆT ĐỐI KHÔNG** đưa ra nhận định tiêu cực cực đoan mà KHÔNG kèm hướng hóa giải / lời khuyên tích cực
- 🚫 **KHÔNG ĐƯỢC** hù dọa đương số (VD: "lá số xấu, cuộc đời bi đát" — CẤM)
- 🚫 **KHÔNG ĐƯỢC** đưa ra dự đoán "chắc chắn" về sự kiện cụ thể (VD: "năm X chắc chắn ly hôn")
- ✅ **LUÔN LUÔN** giữ giọng văn **chuyên nghiệp, khách quan, xây dựng, tích cực**
- ✅ **LUÔN LUÔN** kết thúc mỗi cung/khía cạnh bằng Kết luận + Lời khuyên thực tiễn
- ✅ **LUÔN LUÔN** dùng cụm từ "xu hướng", "có khả năng", "cần chú ý" thay vì "chắc chắn xảy ra"
- ✅ **LUÔN LUÔN** kết thúc bản luận giải bằng câu khích lệ: "Mệnh do Trời định, vận do mình tạo"

## Về cấu trúc output
- ✅ **LUÔN LUÔN** phân tích theo dòng thời gian (tiền vận → trung vận → hậu vận)
- ✅ **LUÔN LUÔN** sử dụng bảng, emoji, heading markdown để dễ đọc
- ✅ **LUÔN LUÔN** ghi rõ nguồn nhận định (từ sao nào, cung nào, hành nào)
- ✅ **LUÔN LUÔN** chạy Verify checklist (Bước 8) trước khi giao output
- ✅ **Full Report:** BẮt buộc xuất ra **4 file riêng biệt** (01, 02, 03, 00) thay vì 1 file. Viết file 01→02→03 trước, 00 cuối cùng
- ✅ **Deep Dive:** Vẫn giữ 1 file duy nhất (không cần chia)

## Về dữ liệu cá nhân
- 🚫 **KHÔNG ĐƯỢC** lưu trữ hoặc chia sẻ thông tin cá nhân đương số ra ngoài phạm vi phân tích
- ✅ **LUÔN LUÔN** ghi lưu ý cuối bài: "Tài liệu mang tính tham khảo, không phải bản án cố định"

<!-- Generated by Skill Generator v3.2 -->
