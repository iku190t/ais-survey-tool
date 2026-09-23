import {
  newProject,
  addSource,
  validateProject,
  projectJson,
  sectionCsv,
  sectionSvg,
} from "./core/project.mjs";
import { acceptCandidate } from "./core/evidence.mjs";
import { pathInfo, dist } from "./core/geometry.mjs";
import { demoProject } from "./fixtures/demo.mjs";
import { PlanView, ThreeView, SectionView } from "./views.mjs";
const $ = (id) => document.getElementById(id),
  node = (tag, text) => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    return e;
  };
let project = newProject(),
  result = null,
  selected = new Set(),
  mode = "inspect",
  pending = [],
  activeWorker = null,
  activeReject = null,
  taskSerial = 0,
  stationIndex = 0,
  importSerial = 0;
const tell = (message, error = false) => {
  $("status").textContent = message;
  $("status").style.background = error ? "#8d4837ed" : "#1d3d32ed";
};
const guard =
  (fn) =>
  async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      tell(error.message, true);
    }
  };
function setBusy(busy) {
  for (const e of document.querySelectorAll("[data-busy],#files,#openProject"))
    e.disabled = busy;
  $("cancel").disabled = !busy;
  $("build").textContent = busy ? "計算中…" : "3D・横断を生成";
}
function cancel() {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
    activeReject?.(Error("計算を中止しました"));
    activeReject = null;
    setBusy(false);
  }
}
async function run(type, data) {
  cancel();
  const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
      type: "module",
    }),
    id = ++taskSerial;
  activeWorker = worker;
  setBusy(true);
  try {
    return await new Promise((resolve, reject) => {
      activeReject = reject;
      worker.onmessage = (e) => {
        if (e.data.id !== id) return;
        if (e.data.progress) {
          tell(e.data.progress);
          return;
        }
        e.data.error ? reject(Error(e.data.error)) : resolve(e.data.result);
      };
      worker.onerror = (e) =>
        reject(Error(e.message || "計算処理を起動できません"));
      worker.postMessage({ id, type, ...data });
    });
  } finally {
    worker.terminate();
    if (activeWorker === worker) {
      activeWorker = null;
      activeReject = null;
      setBusy(false);
    }
  }
}
function dirty() {
  cancel();
  project.revision++;
  result = null;
  stationIndex = 0;
  $("stationSelect").replaceChildren(new Option("再生成してください", ""));
  $("version").textContent = "変更あり・未生成";
  render();
}
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = node("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function getIds(text) {
  const names = text.split(/[、,\s]+/).filter(Boolean);
  return names.map((name) => {
    const matches = project.points.filter(
      (p) => p.name === name || p.id === name,
    );
    if (matches.length !== 1)
      throw Error(`点「${name}」が見つからないか、同名の点があります`);
    return matches[0].id;
  });
}
function applySettings() {
  const number = (id) => {
    const raw = $(id).value.trim();
    if (!raw || !Number.isFinite(Number(raw)))
      throw Error(`${id}に有効な数値を入力してください`);
    return Number(raw);
  };
  const pitch = number("pitch"),
    width = number("width"),
    angle = number("sectionAngle");
  if (pitch <= 0 || width <= 0 || width > 1000 || Math.abs(angle) > 80)
    throw Error("ピッチ・幅・角度が設定範囲外です");
  project.settings = {
    ...project.settings,
    useDem: $("useDem").checked,
    zone: Number($("zone").value),
    coordinatesConfirmed: $("coordinatesConfirmed").checked,
    pitch,
    width,
    sectionAngle: angle,
    extras: $("extras")
      .value.split(/[、,\s]+/)
      .filter(Boolean)
      .map((v) => {
        if (!Number.isFinite(Number(v)))
          throw Error("追加測点の数値が不正です");
        return Number(v);
      }),
  };
}
function syncSettings() {
  for (const id of ["pitch", "width", "sectionAngle", "zone"])
    $(id).value = String(project.settings[id]);
  $("extras").value = project.settings.extras.join(", ");
  $("useDem").checked = project.settings.useDem;
  $("coordinatesConfirmed").checked = project.settings.coordinatesConfirmed;
  demUi();
}
function demUi() {
  const on = $("useDem").checked;
  $("demOptions").hidden = !on;
  $("modeBadge").textContent = on ? "図面＋DEM補助 · ON" : "図面のみ · DEM OFF";
  $("demExplanation").textContent = on
    ? "ON：図面の標高を優先し、面のない区間だけDEMを補助線として表示します。"
    : "OFF：図面の高さだけで作成。DEM通信・DEM補完は行いません。";
}
const plan = new PlanView($("plan"), (p) => {
  const nearest = project.points.reduce(
    (best, q) =>
      dist(p, q) < (best?.d ?? Infinity) ? { p: q, d: dist(p, q) } : best,
    null,
  );
  const snapped =
    nearest && nearest.d * plan.scale < 12
      ? { x: nearest.p.x, y: nearest.p.y }
      : p;
  if (mode === "center" || mode === "mask") {
    pending.push(snapped);
    $("pathInfo").textContent =
      `${mode === "center" ? "中心線" : "除外範囲"}を${pending.length}点指定。完了ボタンで確定。`;
    render();
    return;
  }
  if (nearest && nearest.d * plan.scale < 12) {
    const q = nearest.p;
    selected.has(q.id) ? selected.delete(q.id) : selected.add(q.id);
    $("surfaceNames").value = project.points
      .filter((q) => selected.has(q.id))
      .map((q) => q.name)
      .join(",");
    $("inspector").textContent =
      `${q.name} / ${q.kind} / ${q.fixed ? "固定" : "入力値保持"}\nX（北）${q.y} m  Y（東）${q.x} m  Z ${q.z ?? "未取得"} m\n方法: ${q.method}\n根拠: ${(q.sourceIds || []).join(", ")}`;
    render();
  }
});
const three = new ThreeView($("three")),
  sectionView = new SectionView($("section"), (s) => {
    selected = new Set(s.pointIds);
    $("inspector").textContent =
      `横断の ${s.surface} / ${s.kind === "dem" ? "DEM補助" : "面からの切断交点（実測点ではありません）"}\nモデル版: ${s.modelVersion}\n根拠: ${s.sourceIds.join(", ")}`;
    render();
  });
