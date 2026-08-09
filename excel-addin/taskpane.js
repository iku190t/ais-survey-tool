/* global Office, Excel */
(() => {
  "use strict";

  const state = { officeReady: false, drawingLoaded: false, selection: null };
  const $ = id => document.getElementById(id);
  const elements = {};

  function setStatus(message, kind = "") {
    elements.status.textContent = message;
    elements.status.className = `status ${kind}`.trim();
  }

  function numberValue(id, label) {
    const value = Number($(id).value);
    if (!Number.isFinite(value)) throw new Error(`${label}を入力してください。`);
    return value;
  }

  function getBridge() {
    const bridge = elements.viewerFrame.contentWindow?.EzSfcExcelBridge;
    if (!bridge) throw new Error("SFCプレビューを準備しています。少し待ってから再実行してください。");
    return bridge;
  }

  function updatePreviewAspect(width, height) {
    if (!(width > 0 && height > 0)) return;
    const host = elements.previewStage.getBoundingClientRect();
    const maxW = Math.max(180, host.width - 12);
    const maxH = Math.max(180, host.height - 12);
    const ratio = width / height;
    let frameW = maxW;
    let frameH = frameW / ratio;
    if (frameH > maxH) {
      frameH = maxH;
      frameW = frameH * ratio;
    }
    elements.viewerFrame.style.width = `${Math.max(120, frameW)}px`;
    elements.viewerFrame.style.height = `${Math.max(100, frameH)}px`;
    getBridge().resize().catch(() => {});
  }

  async function readSelection() {
    if (!state.officeReady) throw new Error("Excelとの接続がまだ完了していません。");
    const info = await Excel.run(async context => {
      const range = context.workbook.getSelectedRange();
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      range.load("address,left,top,width,height");
      sheet.load("name");
      await context.sync();
      return {
        address: range.address,
        sheetName: sheet.name,
        left: range.left,
        top: range.top,
        width: range.width,
        height: range.height
      };
    });
    if (!(info.width > 0 && info.height > 0)) throw new Error("選択範囲の大きさを取得できませんでした。");
    state.selection = info;
    elements.selectionInfo.textContent = `${info.address}　${info.width.toFixed(1)} × ${info.height.toFixed(1)} pt`;
    updatePreviewAspect(info.width, info.height);
    setStatus("選択範囲を取得しました。SFCの位置を調整してください。");
    return info;
  }

  async function loadSfc(file) {
    if (!file) return;
    elements.fileName.textContent = file.name;
    setStatus("SFCを既存EZビューアのエンジンで読み込んでいます…");
    await getBridge().loadFile(file);
    state.drawingLoaded = true;
    setStatus("読み込み完了。座標を入力し、位置を調整してください。", "success");
  }

  async function applyCoordinateView() {
    if (!state.drawingLoaded) throw new Error("先にSFCファイルを選択してください。");
    const xNorth = numberValue("coordX", "X座標");
    const yEast = numberValue("coordY", "Y座標");
    const extentWidth = numberValue("extentWidth", "表示幅");
    const extentHeight = numberValue("extentHeight", "表示高さ");
    if (!(extentWidth > 0 && extentHeight > 0)) throw new Error("表示幅と表示高さは0より大きい値にしてください。");
    await getBridge().setReferenceView({ xNorth, yEast, extentWidth, extentHeight });
    setStatus("指定座標を中央に表示しました。図面または赤い座標マーカーをドラッグできます。");
  }

  async function insertImage() {
    if (!state.drawingLoaded) throw new Error("先にSFCファイルを選択してください。");
    const selection = await readSelection();
    const dpi = numberValue("outputDpi", "出力品質");
    const pxPerPoint = dpi / 72;
    let pixelWidth = Math.round(selection.width * pxPerPoint);
    let pixelHeight = Math.round(selection.height * pxPerPoint);
    const minimumLongEdge = dpi >= 300 ? 1600 : 1200;
    const longEdge = Math.max(pixelWidth, pixelHeight);
    if (longEdge < minimumLongEdge) {
      const factor = minimumLongEdge / Math.max(1, longEdge);
      pixelWidth = Math.round(pixelWidth * factor);
      pixelHeight = Math.round(pixelHeight * factor);
    }
    const maxEdge = 4096;
    if (Math.max(pixelWidth, pixelHeight) > maxEdge) {
      const factor = maxEdge / Math.max(pixelWidth, pixelHeight);
      pixelWidth = Math.round(pixelWidth * factor);
      pixelHeight = Math.round(pixelHeight * factor);
    }

    setStatus(`高解像度画像を生成しています（${pixelWidth} × ${pixelHeight}px）…`);
    const exported = await getBridge().exportPng({ width: pixelWidth, height: pixelHeight });
    const base64 = exported.dataUrl.replace(/^data:image\/png;base64,/, "");
    const metadata = {
      version: 1,
      kind: "EZ_SFC",
      sourceName: elements.sfcFile.files[0]?.name || "",
      reference: exported.reference,
      view: exported.view,
      selection: { address: selection.address, sheetName: selection.sheetName },
      output: { pixelWidth, pixelHeight, dpi }
    };

    await Excel.run(async context => {
      const range = context.workbook.getSelectedRange();
      const sheet = context.workbook.worksheets.getActiveWorksheet();
      range.load("left,top,width,height,address");
      await context.sync();
      const shape = sheet.shapes.addImage(base64);
      shape.name = `EZ_SFC_${Date.now()}`;
      shape.left = range.left;
      shape.top = range.top;
      shape.width = range.width;
      shape.height = range.height;
      shape.lockAspectRatio = true;
      shape.altTextTitle = "EZ SFC 平面図";
      shape.altTextDescription = JSON.stringify(metadata);
      if (Office.context.requirements.isSetSupported("ExcelApi", "1.10")) {
        shape.placement = "TwoCell";
      }
      await context.sync();
    });
    setStatus(`${selection.address}へSFC平面図を挿入しました。`, "success");
  }

  async function run(action) {
    try {
      await action();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || String(error), "error");
    }
  }

  function bindUi() {
    for (const id of ["officeBadge", "sfcFile", "fileName", "readSelection", "selectionInfo", "previewStage", "viewerFrame", "status"]) {
      elements[id] = $(id);
    }
    elements.sfcFile.addEventListener("change", () => run(() => loadSfc(elements.sfcFile.files[0])));
    elements.readSelection.addEventListener("click", () => run(readSelection));
    $("applyView").addEventListener("click", () => run(applyCoordinateView));
    $("resetCenter").addEventListener("click", () => run(() => getBridge().centerReference()));
    $("insertImage").addEventListener("click", () => run(insertImage));
    window.addEventListener("resize", () => {
      if (state.selection) updatePreviewAspect(state.selection.width, state.selection.height);
    });
  }

  document.addEventListener("DOMContentLoaded", bindUi);
  Office.onReady(info => {
    state.officeReady = info.host === Office.HostType.Excel;
    elements.officeBadge.textContent = state.officeReady ? "Excel接続済み" : "Excel外で実行中";
    elements.officeBadge.classList.toggle("ready", state.officeReady);
    if (state.officeReady) run(readSelection);
  });
})();
