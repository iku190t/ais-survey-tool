(() => {
  "use strict";

  const isExcelPreview = new URLSearchParams(location.search).get("excelPreview") === "1";
  if (!isExcelPreview) return;
  document.body.classList.add("excelPreview");

  const marker = document.createElement("div");
  marker.id = "ezExcelMarker";
  marker.title = "指定座標（ドラッグして配置を変更）";
  wrap.appendChild(marker);

  let reference = null;
  let markerDrag = null;
  let animationFrame = 0;

  function assertLoaded() {
    if (!hasLoadedDrawing()) throw new Error("SFC図面がまだ読み込まれていません。");
  }

  function getReferenceWorld() {
    if (!reference) return null;
    const point = planeToSfcWorld(reference.xNorth, reference.yEast);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error("指定座標をSFC図面座標へ変換できませんでした。");
    }
    return point;
  }

  function updateMarker() {
    if (!reference || !hasLoadedDrawing()) {
      marker.style.display = "none";
      return;
    }
    try {
      const world = getReferenceWorld();
      const screen = worldToScreen(world.x, world.y);
      marker.style.display = "block";
      marker.style.left = `${screen[0]}px`;
      marker.style.top = `${screen[1]}px`;
    } catch (_error) {
      marker.style.display = "none";
    }
  }

  function monitorMarker() {
    updateMarker();
    animationFrame = requestAnimationFrame(monitorMarker);
  }

  function centerReference() {
    assertLoaded();
    const world = getReferenceWorld();
    const rotated = rotatePoint(world.x, world.y, rotationDeg);
    view.tx = canvas.clientWidth / 2 - rotated[0] * view.scale;
    view.ty = canvas.clientHeight / 2 + rotated[1] * view.scale;
    draw();
    updateMarker();
  }

  function axisWorldUnitsPerMeter(xNorth, yEast) {
    const origin = planeToSfcWorld(xNorth, yEast);
    const north = planeToSfcWorld(xNorth + 1, yEast);
    const east = planeToSfcWorld(xNorth, yEast + 1);
    return {
      horizontal: Math.max(1e-12, Math.hypot(east.x - origin.x, east.y - origin.y)),
      vertical: Math.max(1e-12, Math.hypot(north.x - origin.x, north.y - origin.y))
    };
  }

  async function setReferenceView(options) {
    assertLoaded();
    const xNorth = Number(options.xNorth);
    const yEast = Number(options.yEast);
    const extentWidth = Number(options.extentWidth);
    const extentHeight = Number(options.extentHeight);
    if (![xNorth, yEast, extentWidth, extentHeight].every(Number.isFinite) || !(extentWidth > 0 && extentHeight > 0)) {
      throw new Error("座標と表示範囲を正しく入力してください。");
    }
    reference = { xNorth, yEast, extentWidth, extentHeight };
    const units = axisWorldUnitsPerMeter(xNorth, yEast);
    const worldWidth = extentWidth * units.horizontal;
    const worldHeight = extentHeight * units.vertical;
    view.scale = Math.min(canvas.clientWidth / worldWidth, canvas.clientHeight / worldHeight);
    baseFitScale = Math.max(view.scale, 0.0001);
    centerReference();
    return getState();
  }

  function getState() {
    const result = {
      scale: view.scale,
      tx: view.tx,
      ty: view.ty,
      rotationDeg,
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight
    };
    if (reference) {
      const world = getReferenceWorld();
      const screen = worldToScreen(world.x, world.y);
      result.referenceScreenRatio = {
        x: screen[0] / Math.max(1, canvas.clientWidth),
        y: screen[1] / Math.max(1, canvas.clientHeight)
      };
    }
    return result;
  }

  async function loadFile(file) {
    // The file picker lives in the parent task pane while this bridge lives in
    // an iframe. A File created in another window has a different constructor,
    // so a constructor-identity check is false even though it is a valid File. Check
    // the file interface instead and pass the original object to the proven
    // viewer loader unchanged.
    const isReadableFile = file
      && typeof file.name === "string"
      && typeof file.arrayBuffer === "function"
      && typeof file.slice === "function";
    if (!isReadableFile) throw new Error("SFCファイルを選択してください。");
    await handleSelectedDrawingFile(file);
    assertLoaded();
    document.getElementById("startupModal")?.style.setProperty("display", "none", "important");
    resize(true);
    return { name: file.name, state: getState() };
  }

  async function exportPng(options) {
    assertLoaded();
    const width = Math.max(1, Math.min(4096, Math.round(Number(options.width) || 1600)));
    const height = Math.max(1, Math.min(4096, Math.round(Number(options.height) || 1000)));
    const cssWidth = Math.max(1, canvas.clientWidth);
    const cssHeight = Math.max(1, canvas.clientHeight);
    const scaleX = width / cssWidth;
    const scaleY = height / cssHeight;
    if (Math.abs(scaleX - scaleY) > Math.max(scaleX, scaleY) * 0.015) {
      throw new Error("Excel選択範囲とプレビュー枠の縦横比が一致していません。選択範囲を再取得してください。");
    }

    const oldWidth = canvas.width;
    const oldHeight = canvas.height;
    try {
      canvas.width = width;
      canvas.height = height;
      ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      draw();
      const dataUrl = canvas.toDataURL("image/png");
      return { dataUrl, width, height, reference: reference ? { ...reference } : null, view: getState() };
    } finally {
      canvas.width = oldWidth;
      canvas.height = oldHeight;
      resize(true);
      updateMarker();
    }
  }

  marker.addEventListener("pointerdown", event => {
    event.preventDefault();
    marker.setPointerCapture(event.pointerId);
    markerDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });
  marker.addEventListener("pointermove", event => {
    if (!markerDrag || markerDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - markerDrag.x;
    const dy = event.clientY - markerDrag.y;
    markerDrag.x = event.clientX;
    markerDrag.y = event.clientY;
    view.tx += dx;
    view.ty += dy;
    draw();
    updateMarker();
  });
  const endMarkerDrag = event => {
    if (markerDrag?.pointerId === event.pointerId) markerDrag = null;
  };
  marker.addEventListener("pointerup", endMarkerDrag);
  marker.addEventListener("pointercancel", endMarkerDrag);

  window.EzSfcExcelBridge = {
    loadFile,
    setReferenceView,
    centerReference: async () => centerReference(),
    getState: async () => getState(),
    exportPng,
    resize: async () => {
      updateWrapLayout();
      resize(true);
      updateMarker();
      return getState();
    }
  };

  updateWrapLayout();
  resize(false);
  cancelAnimationFrame(animationFrame);
  monitorMarker();

  // Local smoke-test entry point. It is inert in normal Excel use and exists
  // only to exercise the real loader/renderer/export path without an OS file
  // picker in automated browser verification.
  if (new URLSearchParams(location.search).get("smoke") === "1") {
    const smokeStatus = document.createElement("div");
    smokeStatus.id = "ezExcelSmokeStatus";
    smokeStatus.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2000;padding:7px 10px;border-radius:7px;background:#172b47;color:#fff;font:12px sans-serif";
    smokeStatus.textContent = "SMOKE: RUNNING";
    document.body.appendChild(smokeStatus);
    (async () => {
      try {
        const response = await fetch("sample.sfc");
        if (!response.ok) throw new Error(`sample.sfc: ${response.status}`);
        const sample = new File([await response.blob()], "sample.sfc", { type: "text/plain" });
        await loadFile(sample);
        const bounds = getLoadedSfcBoundsWorld();
        if (!bounds) throw new Error("drawing bounds unavailable");
        const center = sfcWorldToPlane(bounds.cx, bounds.cy);
        const widthMeters = Math.max(1, Math.abs(sfcWorldToPlane(bounds.maxX, bounds.cy).yEast - sfcWorldToPlane(bounds.minX, bounds.cy).yEast));
        const heightMeters = Math.max(1, Math.abs(sfcWorldToPlane(bounds.cx, bounds.maxY).xNorth - sfcWorldToPlane(bounds.cx, bounds.minY).xNorth));
        await setReferenceView({ xNorth: center.xNorth, yEast: center.yEast, extentWidth: widthMeters, extentHeight: heightMeters });
        const exportWidth = 1200;
        const exportHeight = Math.max(1, Math.round(exportWidth * canvas.clientHeight / canvas.clientWidth));
        const result = await exportPng({ width: exportWidth, height: exportHeight });
        if (!result.dataUrl.startsWith("data:image/png;base64,") || result.dataUrl.length < 10000) throw new Error("PNG output is empty");
        window.__EZ_SFC_SMOKE_RESULT__ = { ok: true, width: result.width, height: result.height, pngLength: result.dataUrl.length, counts: {
          lines: data.lines.length, polys: data.polys.length, texts: data.texts.length, circles: data.circles.length,
          arcs: data.arcs?.length || 0, ellipses: data.ellipses?.length || 0
        }};
        smokeStatus.textContent = "SMOKE: PASS";
        smokeStatus.style.background = "#147a3e";
      } catch (error) {
        console.error(error);
        window.__EZ_SFC_SMOKE_RESULT__ = { ok: false, error: error?.message || String(error) };
        smokeStatus.textContent = `SMOKE: FAIL - ${window.__EZ_SFC_SMOKE_RESULT__.error}`;
        smokeStatus.style.background = "#b42318";
      }
    })();
  }
})();