function render() {
  $("pickActions").hidden = mode === "inspect";
  const section = result?.sections[stationIndex];
  plan.state = { project, model: result?.model, selected, pending, section };
  plan.render();
  three.model = result?.model;
  three.render();
  sectionView.render(section, project.settings.width);
  $("welcome").hidden = project.sources.length > 0 || project.points.length > 0;
  $("projectTitle").textContent = project.sources.length
    ? project.sources[0].name
    : "図面の根拠から、断面へ。";
  $("stats").textContent = project.sources.length
    ? `${project.sources.length}ファイル · ${project.points.length}点（高さあり ${project.points.filter((p) => p.z !== null).length}） · ${project.surfaces.length}面＋${project.walls.length}壁`
    : "SFC・SIMAを読み込むか、合成例で操作を確認できます。";
  if (section) {
    $("sectionInfo").textContent =
      `測点 ${section.station.chainage.toFixed(3)}m / ${section.segments.length}線分 / 未確定 ${section.gaps.length}区間 / ${section.mode === "drawing-only" ? "DEM不使用" : "DEM補助あり（図面優先）"}${section.station.atVertex ? " / 折点の切断方向は進入側の接線" : ""}`;
  } else
    $("sectionInfo").textContent =
      "中心線と高さ付き面を指定してください。線のない区間は勝手につなぎません。";
  renderIssues();
}
function renderSources() {
  $("sources").replaceChildren();
  for (const source of project.sources) {
    const card = node("div");
    card.className = "source-card";
    card.append(
      node("strong", source.name),
      node(
        "small",
        `${source.format} / ${source.entities.length}図形 / ${source.points.length}点`,
      ),
      node("small", source.frame),
    );
    if (source.figures.length) {
      const select = node("select");
      select.setAttribute("aria-label", `${source.name} の解析部分図`);
      for (const f of source.figures)
        select.add(new Option(`${f.name}（${f.count}要素）`, f.name));
      select.add(new Option("用紙全体（現場座標ではない場合あり）", "sheet"));
      select.value = source.selectedFigure;
      select.onchange = guard(async () => {
        if (project.accepted.some((a) => a.sourceId === source.id))
          throw Error("標高採用後の部分図変更は、新規作業で行ってください");
        const encoded = new TextEncoder().encode(source.rawText);
        const next = await run("parse", {
          buffer: encoded.buffer,
          name: source.name,
          options: {
            unitScale: source.unitScale,
            figure: select.value,
            encoding: "utf-8",
          },
        });
        const at = project.sources.findIndex((s) => s.id === source.id);
        project.sources[at] = next;
        dirty();
        renderSources();
        plan.fit(project);
      });
      card.append(select);
    }
    $("sources").append(card);
  }
  if (!project.sources.length)
    $("sources").append(node("p", "図面がまだありません"));
}
function renderSurfaces() {
  $("surfaces").replaceChildren();
  for (const [key, label] of [
    ["surfaces", "面"],
    ["walls", "壁"],
  ])
    for (const surface of project[key]) {
      const card = node("div");
      card.className = "source-card";
      card.append(node("strong", `${label} · ${surface.name}`));
      const button = node("button", "削除");
      button.className = "remove";
      button.onclick = () => {
        project[key] = project[key].filter((s) => s.id !== surface.id);
        dirty();
        renderSurfaces();
      };
      card.append(
        button,
        node(
          "small",
          key === "surfaces"
            ? `${surface.pointIds.length}点 / 最大辺 ${surface.maxEdge}m`
            : `上端 ${surface.upperIds.length}点・下端 ${surface.lowerIds.length}点`,
        ),
      );
      $("surfaces").append(card);
    }
}
function renderIssues() {
  const issues = [
    ...project.sources.flatMap((s) =>
      s.warnings.map((message) => ({ message })),
    ),
    ...(result?.model.issues || []),
    ...(result?.diagnostics || []),
  ];
  const selectedSection = result?.sections[stationIndex];
  for (const gap of selectedSection?.gaps || [])
    issues.push({
      message: `追加確認候補：離れ ${gap.from.toFixed(2)}～${gap.to.toFixed(2)}m の地盤標高。構造物がある場合は天端・底・壁下を区別して測量。`,
    });
  for (const message of selectedSection?.warnings || [])
    issues.push({ message });
  $("issueCount").textContent = String(issues.length);
  $("issues").replaceChildren();
  for (const issue of issues.slice(0, 200)) {
    const row = node("div", issue.message);
    row.className = "issue" + (issue.level === "error" ? " error" : "");
    $("issues").append(row);
  }
  if (!issues.length)
    $("issues").append(
      node(
        "p",
        result
          ? "実装済みの検査で指摘なし。現地との一致や測量精度を保証するものではありません。"
          : "未生成。部分図・単位・標高の所属を確認してから生成してください。",
      ),
    );
}
async function generate() {
  applySettings();
  if (project.centerline.length < 2)
    throw Error("先に平面で中心線を指定してください");
  if (
    !project.surfaces.length &&
    !project.walls.length &&
    !project.settings.useDem
  )
    throw Error(
      "高さ付き点から面を追加してください。DEM OFFでは図面以外の高さを使いません",
    );
  const revision = project.revision;
  const next = await run("build", { project: structuredClone(project) });
  if (revision !== project.revision) return;
  result = next;
  project.settings.demSpacing = next.demSpacing;
  stationIndex = 0;
  $("stationSelect").replaceChildren();
  next.sections.forEach((s, i) =>
    $("stationSelect").add(
      new Option(`${s.station.chainage.toFixed(3)} m`, String(i)),
    ),
  );
  $("version").textContent = next.model.version;
  render();
  tell(
    next.model.issues.some((i) => i.level === "error")
      ? "矛盾があるため横断を保留しました。検査欄を確認してください"
      : `${next.sections.length}断面を生成しました。未確定区間を確認してください`,
  );
}
function dialog(title) {
  $("dialogTitle").textContent = title;
  $("dialogBody").replaceChildren();
  $("dataDialog").showModal();
  return $("dialogBody");
}
function table(headers) {
  const t = node("table"),
    head = node("thead"),
    tr = node("tr");
  headers.forEach((h) => tr.append(node("th", h)));
  head.append(tr);
  t.append(head);
  const body = node("tbody");
  t.append(body);
  return { t, body };
}
function showPoints() {
  const body = dialog("入力・採用した高さ付き点");
  body.append(
    node(
      "p",
      "元座標を保持しています。固定した実測XYZを推定処理で動かしません。同じXYの別高さは、別面や擁壁として管理します。",
    ),
  );
  const { t, body: rows } = table([
    "点名",
    "X（北）m",
    "Y（東）m",
    "Z m",
    "出所",
    "面への使用",
  ]);
  for (const p of project.points.slice(0, 2000)) {
    const tr = node("tr");
    [
      p.name,
      p.y,
      p.x,
      p.z ?? "未取得",
      p.kind,
      project.surfaces
        .filter((s) => s.pointIds.includes(p.id))
        .map((s) => s.name)
        .join(" / "),
    ].forEach((v) => tr.append(node("td", String(v))));
    rows.append(tr);
  }
  body.append(t);
  if (project.points.length > 2000)
    body.append(node("p", "一覧は先頭2,000点。保存JSONには全点を保持します。"));
}
async function showCandidates() {
  const candidates = await run("candidates", {
      sources: project.sources,
      options: { radius: 8, maxCircleRadius: 1 },
    }),
    body = dialog("標高文字とプロットの対応を確認");
  const note = node(
    "p",
    "候補の並びは距離・文字方向・レイヤーによる未校正の評価です。自動認識の確定結果ではありません。整数は点番・寸法の可能性があります。候補がない文字や未確認の対応は使いません。",
  );
  note.className = "table-note";
  body.append(note);
  const { t, body: rows } = table([
    "標高文字",
    "プロット候補（原要素）",
    "採用する点名",
    "確認",
  ]);
  for (const row of candidates.slice(0, 500)) {
    const tr = node("tr"),
      a = node("td", row.text + (row.integerAmbiguous ? " ⚠ 整数" : "")),
      b = node("td"),
      select = node("select");
    select.add(new Option("未確認・使わない", ""));
    for (const c of row.candidates)
      select.add(
        new Option(
          `${c.plotId.split(":#").at(-1)} / ${c.distance.toFixed(2)}m / 評価 ${c.score.toFixed(1)}`,
          c.plotId,
        ),
      );
    b.append(select);
    const name = node("input");
    name.value = `H${project.accepted.length + rows.children.length + 1}`;
    const n = node("td");
    n.append(name);
    const action = node("td"),
      button = node("button", "対応を確認して採用");
    button.onclick = guard(() => {
      if (!select.value) throw Error("プロット候補を選んでください");
      if (project.accepted.some((v) => v.rowId === row.id))
        throw Error("この標高文字は既に採用済みです");
      const point = acceptCandidate(row, select.value, name.value.trim());
      project.points.push(point);
      project.accepted.push({
        rowId: row.id,
        pointId: point.id,
        sourceId: project.sources.find((s) => row.id.startsWith(s.id))?.id,
      });
      button.disabled = true;
      button.textContent = "採用済み";
      dirty();
      tell("図面から復元した点として追加しました。実測点とは区別します");
    });
    action.append(button);
    tr.append(a, b, n, action);
    rows.append(tr);
  }
  body.append(t);
  if (!candidates.length)
    body.append(
      node(
        "p",
        "対応範囲の数値文字がありません。SIMAの標高点を追加するか、解析する部分図を確認してください。",
      ),
    );
  if (candidates.length > 500)
    body.append(
      node(
        "p",
        "候補表示は先頭500件。自動採用はしません。大規模一括対応は未対応です。",
      ),
    );
}
$("readShortcut").onclick = () => {
  document
    .querySelector("aside")
    .scrollIntoView({ behavior: "smooth", block: "start" });
  $("files").click();
};
$("files").onchange = guard(async (e) => {
  const files = Array.from(e.target.files),
    target = project,
    serial = ++importSerial;
  e.target.value = "";
  try {
    for (const file of files) {
      if (file.size > 32 * 1024 * 1024) throw Error("1ファイル32MBまでです");
      setBusy(true);
      const buffer = await file.arrayBuffer();
      if (target !== project || serial !== importSerial) return;
      const source = await run("parse", {
        buffer,
        name: file.name,
        options: {
          encoding: $("encoding").value,
          unitScale: Number($("unit").value),
          fixed: $("verifiedInput").checked,
        },
      });
      if (target !== project || serial !== importSerial) return;
      addSource(project, source);
      dirty();
      renderSources();
      plan.fit(project);
    }
    tell("読込完了。部分図・座標単位を確認し、高さ付き面を指定してください");
  } finally {
    if (!activeWorker) setBusy(false);
  }
});
$("demo").onclick = guard(async () => {
  if (
    project.sources.length &&
    !confirm("今の作業を合成例に切り替えます。作業JSONは保存しましたか？")
  )
    return;
  cancel();
  importSerial++;
  project = demoProject();
  result = null;
  selected.clear();
  pending = [];
  mode = "inspect";
  syncSettings();
  renderSources();
  renderSurfaces();
  render();
  plan.fit(project);
  await generate();
  tell("合成した検証例です。実際の現場データではありません");
});
$("newProject").onclick = () => {
  if (
    project.sources.length &&
    !confirm("未保存の作業は戻せません。新規作業にしますか？")
  )
    return;
  cancel();
  importSerial++;
  project = newProject();
  result = null;
  pending = [];
  mode = "inspect";
  stationIndex = 0;
  selected.clear();
  syncSettings();
  renderSources();
  renderSurfaces();
  $("stationSelect").replaceChildren(new Option("未生成", ""));
  $("version").textContent = "未生成";
  $("pathInfo").textContent = "進行方向に2点以上。左側の離れを＋として出力。";
  render();
  plan.fit(project);
  tell("新規作業。元のEZ Viewerの保存データは変更していません");
};
$("saveProject").onclick = guard(() => {
  applySettings();
  download(
    projectJson(project),
    "EZ_Viewer_Plus_作業.json",
    "application/json",
  );
  tell("作業JSONを出力しました。保存先とファイルを確認してください");
});
$("openProject").onchange = guard(async (e) => {
  const file = e.target.files[0],
    serial = ++importSerial;
  e.target.value = "";
  if (!file) return;
  if (file.size > 128 * 1024 * 1024) throw Error("作業JSONは128MBまでです");
  setBusy(true);
  try {
    const next = validateProject(JSON.parse(await file.text()));
    if (serial !== importSerial) return;
    if (
      project.sources.length &&
      !confirm("現在の作業を作業JSONの内容に切り替えますか？")
    )
      return;
    cancel();
    project = next;
    result = null;
    stationIndex = 0;
    selected.clear();
    pending = [];
    mode = "inspect";
    $("stationSelect").replaceChildren(new Option("再生成してください", ""));
    $("version").textContent = "未生成";
    syncSettings();
    renderSources();
    renderSurfaces();
    render();
    plan.fit(project);
    tell(
      "作業を読み込みました。DEM取得はまだ行いません。設定を確認し再生成してください",
    );
  } finally {
    if (!activeWorker) setBusy(false);
  }
});
$("addSurface").onclick = guard(() => {
  const pointIds = $("surfaceNames").value.trim()
    ? getIds($("surfaceNames").value)
    : [...selected];
  if (pointIds.length < 3) throw Error("3点以上の所属点を指定してください");
  const maxEdge = Number($("maxEdge").value);
  if (!(maxEdge > 0 && maxEdge <= 1000))
    throw Error("最大辺長を0～1000mで指定してください");
  const breaklines = $("breaklines")
    .value.split(/\r?\n/)
    .filter((s) => s.trim())
    .map(getIds);
  if (
    breaklines.some(
      (ids) => ids.length < 2 || ids.some((id) => !pointIds.includes(id)),
    )
  )
    throw Error("制約線はこの面に所属する2点以上を指定してください");
  project.surfaces.push({
    id: `surface-${project.revision}-${project.surfaces.length}`,
    name: $("surfaceName").value.trim() || "面",
    kind: $("surfaceKind").value,
    pointIds: [...new Set(pointIds)],
    maxEdge,
    breaklines,
  });
  dirty();
  renderSurfaces();
  tell("面を追加しました。所属の正しさは利用者確認として記録します");
});
$("allPoints").onclick = () => {
  $("surfaceNames").value = project.points
    .filter((p) => p.z !== null)
    .map((p) => p.name)
    .join(",");
  tell("全標高点を指定しました。別の高さ階層や地物は面を分けてください");
};
$("addWall").onclick = guard(() => {
  const upperIds = getIds($("wallUpper").value),
    lowerIds = getIds($("wallLower").value);
  if (upperIds.length < 2 || upperIds.length !== lowerIds.length)
    throw Error("上端・下端を同数、2点以上ずつ指定してください");
  project.walls.push({
    id: `wall-${project.revision}`,
    name: `擁壁 ${project.walls.length + 1}`,
    upperIds,
    lowerIds,
  });
  dirty();
  renderSurfaces();
});
$("centerMode").onclick = () => {
  mode = "center";
  pending = [];
  $("planTab").click();
  $("plan").scrollIntoView({ block: "center" });
  render();
  tell("平面を進行方向にクリック。最後に「指定を完了」を押してください");
};
$("maskMode").onclick = () => {
  mode = "mask";
  pending = [];
  $("planTab").click();
  $("plan").scrollIntoView({ block: "center" });
  render();
  tell("補間しない範囲を3点以上で囲み、「指定を完了」を押してください");
};
$("finishPath").onclick = guard(() => {
  if (mode === "center") {
    pathInfo(pending);
    project.centerline = structuredClone(pending);
    $("pathInfo").textContent =
      `中心線 ${project.centerline.length}点 / ${pathInfo(project.centerline).total.toFixed(3)}m。折点は進入側の接線を使用。`;
  } else if (mode === "mask") {
    if (pending.length < 3) throw Error("除外範囲は3点以上必要です");
    project.exclusions.push(structuredClone(pending));
  } else return;
  mode = "inspect";
  pending = [];
  dirty();
  tell("指定を確定しました。再生成してください");
});
$("clearMasks").onclick = () => {
  project.exclusions = [];
  dirty();
};
$("build").onclick = guard(generate);
$("cancel").onclick = () => {
  cancel();
  tell("中止しました。元の入力データは保持しています");
};
$("candidates").onclick = guard(showCandidates);
$("pointList").onclick = showPoints;
$("closeDialog").onclick = () => $("dataDialog").close();
$("finishCanvas").onclick = () => $("finishPath").click();
$("cancelPick").onclick = () => {
  mode = "inspect";
  pending = [];
  render();
  tell("指定を中止しました。確定済みの中心線・範囲はそのままです");
};
for (const id of [
  "pitch",
  "width",
  "sectionAngle",
  "extras",
  "zone",
  "coordinatesConfirmed",
  "useDem",
])
  $(id).addEventListener("change", () => {
    if (id === "useDem") demUi();
    try {
      applySettings();
      dirty();
    } catch (e) {
      cancel();
      result = null;
      render();
      tell(e.message, true);
    }
  });
