import { Node, Quat, v3, Vec3 } from "cc";

type BodyState = "free" | "settle" | "rest";

/** Một cột khối xếp chồng trên một ô lưới. */
class Column {
   public readonly bodies: LiteBody[] = [];
}

export class LiteBody {
   public readonly pos = v3();
   public readonly vel = v3();
   public readonly spin = v3();
   public readonly rot = new Quat();
   public readonly half = v3();
   public readonly node: Node;
   public state: BodyState = "free";
   public column: Column | null = null;
   public tx = 0;
   public ty = 0;
   public tz = 0;
   public settleT = 0;
   public useLocal = false;

   constructor(node: Node, size: Vec3) {
      this.node = node;
      this.pos.set(node.worldPosition);
      this.rot.set(node.worldRotation);
      this.half.set(size.x * 0.5, size.y * 0.5, size.z * 0.5);
   }
}

const _q = new Quat();
const _t = new Quat();
const _e = new Vec3();
const _axis = new Vec3();

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
   [1, 0],
   [-1, 0],
   [0, 1],
   [0, -1],
   [1, 1],
   [1, -1],
   [-1, 1],
   [-1, -1],
];

/**
 * Physic "giả" cực nhẹ cho đống khối: không giải va chạm cặp, chỉ dùng bản đồ độ cao (heightfield).
 * - Khối rơi tự do dưới trọng lực, chạm mặt đống thì nảy (restitution) và bị hất ngang ngẫu nhiên.
 * - Khi hết nảy: nếu ô bên cạnh thấp hơn quá `maxStep` khối thì trượt sang đó, ngược lại xếp vào cột của ô và nằm yên.
 * - Khối nằm yên không tốn gì (không tính toán, không ghi node). Chi phí mỗi frame ~ số khối đang chuyển động.
 * Giả định: mọi khối có cùng kích thước (lấy từ khối đầu tiên). Các khối đang bay không va chạm nhau.
 */
export class LitePhysics {
   public gravity = -10;
   public groundY = 0;
   public restitution = 0.3;
   /** Va chạm chậm hơn ngưỡng này (m/s) thì không nảy nữa. */
   public bounceThreshold = 1.5;
   /** Tỉ lệ tốc độ va chạm đổi thành vận tốc hất ngang khi nảy. Cao thì đống xòe rộng hơn. */
   public scatter = 0.08;
   public maxKick = 2.5;
   /** Cho phép chênh bao nhiêu khối giữa hai ô liền kề trước khi khối trượt xuống ô thấp. 1 = dốc ~45°. */
   public maxStep = 1;
   /** Thời gian (giây) khối bay từ ô này sang ô thấp hơn khi trượt. */
   public slideTime = 0.2;
   /** Thời gian (giây) khối được kéo về giữa ô sau khi chốt chỗ. */
   public settleTime = 0.12;
   /** Lệch ngẫu nhiên (m) quanh tâm ô khi khối nằm yên, cho đống bớt "như lưới". */
   public jitter = 0.01;
   public maxSpeed = 20;
   /** Tốc độ xoay hiển thị sinh ra từ cú hất (rad/s trên mỗi m/s, chia cho nửa cạnh). */
   public spinFactor = 0.5;
   public spinDamping = 3;
   /** Chỉ mô phỏng khi true. */
   public running = false;

   private readonly _bodies: LiteBody[] = [];
   private readonly _columns = new Map<number, Column>();
   private _cell = 0;
   private _cubeH = 0;
   private _seed = 20240601;

   public addBody(node: Node, size: Vec3 = node.worldScale): LiteBody {
      if (this._bodies.length === 0) {
         this._cell = Math.max(size.x, size.z);
         this._cubeH = size.y;
      }
      const body = new LiteBody(node, size);
      body.useLocal = this.parentIsIdentity(node);
      this._bodies.push(body);
      return body;
   }

