import { pointSegment } from "./core/geometry.mjs";
export const COLORS = {
  terrain: "#538e6b",
  road: "#367a8a",
  channel: "#5a84a2",
  bridge: "#837c9a",
  wall: "#997555",
  dem: "#bc9852",
};
function canvasContext(canvas) {
  const rect = canvas.getBoundingClientRect(),
    dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, rect.width),
    h = Math.max(1, rect.height);
  if (
    canvas.width !== Math.round(w * dpr) ||
    canvas.height !== Math.round(h * dpr)
  ) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
export function bounds(project) {
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minx = Math.min(minx, x);
    miny = Math.min(miny, y);
    maxx = Math.max(maxx, x);
    maxy = Math.max(maxy, y);
  };
  for (const p of project.points) add(p.x, p.y);
  for (const s of project.sources)
    for (const e of s.entities) {
      if (e.points) for (const p of e.points) add(p[0], p[1]);
      else add(e.x, e.y);
    }
  return minx === Infinity
    ? { minx: -20, miny: -20, maxx: 20, maxy: 20 }
    : { minx, miny, maxx, maxy };
}
export class PlanView {
  constructor(canvas, onPick) {
    this.canvas = canvas;
    this.scale = 5;
    this.cx = 0;
    this.cy = 0;
    this.onPick = onPick;
    this.pointers = new Map();
    this.moved = false;
    this.pinch = 0;
    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.down = { x: e.clientX, y: e.clientY };
      this.moved = false;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const old = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 4)
        this.moved = true;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()],
          d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch > 0)
          this.scale = Math.max(
            0.0001,
            Math.min(1e5, (this.scale * d) / this.pinch),
          );
        this.pinch = d;
        this.moved = true;
      } else {
        this.cx -= (e.clientX - old.x) / this.scale;
        this.cy += (e.clientY - old.y) / this.scale;
      }
      this.render();
    });
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const tap = !this.moved && this.pointers.size === 1;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size) this.moved = true;
      this.pinch = 0;
      if (tap) {
        const r = canvas.getBoundingClientRect();
        this.onPick(this.world(e.clientX - r.left, e.clientY - r.top));
      }
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", (e) => {
      this.pointers.delete(e.pointerId);
      this.moved = true;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom(Math.exp(-e.deltaY * 0.001));
      },
      { passive: false },
    );
  }
  world(x, y) {
    return {
      x: this.cx + (x - this.canvas.clientWidth / 2) / this.scale,
      y: this.cy - (y - this.canvas.clientHeight / 2) / this.scale,
    };
  }
  screen(p) {
    return {
      x: (p.x - this.cx) * this.scale + this.canvas.clientWidth / 2,
      y: (this.cy - p.y) * this.scale + this.canvas.clientHeight / 2,
    };
  }
  fit(project) {
    const b = bounds(project);
    this.cx = (b.minx + b.maxx) / 2;
    this.cy = (b.miny + b.maxy) / 2;
    this.scale =
      Math.min(
        this.canvas.clientWidth / Math.max(1, b.maxx - b.minx),
        this.canvas.clientHeight / Math.max(1, b.maxy - b.miny),
      ) * 0.82;
    this.render();
  }
  zoom(factor) {
    this.scale = Math.max(0.0001, Math.min(1e5, this.scale * factor));
    this.render();
  }
  render() {
    if (!this.state || this.canvas.hidden) return;
    const { project, model, selected, pending, section } = this.state,
      { ctx, w, h } = canvasContext(this.canvas),
      s = (p) => this.screen(p);
    ctx.fillStyle = "#fdfefa";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ecf0e8";
    ctx.lineWidth = 1;
    const step = 10 ** Math.floor(Math.log10(100 / this.scale)),
      pixel = step * this.scale;
    const origin = s({ x: 0, y: 0 });
    ctx.beginPath();
    for (let x = ((origin.x % pixel) + pixel) % pixel; x < w; x += pixel) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = ((origin.y % pixel) + pixel) % pixel; y < h; y += pixel) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    const path = (points, close = false) => {
      ctx.beginPath();
      points.forEach((p, i) => {
        const q = s(p);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      if (close) ctx.closePath();
    };
    if (model) {
      const map = new Map(model.points.map((p) => [p.id, p]));
      for (const f of model.faces) {
        path(
          f.pointIds.map((id) => map.get(id)),
          true,
        );
        ctx.fillStyle = (COLORS[f.kind] || "#59906d") + "20";
        ctx.fill();
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = (COLORS[f.kind] || "#59906d") + "40";
        ctx.stroke();
      }
    }
    let drawn = 0;
    for (const source of project.sources)
      for (const e of source.entities) {
        if (drawn++ > 80000) break;
        ctx.strokeStyle = "#75877e";
        ctx.lineWidth = 1;
        if (e.points) {
          path(
            e.points.map((p) => ({ x: p[0], y: p[1] })),
            e.closed,
          );
          ctx.stroke();
        } else if (e.kind === "marker") {
          const p = s(e);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
          ctx.stroke();
        } else if (e.kind === "text") {
          const p = s(e);
          if (p.x < -100 || p.y < -30 || p.x > w + 100 || p.y > h + 30)
            continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(-e.angle);
          ctx.fillStyle = "#66796c";
          ctx.font = `${Math.max(8, Math.min(24, e.height * this.scale))}px sans-serif`;
          ctx.fillText(e.text, 0, 0);
          ctx.restore();
        }
      }
    for (const poly of project.exclusions) {
      path(poly, true);
      ctx.fillStyle = "#d6b89235";
      ctx.fill();
      ctx.strokeStyle = "#a48158";
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const p of project.points) {
      const q = s(p);
      if (q.x < 0 || q.y < 0 || q.x > w || q.y > h) continue;
      ctx.fillStyle = p.kind === "reconstructed" ? "#b47937" : "#427284";
      ctx.beginPath();
      ctx.arc(q.x, q.y, selected.has(p.id) ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
      if (selected.has(p.id)) {
        ctx.strokeStyle = "#d48a32";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (project.points.length < 600) {
        ctx.fillStyle = "#415e50";
        ctx.font = "10px sans-serif";
        ctx.fillText(p.name, q.x + 6, q.y - 5);
      }
    }
    if (project.centerline.length) {
      path(project.centerline);
      ctx.strokeStyle = "#205f54";
      ctx.lineWidth = 2;
      ctx.stroke();
      project.centerline.forEach((p, i) => {
        const q = s(p);
        ctx.fillStyle = "#205f54";
        ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
        ctx.font = "11px sans-serif";
        ctx.fillText(String(i + 1), q.x + 6, q.y + 14);
      });
    }
    if (pending?.length) {
      path(pending);
      ctx.strokeStyle = "#a86c2b";
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (section) {
      const st = section.station,
        r = (project.settings.sectionAngle * Math.PI) / 180,
        tx = st.tx * Math.cos(r) - st.ty * Math.sin(r),
        ty = st.tx * Math.sin(r) + st.ty * Math.cos(r);
      path([
        {
          x: st.x - ty * project.settings.width,
          y: st.y + tx * project.settings.width,
        },
        {
          x: st.x + ty * project.settings.width,
          y: st.y - tx * project.settings.width,
        },
      ]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#b46a31";
      ctx.stroke();
    }
    ctx.fillStyle = "#53695b";
    ctx.font = "10px sans-serif";
    ctx.fillText(`格子 ${step}m · X=北 / Y=東`, 12, 17);
    if (drawn > 80000)
      ctx.fillText("表示上限80,000要素（原データは保持）", 12, 32);
  }
}
export class ThreeView {
  constructor(canvas) {
    this.canvas = canvas;
    this.yaw = -0.6;
    this.pitch = 0.65;
    this.zoom = 1;
    let last = null;
    canvas.addEventListener("pointerdown", (e) => {
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      this.yaw += (e.clientX - last.x) * 0.01;
      this.pitch = Math.max(
        0.05,
        Math.min(1.5, this.pitch + (e.clientY - last.y) * 0.005),
      );
      last = { x: e.clientX, y: e.clientY };
      this.render();
    });
    canvas.addEventListener("pointerup", () => (last = null));
    canvas.addEventListener("pointercancel", () => (last = null));
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.2,
          Math.min(8, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        this.render();
      },
      { passive: false },
    );
  }
  render() {
    if (this.canvas.hidden) return;
    const { ctx, w, h } = canvasContext(this.canvas);
    ctx.fillStyle = "#f8fbf6";
    ctx.fillRect(0, 0, w, h);
    if (!this.model?.faces.length) {
      ctx.fillStyle = "#738a78";
      ctx.font = "14px sans-serif";
      ctx.fillText(
        "高さ付き面を作成し「3D・横断を生成」を押してください",
        24,
        50,
      );
      return;
    }
    const model = this.model,
      map = new Map(model.points.map((p) => [p.id, p])),
      used = new Set(model.faces.flatMap((f) => f.pointIds)),
      pts = model.points.filter((p) => used.has(p.id));
    let minx = Infinity,
      maxx = -Infinity,
      miny = Infinity,
      maxy = -Infinity,
      minz = Infinity;
    for (const p of pts) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y);
      maxy = Math.max(maxy, p.y);
      minz = Math.min(minz, p.z);
    }
    const cx = (minx + maxx) / 2,
      cy = (miny + maxy) / 2,
      scale =
        (Math.min(w, h) / Math.max(1, maxx - minx, maxy - miny)) *
        0.72 *
        this.zoom;
    const p3 = (p) => {
      const x = p.x - cx,
        y = p.y - cy,
        z = p.z - minz,
        rx = x * Math.cos(this.yaw) - y * Math.sin(this.yaw),
        ry = x * Math.sin(this.yaw) + y * Math.cos(this.yaw);
      return {
        x: w / 2 + rx * scale,
        y:
          h * 0.6 -
          (ry * Math.sin(this.pitch) + z * Math.cos(this.pitch)) * scale,
        depth: ry * Math.cos(this.pitch) - z * Math.sin(this.pitch),
      };
    };
    const list = model.faces
      .map((f) => ({ f, v: f.pointIds.map((id) => p3(map.get(id))) }))
      .sort(
        (a, b) =>
          b.v.reduce((s, p) => s + p.depth, 0) -
          a.v.reduce((s, p) => s + p.depth, 0),
      );
    for (const { f, v } of list) {
      ctx.beginPath();
      v.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle =
        (COLORS[f.kind] || "#538e6b") + (f.kind === "dem" ? "55" : "b0");
      ctx.fill();
      ctx.strokeStyle = "#ffffff60";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    ctx.fillStyle = "#55705c";
    ctx.font = "11px sans-serif";
    ctx.fillText(
      "平行投影 / 縦横同倍率 / ドラッグで回転 / 未確定箇所は面なし",
      12,
      20,
    );
  }
}
export class SectionView {
  constructor(canvas, onPick) {
    this.canvas = canvas;
    this.hit = [];
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect(),
        p = { x: e.clientX - r.left, y: e.clientY - r.top };
      let best = null;
      for (const h of this.hit) {
        const d = pointSegment(p, h.a, h.b).distance;
        if (d < 9 && (!best || d < best.d)) best = { h, d };
      }
      if (best) onPick(best.h.segment);
    });
  }
  render(section, width = 20) {
    const { ctx, w, h } = canvasContext(this.canvas);
    this.hit = [];
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    if (!section?.segments.length) {
      ctx.fillStyle = "#8a9b8f";
      ctx.font = "13px sans-serif";
      ctx.fillText(
        section
          ? "この断面には高さの根拠が足りません。未確定として保持します。"
          : "横断はまだ生成されていません。",
        20,
        40,
      );
      return;
    }
    const points = section.segments.flatMap((s) => s.points);
    let zmin = Infinity,
      zmax = -Infinity;
    for (const p of points) {
      zmin = Math.min(zmin, p.z);
      zmax = Math.max(zmax, p.z);
    }
    zmin -= 0.5;
    zmax += 0.5;
    const left = 65,
      right = w - 22,
      top = 24,
      bottom = h - 38,
      screen = (p) => ({
        x: left + ((p.x + width) / (2 * width)) * (right - left),
        y: bottom - ((p.z - zmin) / (zmax - zmin)) * (bottom - top),
      });
    ctx.font = "10px sans-serif";
    for (let i = 0; i <= 4; i++) {
      const z = zmin + ((zmax - zmin) * i) / 4,
        y = screen({ x: 0, z }).y;
      ctx.strokeStyle = "#edf0e9";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.fillStyle = "#6c8271";
      ctx.fillText(z.toFixed(2) + "m", 7, y + 3);
    }
    for (let i = 0; i <= 4; i++) {
      const x = -width + (2 * width * i) / 4,
        p = screen({ x, z: zmin });
      ctx.fillText(x.toFixed(1), p.x - 12, h - 18);
      ctx.strokeStyle = "#edf0e9";
      ctx.beginPath();
      ctx.moveTo(p.x, top);
      ctx.lineTo(p.x, bottom);
      ctx.stroke();
    }
    for (const gap of section.gaps) {
      const a = screen({ x: gap.from, z: zmin }),
        b = screen({ x: gap.to, z: zmin });
      ctx.fillStyle = "#dcc39d55";
      ctx.fillRect(a.x, top, b.x - a.x, bottom - top);
    }
    for (const s of section.segments) {
      const [a, b] = s.points.map(screen);
      ctx.strokeStyle = COLORS[s.kind] || COLORS.terrain;
      ctx.lineWidth = s.kind === "wall" ? 2.8 : 2;
      ctx.setLineDash(s.kind === "dem" ? [5, 4] : []);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      this.hit.push({ a, b, segment: s });
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "#687f70";
    ctx.fillText("− 右側", left, 13);
    ctx.fillText("左側 ＋", right - 50, 13);
    ctx.fillText("離れ m（画面では縦横を別倍率で表示）", left + 30, h - 3);
  }
}
