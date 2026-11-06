import { Node, Quat, v3, Vec3 } from "cc";

/**
 * Body của SimplePhysics. Collider là hình cầu bao quanh khối (radius), nên các khối chồng lên nhau sẽ
 * trượt/lăn khỏi nhau và đổ xòe như một đống, thay vì xếp thẳng cột như hộp AABB.
 * Phần xoay của node chỉ là hiệu ứng hình ảnh, không ảnh hưởng va chạm.
 */
export class PhysicsBody {
   public readonly pos = v3();
   public readonly vel = v3();
   public readonly rot = new Quat();
   public radius: number;
   /** Nửa chiều cao thật của khối, dùng cho va chạm với mặt đất để khối nằm sát đất. */
   public halfY: number;
   /** Thứ tự theo độ cao trong substep hiện tại (thấp -> cao). */
   public rank = 0;
   public readonly node: Node;

   constructor(node: Node, radius: number, halfY: number) {
      this.node = node;
      this.radius = radius;
      this.halfY = halfY;
      this.pos.set(node.worldPosition);
      this.rot.set(node.worldRotation);
   }
}

/** Một điểm tiếp xúc: `a` = null nghĩa là mặt đất (khối lượng vô hạn). Pháp tuyến n hướng từ a sang b. */
class Contact {
   public a: PhysicsBody | null = null;
   public b!: PhysicsBody;
   public nx = 0;
   public ny = 1;
   public nz = 0;
   public friction = 0;
   /** Vận tốc pháp tuyến mong muốn (độ nảy). */
   public bias = 0;
   public jn = 0;
   public jtx = 0;
   public jty = 0;
   public jtz = 0;
}

const _q = new Quat();
const _t = new Quat();
const _e = new Vec3();
const _axis = new Vec3();

/**
 * Physic tự viết thay cho engine: trọng lực + va chạm cầu-cầu và cầu-mặt đất.
 * - Giải bằng sequential impulse (xung lượng tích lũy) + hiệu chỉnh vị trí.
 * - Có độ nảy (restitution) và ma sát Coulomb (ma sát giữa các khối và ma sát với mặt đất tách riêng).
 * - Chạy fixed-step nên kết quả không phụ thuộc FPS.
 */
export class SimplePhysics {
   /** Gia tốc trọng trường theo trục Y. */
   public gravity = -10;
   /** Độ cao mặt đất (world Y). */
   public groundY = 0;
   /** Độ nảy (0..1). */
   public restitution = 0.35;
   /** Va chạm chậm hơn ngưỡng này (m/s) thì không nảy, để vật nằm yên. */
   public bounceThreshold = 1;
   /** Ma sát giữa các khối. Thấp thì khối dễ trượt khỏi nhau (đống dẹt), cao thì đống dốc hơn. */
   public friction = 0.35;
   /** Ma sát với mặt đất. */
   public groundFriction = 0.6;
   /** Cản tuyến tính mỗi giây (giống linearDamping của RigidBody). */
   public linearDamping = 0.1;
   /** Tốc độ tối đa, chống xuyên vật khi rơi nhanh. */
   public maxSpeed = 15;
   /** Bán kính cầu = nửa cạnh lớn nhất của khối * hệ số này. Lớn hơn thì các khối xa nhau hơn và dễ lăn hơn. */
   public radiusScale = 1.1;
   /** Lệch ngẫu nhiên (m) khi thêm body để phá thế cân bằng của các cột khối thẳng hàng. */
   public jitter = 0.003;
   /** Số vòng giải vận tốc mỗi substep (cao hơn thì đống vững hơn, chi phí rất nhỏ). */
   public iterations = 16;
   /** Số vòng hiệu chỉnh vị trí. */
   public positionIterations = 4;
   /** Bước thời gian cố định. Với bán kính ~0.165 và maxSpeed 15, 1/120 không bị xuyên. */
   public fixedDt = 1 / 120;
   public maxSubSteps = 8;
   /** Chỉ mô phỏng khi true. */
   public running = false;
   /** Khối tự xoay về góc 90° gần nhất khi di chuyển chậm (tốc độ ease, 1/s). */
   public snapRate = 8;
   /** Khối chỉ lăn (xoay theo chuyển động) khi nhanh hơn ngưỡng này (m/s). */
   public rollSpeed = 0.4;

   private readonly _bodies: PhysicsBody[] = [];
   private readonly _sorted: PhysicsBody[] = [];
   private readonly _grid = new Map<number, PhysicsBody[]>();
   private readonly _pool: PhysicsBody[][] = [];
   private _poolUsed = 0;
   private readonly _contacts: Contact[] = [];
   private _contactCount = 0;
   private _cell = 0;
   private _acc = 0;
   private _seed = 20240601;

   private readonly _slop = 0.002;
   private readonly _margin = 0.005;