   /** Gỡ khối (ví dụ khi rơi vào lỗ). Các khối nằm trên nó trong cùng cột sẽ rơi xuống. */
   public removeBody(node: Node) {
      const index = this._bodies.findIndex((b) => b.node === node);
      if (index < 0) return;
      const removed = this._bodies[index];
      this._bodies[index] = this._bodies[this._bodies.length - 1];
      this._bodies.pop();

      const col = removed.column;
      if (!col) return;
      const at = col.bodies.indexOf(removed);
      const above = col.bodies.splice(at);
      for (let i = 1; i < above.length; i++) {
         const b = above[i];
         b.column = null;
         b.state = "free";
         b.vel.set(0, 0, 0);
      }
      removed.column = null;
   }

   public clear() {
      this._bodies.length = 0;
      this._columns.clear();
   }

   public update(dt: number) {
      if (!this.running) return;
      dt = Math.min(dt, 1 / 30);
      for (const b of this._bodies) {
         if (b.state === "rest") continue;
         if (b.state === "free") this.stepFree(b, dt);
         else this.stepSettle(b, dt);
         this.writeNode(b);
      }
   }

   // ---------------------------------------------------------------- lưới

   private rand(): number {
      this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
      return this._seed / 4294967296;
   }

   private key(ix: number, iz: number): number {
      return (ix + 4096) * 8192 + (iz + 4096);
   }

   /** Độ cao mặt trên của ô (ix, iz). */
   private top(ix: number, iz: number): number {
      const col = this._columns.get(this.key(ix, iz));
      return this.groundY + (col ? col.bodies.length : 0) * this._cubeH;
   }

   // ---------------------------------------------------------------- mô phỏng

   private stepFree(b: LiteBody, dt: number) {
      const cell = this._cell;
      const ox = b.pos.x;
      const oy = b.pos.y;
      const oz = b.pos.z;

      b.vel.y = Math.max(b.vel.y + this.gravity * dt, -this.maxSpeed);
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.pos.z += b.vel.z * dt;

      // Xoay hiển thị.
      const sp = b.spin.length();
      if (sp > 1e-3) {
         Vec3.multiplyScalar(_axis, b.spin, 1 / sp);
         Quat.fromAxisAngle(_q, _axis, sp * dt);
         Quat.multiply(b.rot, _q, b.rot);
         b.spin.multiplyScalar(Math.exp(-this.spinDamping * dt));
      }

      let ix = Math.round(b.pos.x / cell);
      let iz = Math.round(b.pos.z / cell);
      let h = this.top(ix, iz);
      if (b.pos.y - b.half.y >= h) return;

      // Đi ngang vào cột cao hơn -> bị chặn, quay lại ô cũ.
      const oix = Math.round(ox / cell);
      const oiz = Math.round(oz / cell);
      if ((ix !== oix || iz !== oiz) && oy - b.half.y < h - 1e-4) {
         b.pos.x = ox;
         b.pos.z = oz;
         b.vel.x *= -0.3;
         b.vel.z *= -0.3;
         ix = oix;
         iz = oiz;
         h = this.top(ix, iz);
         if (b.pos.y - b.half.y >= h) return;
      }

      this.land(b, ix, iz, h);
   }

