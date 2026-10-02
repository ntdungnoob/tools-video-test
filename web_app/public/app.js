document.addEventListener('DOMContentLoaded', () => {
  const SCALE = 324 / 720; // 0.45: phone viewport scale (324x576 vs 720x1280)

  // Initial Default Layers matching the luxury invitation
  let layers = [
    {
      id: "layer_1",
      text: "DEAR {NAME}",
      y: 170,
      x: 0,
      font_family: "sans_bold",
      font_size: 38,
      color: "#ffffff",
      align: "center",
      is_dynamic: true,
      animation: "slide_up",
      uppercase: true,
      shadow: true
    },
    {
      id: "layer_2",
      text: "KARVE MEILLEUR CORDIALLY INVITES YOU\nTO THE OPENING OF OUR FIRST STORE\nIN HO CHI MINH CITY.",
      y: 390,
      x: 0,
      font_family: "sans_bold",
      font_size: 18,
      color: "#f5f5f5",
      align: "center",
      is_dynamic: false,
      animation: "none",
      uppercase: true,
      shadow: true
    },
    {
      id: "layer_3",
      text: "KARVE MEILLEUR",
      y: 620,
      x: 0,
      font_family: "serif_bold",
      font_size: 46,
      color: "#ffffff",
      align: "center",
      is_dynamic: false,
      animation: "none",
      uppercase: true,
      shadow: true
    },
    {
      id: "layer_4",
      text: "DATE: JANUARY 13, 2026",
      y: 790,
      x: 0,
      font_family: "sans_bold",
      font_size: 16,
      color: "#ececec",
      align: "center",
      is_dynamic: false,
      animation: "none",
      uppercase: true,
      shadow: true
    },
    {
      id: "layer_5",
      text: "LOCATION: RUE MICHE  L'EDITION,\nUNION SQUARE, LEVEL B3.\n171 DONG KHOI ST, DISTRICT 1. HCMC.",
      y: 870,
      x: 0,
      font_family: "sans_bold",
      font_size: 15,
      color: "#ececec",
      align: "center",
      is_dynamic: false,
      animation: "none",
      uppercase: true,
      shadow: true
    },
    {
      id: "layer_6",
      text: "KARVEMEILLEUR.COM",
      y: 1100,
      x: 0,
      font_family: "sans_bold",
      font_size: 13,
      color: "#b0b0b0",
      align: "center",
      is_dynamic: false,
      animation: "none",
      uppercase: true,
      shadow: true
    }
  ];

  let selectedLayerId = "layer_1";
  let currentVideoUrl = "/assets/gemini_generated_video_9e6c76b5.mp4";

  // Elements
  const layersContainer = document.getElementById('layersContainer');
  const activeCoordDisplay = document.getElementById('activeCoordDisplay');
  const bgVideo = document.getElementById('bgVideo');
  const bgVideoUpload = document.getElementById('bgVideoUpload');
  const btnAddText = document.getElementById('btnAddText');
  const btnAddText2 = document.getElementById('btnAddText2');
  const btnReplayAnim = document.getElementById('btnReplayAnim');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Inspector Elements
  const inspectorLayerType = document.getElementById('inspectorLayerType');
  const inspectorLayerId = document.getElementById('inspectorLayerId');
  const layerText = document.getElementById('layerText');
  const layerIsDynamic = document.getElementById('layerIsDynamic');
  const sliderY = document.getElementById('sliderY');
  const sliderX = document.getElementById('sliderX');
  const lblY = document.getElementById('lblY');
  const lblX = document.getElementById('lblX');
  const layerFont = document.getElementById('layerFont');
  const sliderFontSize = document.getElementById('sliderFontSize');
  const lblFontSize = document.getElementById('lblFontSize');
  const layerColor = document.getElementById('layerColor');
  const layerColorHex = document.getElementById('layerColorHex');
  const layerAnim = document.getElementById('layerAnim');
  const sliderAnimDelay = document.getElementById('sliderAnimDelay');
  const lblAnimDelay = document.getElementById('lblAnimDelay');
  const colAnimDelay = document.getElementById('colAnimDelay');
  const layerUppercase = document.getElementById('layerUppercase');
  const alignBtns = document.querySelectorAll('.align-btn');
  const presetPills = document.querySelectorAll('.pill-btn');
  const btnDuplicateLayer = document.getElementById('btnDuplicateLayer');
  const btnDeleteLayer = document.getElementById('btnDeleteLayer');

  // Tab 2: Layers List
  const layersList = document.getElementById('layersList');
  const layerCount = document.getElementById('layerCount');

  // Tab 3: Batch
  const namesTextarea = document.getElementById('namesTextarea');
  const nameCounter = document.getElementById('nameCounter');
  const durationSelect = document.getElementById('durationSelect');
  const batchSizeSelect = document.getElementById('batchSizeSelect');
  const useGpuToggle = document.getElementById('useGpuToggle');
  const btnRenderBatch = document.getElementById('btnRenderBatch');
  const batchResultsSection = document.getElementById('batchResultsSection');
  const progressBar = document.getElementById('progressBar');
  const progressStatus = document.getElementById('progressStatus');
  const resultsGrid = document.getElementById('resultsGrid');
  const btnClearTemp = document.getElementById('btnClearTemp');

  function getCssFont(fontKey) {
    if (fontKey.startsWith('serif')) {
      return "'Cinzel', Georgia, serif";
    }
    if (fontKey.startsWith('mono')) {
      return "monospace";
    }
    return "'Outfit', -apple-system, sans-serif";
  }

  // Render Canvas Layers
  function renderCanvas() {
    layersContainer.innerHTML = '';
    const sampleNames = getNamesList();
    const sampleGuest = sampleNames.length > 0 ? sampleNames[0] : "NGUYỄN VĂN A";

    layers.forEach(layer => {
      const el = document.createElement('div');
      el.className = `canvas-layer-item ${layer.id === selectedLayerId ? 'selected' : ''}`;
      el.id = `el_${layer.id}`;

      el.style.top = `${layer.y * SCALE}px`;
      el.style.left = `${layer.x * SCALE}px`;
      el.style.fontSize = `${layer.font_size * SCALE}px`;
      el.style.color = layer.color;
      el.style.textAlign = layer.align;
      el.style.fontFamily = getCssFont(layer.font_family);
      el.style.fontWeight = layer.font_family.includes('bold') ? '700' : '400';
      el.style.textShadow = layer.shadow ? '0 2px 5px rgba(0,0,0,0.85)' : 'none';

      if (layer.animation && layer.animation !== 'none') {
        el.classList.add(`anim-${layer.animation}`);
        const delay = layer.delay !== undefined ? Number(layer.delay) : 0.8;
        el.style.animationDelay = `${delay}s`;
      }

      let displayContent = layer.text;
      if (layer.is_dynamic) {
        const guestName = layer.uppercase ? sampleGuest.toUpperCase() : sampleGuest;
        if (displayContent.includes('{NAME}')) {
          displayContent = displayContent.replace('{NAME}', guestName);
        } else {
          displayContent = `${displayContent} ${guestName}`.trim();
        }
      } else if (layer.uppercase) {
        displayContent = displayContent.toUpperCase();
      }

      el.innerHTML = displayContent.replace(/\n/g, '<br>');

      setupDrag(el, layer);

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectLayer(layer.id);
      });

      layersContainer.appendChild(el);
    });

    updateLayersListTab();
    updateCoordDisplay();
  }

  // Drag and Drop
  function setupDrag(element, layer) {
    let isDragging = false;
    let startMouseX = 0, startMouseY = 0;
    let initialLayerX = 0, initialLayerY = 0;

    element.addEventListener('mousedown', (e) => {
      isDragging = true;
      selectLayer(layer.id);
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      initialLayerX = layer.x;
      initialLayerY = layer.y;
      e.preventDefault();

      const onMouseMove = (moveEvt) => {
        if (!isDragging) return;
        const deltaX = (moveEvt.clientX - startMouseX) / SCALE;
        const deltaY = (moveEvt.clientY - startMouseY) / SCALE;

        layer.x = Math.round(initialLayerX + deltaX);
        layer.y = Math.round(Math.max(10, Math.min(1250, initialLayerY + deltaY)));

        element.style.top = `${layer.y * SCALE}px`;
        element.style.left = `${layer.x * SCALE}px`;

        sliderY.value = layer.y;
        lblY.textContent = `${layer.y}px`;
        sliderX.value = layer.x;
        lblX.textContent = `${layer.x}px`;
        updateCoordDisplay();
      };

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  function selectLayer(id) {
    selectedLayerId = id;
    const layer = layers.find(l => l.id === id);
    if (!layer) return;

    document.querySelectorAll('.canvas-layer-item').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById(`el_${id}`);
    if (el) el.classList.add('selected');

    inspectorLayerId.textContent = `#${layer.id}`;
    inspectorLayerType.textContent = layer.is_dynamic ? "LỚP TÊN KHÁCH MỜI" : "LỚP VĂN BẢN";
    layerText.value = layer.text;
    layerIsDynamic.checked = layer.is_dynamic;
    sliderY.value = layer.y;
    lblY.textContent = `${layer.y}px`;
    sliderX.value = layer.x;
    lblX.textContent = `${layer.x}px`;
    layerFont.value = layer.font_family;
    sliderFontSize.value = layer.font_size;
    lblFontSize.textContent = `${layer.font_size}px`;
    layerColor.value = layer.color;
    layerColorHex.value = layer.color.toUpperCase();
    layerAnim.value = layer.animation || "none";
    const curDelay = layer.delay !== undefined ? Number(layer.delay) : (layer.animation && layer.animation !== 'none' ? 0.8 : 0);
    sliderAnimDelay.value = curDelay;
    lblAnimDelay.textContent = `${curDelay.toFixed(1)}s`;
    const hasAnim = layer.animation && layer.animation !== 'none';
    colAnimDelay.style.opacity = hasAnim ? '1' : '0.4';
    sliderAnimDelay.disabled = !hasAnim;
    layerUppercase.checked = layer.uppercase;

    alignBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === layer.align);
    });

    updateLayersListTab();
    updateCoordDisplay();
  }

  function updateCoordDisplay() {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      activeCoordDisplay.innerHTML = `Lớp đang chọn: <strong>#${layer.id}</strong> (X: ${layer.x}px, Y: ${layer.y}px)`;
    } else {
      activeCoordDisplay.textContent = "Chưa chọn lớp nào";
    }
  }

  // Inspector Input Listeners
  layerText.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.text = layerText.value;
      renderCanvas();
    }
  });

  layerIsDynamic.addEventListener('change', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.is_dynamic = layerIsDynamic.checked;
      inspectorLayerType.textContent = layer.is_dynamic ? "LỚP TÊN KHÁCH MỜI" : "LỚP VĂN BẢN";
      renderCanvas();
    }
  });

  sliderY.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.y = parseInt(sliderY.value, 10);
      lblY.textContent = `${layer.y}px`;
      const el = document.getElementById(`el_${layer.id}`);
      if (el) el.style.top = `${layer.y * SCALE}px`;
      updateCoordDisplay();
    }
  });

  sliderX.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.x = parseInt(sliderX.value, 10);
      lblX.textContent = `${layer.x}px`;
      const el = document.getElementById(`el_${layer.id}`);
      if (el) el.style.left = `${layer.x * SCALE}px`;
      updateCoordDisplay();
    }
  });

  sliderFontSize.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.font_size = parseInt(sliderFontSize.value, 10);
      lblFontSize.textContent = `${layer.font_size}px`;
      renderCanvas();
    }
  });

  layerFont.addEventListener('change', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.font_family = layerFont.value;
      renderCanvas();
    }
  });

  layerColor.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.color = layerColor.value;
      layerColorHex.value = layerColor.value.toUpperCase();
      renderCanvas();
    }
  });

  layerColorHex.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer && /^#[0-9A-F]{6}$/i.test(layerColorHex.value)) {
      layer.color = layerColorHex.value;
      layerColor.value = layerColorHex.value;
      renderCanvas();
    }
  });

  layerAnim.addEventListener('change', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.animation = layerAnim.value;
      const hasAnim = layer.animation !== 'none';
      colAnimDelay.style.opacity = hasAnim ? '1' : '0.4';
      sliderAnimDelay.disabled = !hasAnim;
      if (hasAnim && layer.delay === undefined) {
        layer.delay = 0.8;
        sliderAnimDelay.value = 0.8;
        lblAnimDelay.textContent = "0.8s";
      }
      renderCanvas();
    }
  });

  sliderAnimDelay.addEventListener('input', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.delay = parseFloat(sliderAnimDelay.value);
      lblAnimDelay.textContent = `${layer.delay.toFixed(1)}s`;
      renderCanvas();
    }
  });

  layerUppercase.addEventListener('change', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (layer) {
      layer.uppercase = layerUppercase.checked;
      renderCanvas();
    }
  });

  alignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const layer = layers.find(l => l.id === selectedLayerId);
      if (layer) {
        layer.align = btn.dataset.align;
        alignBtns.forEach(b => b.classList.toggle('active', b === btn));
        renderCanvas();
      }
    });
  });

  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const layer = layers.find(l => l.id === selectedLayerId);
      if (layer) {
        if (pill.dataset.pos === 'top') layer.y = 170;
        else if (pill.dataset.pos === 'middle') layer.y = 580;
        else if (pill.dataset.pos === 'bottom') layer.y = 1180;
        layer.x = 0;
        sliderY.value = layer.y;
        lblY.textContent = `${layer.y}px`;
        sliderX.value = layer.x;
        lblX.textContent = `${layer.x}px`;
        renderCanvas();
      }
    });
  });

  btnDuplicateLayer.addEventListener('click', () => {
    const layer = layers.find(l => l.id === selectedLayerId);
    if (!layer) return;
    const newId = `layer_${Date.now()}`;
    const newLayer = JSON.parse(JSON.stringify(layer));
    newLayer.id = newId;
    newLayer.y = Math.min(1200, layer.y + 40);
    newLayer.is_dynamic = false;
    layers.push(newLayer);
    selectLayer(newId);
    renderCanvas();
  });

  btnDeleteLayer.addEventListener('click', () => {
    if (layers.length <= 1) {
      alert("Cần giữ ít nhất 1 lớp trên video!");
      return;
    }
    layers = layers.filter(l => l.id !== selectedLayerId);
    selectLayer(layers[0].id);
    renderCanvas();
  });

  function addNewLayer() {
    const newId = `layer_${Date.now()}`;
    const newLayer = {
      id: newId,
      text: "VĂN BẢN MỚI",
      y: 500,
      x: 0,
      font_family: "sans_bold",
      font_size: 32,
      color: "#ffffff",
      align: "center",
      is_dynamic: false,
      animation: "none",
      uppercase: true,
      shadow: true
    };
    layers.push(newLayer);
    selectLayer(newId);
    renderCanvas();
    switchTab('inspectorTab');
  }

  btnAddText.addEventListener('click', addNewLayer);
  btnAddText2.addEventListener('click', addNewLayer);

  function updateLayersListTab() {
    layerCount.textContent = layers.length;
    layersList.innerHTML = '';
    layers.forEach(layer => {
      const row = document.createElement('div');
      row.className = `layer-list-row ${layer.id === selectedLayerId ? 'active' : ''}`;
      row.innerHTML = `
        <div class="layer-row-left">
          <span class="layer-type-tag">${layer.is_dynamic ? 'TÊN KHÁCH' : 'VĂN BẢN'}</span>
          <span class="layer-row-preview">${layer.text.replace(/\n/g, ' ')}</span>
        </div>
        <span class="badge">Y: ${layer.y}px</span>
      `;
      row.addEventListener('click', () => {
        selectLayer(layer.id);
        switchTab('inspectorTab');
      });
      layersList.appendChild(row);
    });
  }

  function switchTab(targetId) {
    tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === targetId));
    tabContents.forEach(content => content.classList.toggle('active', content.id === targetId));
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  btnReplayAnim.addEventListener('click', () => {
    bgVideo.currentTime = 0;
    bgVideo.play();
    renderCanvas();
  });

  bgVideoUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const btnLabel = document.querySelector('.btn-upload span');
    btnLabel.textContent = '⏳ Đang tải video lên...';

    try {
      const res = await fetch('/api/upload-video', {
        method: 'POST',
        body: file
      });
      const data = await res.json();
      if (data.success) {
        currentVideoUrl = data.url;
        bgVideo.src = data.url;
        bgVideo.load();
        bgVideo.play();
        btnLabel.textContent = '✅ Đã đổi video nền!';
        setTimeout(() => { btnLabel.textContent = '📁 Đổi Video Nền (.mp4)'; }, 3000);
      }
    } catch (err) {
      alert("Lỗi tải video lên: " + err.message);
      btnLabel.textContent = '📁 Đổi Video Nền (.mp4)';
    }
  });

  function getNamesList() {
    return namesTextarea.value.split('\n').map(l => l.trim()).filter(Boolean);
  }

  namesTextarea.addEventListener('input', () => {
    const names = getNamesList();
    nameCounter.textContent = `${names.length} người`;
    renderCanvas();
  });

  // TAB 3: Batch Render Action
  btnRenderBatch.addEventListener('click', async () => {
    const names = getNamesList();
    if (names.length === 0) {
      alert("Vui lòng nhập ít nhất 1 tên khách mời vào danh sách!");
      return;
    }

    const batchSize = parseInt(batchSizeSelect ? batchSizeSelect.value : 8, 10);
    const useGpu = useGpuToggle ? useGpuToggle.checked : false;
    const payload = {
      video_url: currentVideoUrl,
      layers: layers,
      names: names,
      duration: parseInt(durationSelect.value, 10),
      batch_size: batchSize,
      use_gpu: useGpu
    };

    btnRenderBatch.disabled = true;
    btnRenderBatch.querySelector('.btn-text').textContent = 'ĐANG XỬ LÝ RENDER THEO ĐỢT...';
    batchResultsSection.style.display = 'block';
    progressBar.style.width = '30%';
    const modeLabel = useGpu ? '⚡ GPU (VAAPI)' : '🖥️ CPU (ultrafast)';
    progressStatus.textContent = `[${modeLabel}] Đang render ${names.length} video theo từng đợt ${batchSize} video...`;
    resultsGrid.innerHTML = '';

    try {
      const response = await fetch('/api/render-advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Lỗi server: ${response.statusText}`);
      }

      const data = await response.json();
      progressBar.style.width = '100%';
      progressStatus.innerHTML = `🎉 <strong>Hoàn tất thành công ${data.count} video trong ${data.total_time}s!</strong> (Tốc độ TB: ${data.avg_time}s/video | ZIP: ${data.zip_size_mb} MB)`;

      // Display Sample Preview + Direct List (Super responsive, 0 lag)
      let sampleHtml = '';
      if (data.sample_preview_url) {
        sampleHtml = `
          <div style="grid-column: 1 / -1; background: rgba(0, 196, 204, 0.1); border: 1px solid rgba(0, 196, 204, 0.3); border-radius: 8px; padding: 12px; display: flex; align-items: center; gap: 16px; margin-bottom: 10px;">
            <img src="${data.sample_preview_url}?t=${Date.now()}" style="width: 70px; height: 124px; border-radius: 6px; object-fit: cover;">
            <div>
              <h4 style="color: #fff; margin-bottom: 4px;">🎬 Video Mẫu Xem Trước (Sample)</h4>
              <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Toàn bộ ${data.count} video đã được đóng gói sẵn sàng trong file ZIP.</p>
              <a href="${data.items[0].video_url}" target="_blank" style="font-size: 12px; color: var(--canva-cyan); text-decoration: underline;">▶️ Mở xem video mẫu đầu tiên</a>
            </div>
          </div>
        `;
      }

      let cardsHtml = sampleHtml;
      // Show first 12 items for instant loading without DOM freeze
      const displayItems = data.items.slice(0, 12);
      displayItems.forEach(item => {
        cardsHtml += `
          <div class="result-card">
            <div class="result-info">
              <span class="result-title">${item.display_text}</span>
              <span class="result-meta">⏱️ ${item.render_time}s | ${payload.duration}s MP4</span>
              <a href="${item.video_url}" download="${item.filename}" class="result-download-btn">⬇️ Tải MP4</a>
            </div>
          </div>
        `;
      });

      if (data.items.length > 12) {
        cardsHtml += `
          <div style="grid-column: 1 / -1; text-align: center; padding: 10px; font-size: 12px; color: var(--text-secondary);">
            ...và ${data.items.length - 12} video khác (Hãy bấm nút <strong>📦 TẢI TRỌN BỘ .ZIP</strong> ở trên để lấy toàn bộ).
          </div>
        `;
      }

      resultsGrid.innerHTML = cardsHtml;

    } catch (err) {
      alert("Đã xảy ra lỗi: " + err.message);
      progressStatus.textContent = "❌ Có lỗi xảy ra trong quá trình render.";
      progressBar.style.width = '0%';
    } finally {
      btnRenderBatch.disabled = false;
      btnRenderBatch.querySelector('.btn-text').textContent = 'BẮT ĐẦU XUẤT TOÀN BỘ VIDEO';
    }
  });

  // Cleanup Temporary Files (manual button)
  if (btnClearTemp) {
    btnClearTemp.addEventListener('click', async () => {
      if (!confirm("Bạn có chắc chắn muốn xóa toàn bộ các video tạm để giải phóng dung lượng ổ cứng? (Hãy đảm bảo bạn đã tải file .ZIP về máy)")) {
        return;
      }
      try {
        const res = await fetch('/api/cleanup', { method: 'POST' });
        const data = await res.json();
        alert(`Đã dọn dẹp thành công! Đã xóa ${data.deleted} file video tạm.`);
        resultsGrid.innerHTML = '';
        batchResultsSection.style.display = 'none';
      } catch (err) {
        alert("Lỗi khi dọn dẹp: " + err.message);
      }
    });
  }

  // ── Auto-cleanup khi F5 / đóng tab / rời trang ──
  // sendBeacon đảm bảo request được gửi ngay cả khi trình duyệt đang unload
  window.addEventListener('pagehide', () => {
    navigator.sendBeacon('/api/cleanup');
  });

  // ── Auto-cleanup khi click nút tải ZIP (server cũng tự xóa sau 3s, đây là backup) ──
  const btnDownloadZip = document.getElementById('btnDownloadZip');
  if (btnDownloadZip) {
    btnDownloadZip.addEventListener('click', () => {
      // Đợi 5s cho trình duyệt bắt đầu tải xong rồi cập nhật UI
      setTimeout(() => {
        progressStatus.innerHTML = progressStatus.innerHTML +
          ' <span style="color:#4ade80;font-size:12px;">✅ ZIP đã tải – Video tạm sẽ tự động được dọn dẹp.</span>';
      }, 5000);
    });
  }

  // Initial Boot
  selectLayer("layer_1");
  renderCanvas();
});