   /** Thêm node vào mô phỏng. `size` là kích thước world của hộp, mặc định = worldScale (mesh cube 1x1x1). */
   public addBody(node: Node, size: Vec3 = node.worldScale): PhysicsBody {
      const radius = Math.max(size.x, size.y, size.z) * 0.5 * this.radiusScale;
      const body = new PhysicsBody(node, radius, size.y * 0.5);
      body.pos.x += (this.rand() - 0.5) * 2 * this.jitter;
      body.pos.z += (this.rand() - 0.5) * 2 * this.jitter;
      this._bodies.push(body);
      this._cell = Math.max(this._cell, radius * 2 * 1.05);
      return body;
   }

   public clear() {
      this._bodies.length = 0;
      this._cell = 0;
      this._acc = 0;
   }

   public update(dt: number) {
      if (!this.running || this._bodies.length === 0) return;

      this._acc = Math.min(this._acc + dt, this.fixedDt * this.maxSubSteps);
      while (this._acc >= this.fixedDt) {
         this.substep(this.fixedDt);
         this._acc -= this.fixedDt;
      }

      for (const body of this._bodies) {
         this.updateVisual(body, dt);
      }
   }

   private rand(): number {
      this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
      return this._seed / 4294967296;
   }

   // ---------------------------------------------------------------- step

   private substep(dt: number) {
      const damp = Math.max(0, 1 - this.linearDamping * dt);

      for (const b of this._bodies) {
         b.vel.y += this.gravity * dt;
         b.vel.multiplyScalar(damp);
         const speed = b.vel.length();
         if (speed > this.maxSpeed) b.vel.multiplyScalar(this.maxSpeed / speed);
      }

      this.buildContacts();
      this.preSolve();

      for (let it = 0; it < this.iterations; it++) {
         for (let i = 0; i < this._contactCount; i++) this.solveVelocity(this._contacts[i]);
      }

      for (const b of this._bodies) {
         b.pos.x += b.vel.x * dt;
         b.pos.y += b.vel.y * dt;
         b.pos.z += b.vel.z * dt;
      }

      for (let it = 0; it < this.positionIterations; it++) {
         for (let i = 0; i < this._contactCount; i++) this.solvePosition(this._contacts[i]);
      }
   }

   // ---------------------------------------------------------------- broadphase + narrowphase