   private land(b: LiteBody, ix: number, iz: number, h: number) {
      b.pos.y = h + b.half.y;
      const impact = -b.vel.y;

      if (impact > this.bounceThreshold) {
         // Nảy + hất ngang ngẫu nhiên + xoay.
         const kick = Math.min(impact * this.scatter, this.maxKick);
         const angle = this.rand() * Math.PI * 2;
         const dx = Math.cos(angle);
         const dz = Math.sin(angle);
         b.vel.x = b.vel.x * 0.5 + dx * kick;
         b.vel.z = b.vel.z * 0.5 + dz * kick;
         b.vel.y = impact * this.restitution;
         const w = (kick * this.spinFactor) / b.half.y;
         b.spin.set(dz * w, 0, -dx * w);
         return;
      }

      // Hết nảy: trượt xuống ô thấp hơn nếu quá dốc, không thì chốt vào cột.
      let best = h;
      let bx = 0;
      let bz = 0;
      let ties = 0;
      for (const [ox, oz] of NEIGHBORS) {
         const t = this.top(ix + ox, iz + oz);
         if (t < best - 1e-4) {
            best = t;
            bx = ix + ox;
            bz = iz + oz;
            ties = 1;
         } else if (Math.abs(t - best) < 1e-4 && best < h - 1e-4) {
            ties++;
            if (this.rand() * ties < 1) {
               bx = ix + ox;
               bz = iz + oz;
            }
         }
      }

      if (best < h - this.maxStep * this._cubeH - 1e-4) {
         const t = this.slideTime;
         b.vel.x = (bx * this._cell - b.pos.x) / t;
         b.vel.z = (bz * this._cell - b.pos.z) / t;
         b.vel.y = (-this.gravity * t) / 2;
         b.spin.set(b.vel.z * 2, 0, -b.vel.x * 2);
         return;
      }

      this.commit(b, ix, iz);
   }

   private commit(b: LiteBody, ix: number, iz: number) {
      const k = this.key(ix, iz);
      let col = this._columns.get(k);
      if (!col) {
         col = new Column();
         this._columns.set(k, col);
      }
      b.tx = ix * this._cell + (this.rand() - 0.5) * 2 * this.jitter;
      b.tz = iz * this._cell + (this.rand() - 0.5) * 2 * this.jitter;
      b.ty = this.groundY + col.bodies.length * this._cubeH + b.half.y;
      col.bodies.push(b);
      b.column = col;
      b.vel.set(0, 0, 0);
      b.spin.set(0, 0, 0);
      b.state = "settle";
      b.settleT = 0;
   }

   private snapTarget(b: LiteBody) {
      Quat.toEuler(_e, b.rot);
      _e.set(Math.round(_e.x / 90) * 90, Math.round(_e.y / 90) * 90, Math.round(_e.z / 90) * 90);
      Quat.fromEuler(_t, _e.x, _e.y, _e.z);
   }

   /** Kéo khối về giữa ô và xoay về góc 90°, rồi cho nằm yên. */
   private stepSettle(b: LiteBody, dt: number) {
      b.settleT += dt;
      this.snapTarget(b);
      if (b.settleT >= this.settleTime) {
         b.pos.set(b.tx, b.ty, b.tz);
         b.rot.set(_t);
         b.state = "rest";
         return;
      }
      const a = 1 - Math.exp(-dt * 30);
      b.pos.set(b.pos.x + (b.tx - b.pos.x) * a, b.pos.y + (b.ty - b.pos.y) * a, b.pos.z + (b.tz - b.pos.z) * a);
      Quat.slerp(b.rot, b.rot, _t, a);
   }

   // ---------------------------------------------------------------- node

   private parentIsIdentity(node: Node): boolean {
      const p = node.parent;
      if (!p) return true;
      const pos = p.worldPosition;
      const s = p.worldScale;
      const r = p.worldRotation;
      const eps = 1e-5;
      return (
         Math.abs(pos.x) < eps &&
         Math.abs(pos.y) < eps &&
         Math.abs(pos.z) < eps &&
         Math.abs(s.x - 1) < eps &&
         Math.abs(s.y - 1) < eps &&
         Math.abs(s.z - 1) < eps &&
         Math.abs(r.x) < eps &&
         Math.abs(r.y) < eps &&
         Math.abs(r.z) < eps &&
         Math.abs(r.w - 1) < eps
      );
   }

   private writeNode(b: LiteBody) {
      if (b.useLocal) {
         b.node.setPosition(b.pos);
         b.node.setRotation(b.rot);
      } else {
         b.node.setWorldPosition(b.pos);
         b.node.setWorldRotation(b.rot);
      }
   }
}