$("stationSelect").onchange = () => {
  stationIndex = Number($("stationSelect").value) || 0;
  render();
};
for (const [id, is3d] of [
  ["planTab", false],
  ["threeTab", true],
])
  $(id).onclick = () => {
    $("plan").hidden = is3d;
    $("three").hidden = !is3d;
    $("planTab").classList.toggle("active", !is3d);
    $("threeTab").classList.toggle("active", is3d);
    $("planTab").setAttribute("aria-selected", String(!is3d));
    $("threeTab").setAttribute("aria-selected", String(is3d));
    $("canvasHint").textContent = is3d
      ? "ドラッグ：3D回転 / ホイール：拡縮"
      : "ドラッグ：移動 / 点をタップ：選択";
    render();
  };
$("fit").onclick = () => {
  plan.fit(project);
  three.zoom = 1;
  three.render();
};
$("zoomIn").onclick = () => {
  plan.zoom(1.4);
  three.zoom = Math.min(8, three.zoom * 1.4);
  three.render();
};
$("zoomOut").onclick = () => {
  plan.zoom(1 / 1.4);
  three.zoom = Math.max(0.2, three.zoom / 1.4);
  three.render();
};
const needResult = () => {
  if (!result?.sections.length) throw Error("先に横断を生成してください");
};
$("csv").onclick = guard(() => {
  needResult();
  download(
    sectionCsv(result.sections),
    "EZ_Viewer_Plus_横断.csv",
    "text/csv;charset=utf-8",
  );
});
$("svg").onclick = guard(() => {
  needResult();
  download(
    sectionSvg(result.sections[stationIndex]),
    "EZ_Viewer_Plus_横断.svg",
    "image/svg+xml",
  );
});
$("modelJson").onclick = guard(() => {
  needResult();
  download(
    JSON.stringify(
      {
        format: "EZ_VIEWER_PLUS_MODEL",
        model: result.model,
        sections: result.sections,
      },
      null,
      2,
    ),
    "EZ_Viewer_Plus_モデル根拠.json",
    "application/json",
  );
});
for (let n = 1; n <= 19; n++) $("zone").add(new Option(`第${n}系`, String(n)));
new ResizeObserver(() => render()).observe($("plan").parentElement);
window.addEventListener("beforeunload", (event) => {
  if (project.sources.length) {
    event.preventDefault();
    event.returnValue = "";
  }
});
syncSettings();
render();
plan.fit(project);