   private cellKey(cx: number, cy: number, cz: number): number {
      return ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512);
   }

   private nextContact(): Contact {
      let c = this._contacts[this._contactCount];
      if (!c) c = this._contacts[this._contactCount] = new Contact();
      this._contactCount++;
      c.bias = 0;
      c.jn = 0;
      c.jtx = 0;
      c.jty = 0;
      c.jtz = 0;
      return c;
   }

   private buildContacts() {
      this._contactCount = 0;
      const cell = this._cell;

      // Sắp theo độ cao: cặp phía dưới được giải trước nên đống ít bị lún.
      const sorted = this._sorted;
      sorted.length = 0;
      for (const b of this._bodies) sorted.push(b);
      sorted.sort((p, q) => p.pos.y - q.pos.y);
      for (let i = 0; i < sorted.length; i++) sorted[i].rank = i;

      this._grid.clear();
      this._poolUsed = 0;
      for (const b of sorted) {
         const key = this.cellKey(Math.floor(b.pos.x / cell), Math.floor(b.pos.y / cell), Math.floor(b.pos.z / cell));
         let list = this._grid.get(key);
         if (!list) {
            list = this._pool[this._poolUsed] ?? (this._pool[this._poolUsed] = []);
            this._poolUsed++;
            list.length = 0;
            this._grid.set(key, list);
         }
         list.push(b);
      }

      for (const a of sorted) {
         // Mặt đất.
         if (a.pos.y - a.halfY < this.groundY + this._margin) {
            const c = this.nextContact();
            c.a = null;
            c.b = a;
            c.nx = 0;
            c.ny = 1;
            c.nz = 0;
            c.friction = this.groundFriction;
         }

         const cx = Math.floor(a.pos.x / cell);
         const cy = Math.floor(a.pos.y / cell);
         const cz = Math.floor(a.pos.z / cell);
         for (let x = -1; x <= 1; x++) {
            for (let y = -1; y <= 1; y++) {
               for (let z = -1; z <= 1; z++) {
                  const list = this._grid.get(this.cellKey(cx + x, cy + y, cz + z));
                  if (!list) continue;
                  for (const b of list) {
                     if (b.rank <= a.rank) continue;
                     this.collide(a, b);
                  }
               }
            }
         }
      }
   }

   private collide(a: PhysicsBody, b: PhysicsBody) {
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dz = b.pos.z - a.pos.z;
      const r = a.radius + b.radius + this._margin;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) return;

      const c = this.nextContact();
      c.a = a;
      c.b = b;
      c.friction = this.friction;
      const d = Math.sqrt(d2);
      if (d > 1e-6) {
         c.nx = dx / d;
         c.ny = dy / d;
         c.nz = dz / d;
      } else {
         c.nx = 0;
         c.ny = 1;
         c.nz = 0;
      }
   }

   // ---------------------------------------------------------------- solver

   /** Tính vận tốc nảy từ vận tốc va chạm trước khi giải. */
   private preSolve() {
      for (let i = 0; i < this._contactCount; i++) {
         const c = this._contacts[i];
         const vn = this.relNormal(c);
         if (vn < -this.bounceThreshold) c.bias = -this.restitution * vn;
      }
   }

   private relNormal(c: Contact): number {
      const a = c.a;
      const b = c.b;
      const rx = b.vel.x - (a ? a.vel.x : 0);
      const ry = b.vel.y - (a ? a.vel.y : 0);
      const rz = b.vel.z - (a ? a.vel.z : 0);
      return rx * c.nx + ry * c.ny + rz * c.nz;
   }

   private solveVelocity(c: Contact) {
      const a = c.a;
      const b = c.b;
      const im = a ? 2 : 1;

      // Pháp tuyến.
      let dj = -(this.relNormal(c) - c.bias) / im;
      const jn = Math.max(c.jn + dj, 0);
      dj = jn - c.jn;
      c.jn = jn;
      if (a) a.vel.set(a.vel.x - c.nx * dj, a.vel.y - c.ny * dj, a.vel.z - c.nz * dj);
      b.vel.set(b.vel.x + c.nx * dj, b.vel.y + c.ny * dj, b.vel.z + c.nz * dj);

      // Ma sát: vận tốc tiếp tuyến tương đối, kẹp trong hình nón μ * jn.
      const vn = this.relNormal(c);
      const tx = b.vel.x - (a ? a.vel.x : 0) - c.nx * vn;
      const ty = b.vel.y - (a ? a.vel.y : 0) - c.ny * vn;
      const tz = b.vel.z - (a ? a.vel.z : 0) - c.nz * vn;

      let nx = c.jtx - tx / im;
      let ny = c.jty - ty / im;
      let nz = c.jtz - tz / im;
      const max = c.friction * c.jn;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > max) {
         const k = len > 1e-9 ? max / len : 0;
         nx *= k;
         ny *= k;
         nz *= k;
      }
      const dx = nx - c.jtx;
      const dy = ny - c.jty;
      const dz = nz - c.jtz;
      c.jtx = nx;
      c.jty = ny;
      c.jtz = nz;
      if (a) a.vel.set(a.vel.x - dx, a.vel.y - dy, a.vel.z - dz);
      b.vel.set(b.vel.x + dx, b.vel.y + dy, b.vel.z + dz);
   }

   private solvePosition(c: Contact) {
      const a = c.a;
      const b = c.b;
      let pen: number;
      if (a) {
         const dx = b.pos.x - a.pos.x;
         const dy = b.pos.y - a.pos.y;
         const dz = b.pos.z - a.pos.z;
         const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
         pen = a.radius + b.radius - d;
         if (pen <= this._slop) return;
         const corr = (pen - this._slop) * 0.8;
         const nx = d > 1e-6 ? dx / d : 0;
         const ny = d > 1e-6 ? dy / d : 1;
         const nz = d > 1e-6 ? dz / d : 0;
         a.pos.set(a.pos.x - nx * corr * 0.5, a.pos.y - ny * corr * 0.5, a.pos.z - nz * corr * 0.5);
         b.pos.set(b.pos.x + nx * corr * 0.5, b.pos.y + ny * corr * 0.5, b.pos.z + nz * corr * 0.5);
      } else {
         pen = this.groundY - (b.pos.y - b.halfY);
         if (pen <= this._slop) return;
         b.pos.y += (pen - this._slop) * 0.8;
      }
   }

   // ---------------------------------------------------------------- hiển thị

   private updateVisual(b: PhysicsBody, dt: number) {
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if (sp > this.rollSpeed) {
         // Lăn: ω = up x v / r
         const w = sp / b.radius;
         Vec3.set(_axis, b.vel.z / sp, 0, -b.vel.x / sp);
         Quat.fromAxisAngle(_q, _axis, w * dt);
         Quat.multiply(b.rot, _q, b.rot);
      } else {
         // Về góc 90° gần nhất.
         Quat.toEuler(_e, b.rot);
         _e.set(Math.round(_e.x / 90) * 90, Math.round(_e.y / 90) * 90, Math.round(_e.z / 90) * 90);
         Quat.fromEuler(_t, _e.x, _e.y, _e.z);
         Quat.slerp(b.rot, b.rot, _t, 1 - Math.exp(-this.snapRate * dt));
      }
      b.node.setWorldPosition(b.pos);
      b.node.setWorldRotation(b.rot);
   }
}
