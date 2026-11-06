import { Node, Quat, v3, Vec3 } from "cc";
import { GroundBox } from "./GroundBox";

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
   public readonly node: Node;
   /** Body đang ngủ: không tích phân, không ghi lại transform, chỉ được đánh thức khi có vật khác lao vào. */
   public asleep = false;
   public sleepTimer = 0;
   /** true nếu transform node cần được ghi lại ở frame này. */
   public dirty = true;
   /** Node cha có transform đơn vị nên dùng setPosition/setRotation (local) rẻ hơn setWorld*. */
   public useLocal = false;

   constructor(node: Node, radius: number, halfY: number) {
      this.node = node;
      this.radius = radius;
      this.halfY = halfY;
      this.pos.set(node.worldPosition);
      this.rot.set(node.worldRotation);
   }
}

/** Một điểm tiếp xúc: a = null nghĩa là box tĩnh (xem box). Pháp tuyến n hướng từ a sang b. */
class Contact {
   /** Box tĩnh đang tiếp xúc khi a = null. */
   public box: GroundBox | null = null;
   public a: PhysicsBody | null = null;
   public b!: PhysicsBody;
   public nx = 0;
   public ny = 1;
   public nz = 0;
   public friction = 0;
   /** Nghịch đảo khối lượng: 1 = động, 0 = tĩnh (mặt đất hoặc body đang ngủ). */
   public ima = 0;
   public imb = 1;
   /** Vận tốc pháp tuyến mong muốn (độ nảy). */
   public bias = 0;
   public jn = 0;
   public jtx = 0;
   public jty = 0;
   public jtz = 0;
   /** Khóa sắp xếp: giải tiếp xúc thấp trước để đống ít bị lún. */
   public key = 0;
}

class Cell {
   public cx = 0;
   public cy = 0;
   public cz = 0;
   public awake = 0;
   public readonly items: PhysicsBody[] = [];
}

/** 13 ô lân cận "phía trước" (nửa không gian), đủ để duyệt mỗi cặp ô đúng một lần. */
const FORWARD: ReadonlyArray<readonly [number, number, number]> = [
   [1, 0, 0],
   [-1, 1, 0],
   [0, 1, 0],
   [1, 1, 0],
   [-1, -1, 1],
   [0, -1, 1],
   [1, -1, 1],
   [-1, 0, 1],
   [0, 0, 1],
   [1, 0, 1],
   [-1, 1, 1],
   [0, 1, 1],
   [1, 1, 1],
];

const _q = new Quat();
const _axis = new Vec3();

/**
 * Physic tự viết thay cho engine: trọng lực + va chạm cầu-cầu và cầu-mặt đất.
 * - Giải bằng sequential impulse (xung lượng tích lũy) + hiệu chỉnh vị trí.
 * - Có độ nảy (restitution) và ma sát Coulomb (ma sát giữa các khối và ma sát với mặt đất tách riêng).
 * - Sleeping: body nằm yên đủ lâu thì ngủ, không tốn tính toán và không cập nhật node cho tới khi bị đánh thức.
 * - Chạy fixed-step nên kết quả không phụ thuộc FPS.
 */
export class SimplePhysics {
   /** Gia tốc trọng trường theo trục Y. */
   public gravity = -10;
   /** Body rơi thấp hơn độ cao này (world Y) thì bị gỡ khỏi mô phỏng (đã rơi khỏi ground). */
   public killY = -30;
   /** Gọi sau khi một body bị gỡ vì rơi xuống dưới killY (ví dụ để ẩn/hủy node). */
   public onFall: ((node: Node) => void) | null = null;
   /** Độ nảy (0..1). */
   public restitution = 0.45;
   /** Va chạm chậm hơn ngưỡng này (m/s) thì không nảy, để vật nằm yên. */
   public bounceThreshold = 1;
   /** Ma sát giữa các khối. Thấp thì khối dễ trượt khỏi nhau (đống dẹt), cao thì đống dốc hơn. */
   public friction = 0.35;
   /** Ma sát với box ground. */
   public groundFriction = 0.6;
   /** Cản tuyến tính mỗi giây (giống linearDamping của RigidBody). */
   public linearDamping = 0.1;
   /** Tốc độ tối đa, chống xuyên vật khi rơi nhanh. */
   public maxSpeed = 15;
   /** Bán kính cầu = nửa cạnh lớn nhất của khối * hệ số này. Lớn hơn thì các khối xa nhau hơn và dễ lăn hơn. */
   public radiusScale = 1.1;
   /** Lệch ngẫu nhiên (m) khi thêm body để phá thế cân bằng của các cột khối thẳng hàng. */
   public jitter = 0.003;
   /** Số vòng giải vận tốc mỗi substep. Giảm để nhanh hơn, tăng thì đống vững hơn. */
   public iterations = 12;
   /** Số vòng hiệu chỉnh vị trí. */
   public positionIterations = 3;
   /** Bước thời gian cố định. Với bán kính ~0.165 và maxSpeed 15, 1/120 không bị xuyên. */
   public fixedDt = 1 / 120;
   public maxSubSteps = 4;
   /** Chỉ mô phỏng khi true. */
   public running = false;
   /** Khối chỉ lăn (xoay theo chuyển động) khi nhanh hơn ngưỡng này (m/s). */
   public rollSpeed = 0.4;
   /** Body chậm hơn ngưỡng này (m/s) liên tục `sleepTime` giây thì ngủ. */
   public sleepSpeed = 0.08;
   /** Đủ dài để khối đang đứng chênh vênh kịp lăn xuống trước khi bị cho ngủ. */
   public sleepTime = 1;
   /** Vật nhanh hơn ngưỡng này (m/s) chạm vào body đang ngủ sẽ đánh thức nó. */
   public wakeSpeed = 0.3;

   private readonly _bodies: PhysicsBody[] = [];
   private readonly _grounds: GroundBox[] = [];
   /** Lưới ô của box tĩnh: key -> các box phủ ô đó. Cùng cạnh _cell với lưới body, dựng lại khi _cell đổi. */
   private readonly _groundGrid = new Map<number, GroundBox[]>();
   /** Box quá lớn (phủ nhiều ô) không đăng ký vào lưới mà xét trực tiếp. */
   private readonly _bigGrounds: GroundBox[] = [];
   private _groundDirty = false;
   private _stamp = 0;
   /** Pháp tuyến (hướng từ box ra body) do boxPenetration tính gần nhất. */
   private _gnx = 0;
   private _gny = 1;
   private _gnz = 0;
   /** Body vừa rơi xuống dưới killY trong substep hiện tại. */
   private readonly _fallen: PhysicsBody[] = [];
   private readonly _grid = new Map<number, Cell>();
   private readonly _cells: Cell[] = [];
   private _cellCount = 0;
   private readonly _contacts: Contact[] = [];
   private _contactCount = 0;
   private readonly _active: Contact[] = [];
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
      body.useLocal = this.parentIsIdentity(node);
      this._bodies.push(body);
      const need = radius * 2 * 1.05;
      if (need > this._cell) {
         this._cell = need;
         this._groundDirty = true; // cạnh ô đổi -> lưới ground phải dựng lại
      }
      return body;
   }

   /** Thêm một box tĩnh làm ground, đọc từ node ở runtime (xem GroundBox). Chỗ nào không có box thì khối rơi tiếp. */
   public addGround(node: Node, size?: Vec3, center?: Vec3): GroundBox {
      const g = new GroundBox(node, size, center);
      this._grounds.push(g);
      this._groundDirty = true;
      return g;
   }

   /** Gỡ box ground của node và đánh thức các khối để chúng rơi nếu mất chỗ đỡ. */
   public removeGround(node: Node) {
      const index = this._grounds.findIndex((g) => g.node === node);
      if (index < 0) return;
      this._grounds.splice(index, 1);
      this._groundDirty = true;
      this.wakeAll();
   }

   /** Tự đọc lại box của các node ground mỗi frame (ground bị di chuyển/đổi kích thước thì cập nhật). Tắt nếu ground chắc chắn đứng yên. */
   public autoSyncGrounds = true;

   /** Đọc lại box của mọi node ground; nếu có box đổi thì dựng lại lưới và đánh thức các khối. Trả về true nếu có thay đổi. */
   public refreshGrounds(): boolean {
      let changed = false;
      for (const g of this._grounds) {
         if (g.sync()) changed = true;
      }
      if (changed) {
         this._groundDirty = true;
         this.wakeAll();
      }
      return changed;
   }

   /** Gỡ body (ví dụ khi khối rơi vào lỗ) và đánh thức các body xung quanh vì chúng có thể mất chỗ đỡ. */
   public removeBody(node: Node) {
      const index = this._bodies.findIndex((b) => b.node === node);
      if (index < 0) return;
      const removed = this._bodies[index];
      this._bodies[index] = this._bodies[this._bodies.length - 1];
      this._bodies.pop();
      for (const b of this._bodies) {
         const r = removed.radius + b.radius + this._margin * 4;
         const dx = b.pos.x - removed.pos.x;
         const dy = b.pos.y - removed.pos.y;
         const dz = b.pos.z - removed.pos.z;
         if (dx * dx + dy * dy + dz * dz < r * r) this.wake(b);
      }
   }

   /** Đánh thức mọi body (gọi khi có thứ gì đó di chuyển các khối từ bên ngoài). */
   public wakeAll() {
      for (const b of this._bodies) this.wake(b);
   }

   public wake(b: PhysicsBody) {
      b.asleep = false;
      b.sleepTimer = 0;
      b.dirty = true;
   }

   public clear() {
      this._bodies.length = 0;
      this._grounds.length = 0;
      this._groundGrid.clear();
      this._bigGrounds.length = 0;
      this._groundDirty = false;
      this._cell = 0;
      this._acc = 0;
   }

   public update(dt: number) {
      if (!this.running || this._bodies.length === 0) return;
      if (this.autoSyncGrounds) this.refreshGrounds();
      if (this._groundDirty) this.rebuildGrounds();

      this._acc = Math.min(this._acc + dt, this.fixedDt * this.maxSubSteps);
      while (this._acc >= this.fixedDt) {
         this.substep(this.fixedDt);
         this._acc -= this.fixedDt;
      }

      for (const body of this._bodies) {
         if (body.dirty) this.updateVisual(body, dt);
      }
   }

   private rand(): number {
      this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
      return this._seed / 4294967296;
   }

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

   // ---------------------------------------------------------------- step

   private substep(dt: number) {
      const damp = Math.max(0, 1 - this.linearDamping * dt);
      const bodies = this._bodies;

      for (const b of bodies) {
         if (b.asleep) continue;
         b.vel.y += this.gravity * dt;
         b.vel.multiplyScalar(damp);
         const speed = b.vel.length();
         if (speed > this.maxSpeed) b.vel.multiplyScalar(this.maxSpeed / speed);
      }

      this.buildContacts();
      this.preSolve();

      for (let it = 0; it < this.iterations; it++) {
         for (let i = 0; i < this._contactCount; i++) this.solveVelocity(this._active[i]);
      }

      const sleepSpeed2 = this.sleepSpeed * this.sleepSpeed;
      for (const b of bodies) {
         if (b.asleep) continue;
         const v = b.vel;
         if (v.x * v.x + v.y * v.y + v.z * v.z < sleepSpeed2) {
            b.sleepTimer += dt;
            if (b.sleepTimer >= this.sleepTime) {
               b.asleep = true;
               v.set(0, 0, 0);
               b.dirty = true; // ghi transform lần cuối ở updateVisual
               continue;
            }
         } else {
            b.sleepTimer = 0;
         }
         b.pos.x += v.x * dt;
         b.pos.y += v.y * dt;
         b.pos.z += v.z * dt;
         b.dirty = true;
         if (b.pos.y < this.killY) this._fallen.push(b); // gỡ sau khi hết substep (đang duyệt mảng)
      }

      for (let it = 0; it < this.positionIterations; it++) {
         for (let i = 0; i < this._contactCount; i++) this.solvePosition(this._active[i]);
      }

      if (this._fallen.length > 0) {
         for (const b of this._fallen) {
            const index = this._bodies.indexOf(b);
            if (index < 0) continue;
            this._bodies[index] = this._bodies[this._bodies.length - 1];
            this._bodies.pop();
            this.onFall?.(b.node);
         }
         this._fallen.length = 0;
      }
   }

   // ---------------------------------------------------------------- broadphase + narrowphase

   /** Dựng lại lưới box tĩnh (khi thêm/gỡ/đọc lại box hoặc cạnh ô đổi). */
   private rebuildGrounds() {
      this._groundDirty = false;
      this._groundGrid.clear();
      this._bigGrounds.length = 0;
      if (this._cell <= 0) return;
      for (const g of this._grounds) this.insertGround(g);
   }

   /** Đăng ký box vào mọi voxel nó phủ. Box phủ quá nhiều voxel thì xét trực tiếp thay vì đăng ký. */
   private insertGround(g: GroundBox) {
      const s = this._cell;
      const x0 = Math.floor(g.minX / s);
      const x1 = Math.floor(g.maxX / s);
      const y0 = Math.floor(g.minY / s);
      const y1 = Math.floor(g.maxY / s);
      const z0 = Math.floor(g.minZ / s);
      const z1 = Math.floor(g.maxZ / s);
      g.keys.length = 0;
      g.big = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4096;
      if (g.big) {
         this._bigGrounds.push(g);
         return;
      }
      for (let x = x0; x <= x1; x++) {
         for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) {
               const key = this.cellKey(x, y, z);
               let list = this._groundGrid.get(key);
               if (!list) {
                  list = [];
                  this._groundGrid.set(key, list);
               }
               list.push(g);
               g.keys.push(key);
            }
         }
      }
   }

   private cellKey(cx: number, cy: number, cz: number): number {
      return ((cx + 512) * 1024 + (cy + 512)) * 1024 + (cz + 512);
   }

   private nextContact(): Contact {
      let c = this._contacts[this._contactCount];
      if (!c) c = this._contacts[this._contactCount] = new Contact();
      this._contactCount++;
      c.bias = 0;
      c.box = null;
      c.jn = 0;
      c.jtx = 0;
      c.jty = 0;
      c.jtz = 0;
      return c;
   }

   private buildContacts() {
      this._contactCount = 0;
      this._cellCount = 0;
      this._grid.clear();
      const cell = this._cell;

      for (const b of this._bodies) {
         const cx = Math.floor(b.pos.x / cell);
         const cy = Math.floor(b.pos.y / cell);
         const cz = Math.floor(b.pos.z / cell);
         const key = this.cellKey(cx, cy, cz);
         let c = this._grid.get(key);
         if (!c) {
            c = this._cells[this._cellCount] ?? (this._cells[this._cellCount] = new Cell());
            this._cellCount++;
            c.cx = cx;
            c.cy = cy;
            c.cz = cz;
            c.awake = 0;
            c.items.length = 0;
            this._grid.set(key, c);
         }
         c.items.push(b);
         if (!b.asleep) c.awake++;

         // Box ground (body đang ngủ không cần tiếp xúc).
         if (!b.asleep && this._grounds.length > 0) this.groundContacts(b);
      }

      for (let i = 0; i < this._cellCount; i++) {
         const c = this._cells[i];
         const items = c.items;
         if (c.awake > 0) {
            for (let p = 0; p < items.length; p++) {
               for (let q = p + 1; q < items.length; q++) this.collide(items[p], items[q]);
            }
         }
         for (let f = 0; f < FORWARD.length; f++) {
            const o = FORWARD[f];
            const n = this._grid.get(this.cellKey(c.cx + o[0], c.cy + o[1], c.cz + o[2]));
            if (!n || (c.awake === 0 && n.awake === 0)) continue;
            const other = n.items;
            for (let p = 0; p < items.length; p++) {
               for (let q = 0; q < other.length; q++) this.collide(items[p], other[q]);
            }
         }
      }

      // Giải tiếp xúc thấp trước.
      const active = this._active;
      active.length = this._contactCount;
      for (let i = 0; i < this._contactCount; i++) active[i] = this._contacts[i];
      active.sort((p, q) => p.key - q.key);
   }

   /** Tạo tiếp xúc giữa body và các box ground nằm trong các voxel mà hình cầu (bán kính halfY) chạm tới. */
   private groundContacts(b: PhysicsBody) {
      const s = this._cell;
      const reach = b.halfY + this._margin;
      const stamp = ++this._stamp;
      const x0 = Math.floor((b.pos.x - reach) / s);
      const x1 = Math.floor((b.pos.x + reach) / s);
      const y0 = Math.floor((b.pos.y - reach) / s);
      const y1 = Math.floor((b.pos.y + reach) / s);
      const z0 = Math.floor((b.pos.z - reach) / s);
      const z1 = Math.floor((b.pos.z + reach) / s);

      for (let x = x0; x <= x1; x++) {
         for (let y = y0; y <= y1; y++) {
            for (let z = z0; z <= z1; z++) {
               const list = this._groundGrid.get(this.cellKey(x, y, z));
               if (!list) continue;
               for (let i = 0; i < list.length; i++) {
                  const g = list[i];
                  if (g.stamp !== stamp) {
                     g.stamp = stamp;
                     this.groundContact(b, g);
                  }
               }
            }
         }
      }
      for (let i = 0; i < this._bigGrounds.length; i++) this.groundContact(b, this._bigGrounds[i]);
   }

   private groundContact(b: PhysicsBody, box: GroundBox) {
      if (this.boxPenetration(b, box) < -this._margin) return;
      const c = this.nextContact();
      c.a = null;
      c.b = b;
      c.box = box;
      c.nx = this._gnx;
      c.ny = this._gny;
      c.nz = this._gnz;
      c.friction = this.groundFriction;
      c.ima = 0;
      c.imb = 1;
      c.key = b.pos.y - 100;
   }

   /**
    * Độ lún của body (hình cầu bán kính halfY) vào box: dương = đang lún, âm = còn cách box.
    * Ghi pháp tuyến (từ box ra body) vào _gnx/_gny/_gnz. Tâm nằm trong box thì đẩy ra mặt gần nhất (ưu tiên mặt trên).
    */
   private boxPenetration(b: PhysicsBody, box: GroundBox): number {
      const px = b.pos.x;
      const py = b.pos.y;
      const pz = b.pos.z;
      const qx = px < box.minX ? box.minX : px > box.maxX ? box.maxX : px;
      const qy = py < box.minY ? box.minY : py > box.maxY ? box.maxY : py;
      const qz = pz < box.minZ ? box.minZ : pz > box.maxZ ? box.maxZ : pz;
      const dx = px - qx;
      const dy = py - qy;
      const dz = pz - qz;
      const d2 = dx * dx + dy * dy + dz * dz;

      if (d2 > 1e-12) {
         const d = Math.sqrt(d2);
         this._gnx = dx / d;
         this._gny = dy / d;
         this._gnz = dz / d;
         return b.halfY - d;
      }

      // Tâm nằm trong box: tìm mặt gần nhất để đẩy ra.
      const up = box.maxY - py;
      let best = up;
      let nx = 0;
      let ny = 1;
      let nz = 0;
      const down = py - box.minY;
      if (down < best) {
         best = down;
         ny = -1;
      }
      const lx = px - box.minX;
      if (lx < best) {
         best = lx;
         nx = -1;
         ny = 0;
      }
      const rx = box.maxX - px;
      if (rx < best) {
         best = rx;
         nx = 1;
         ny = 0;
      }
      const lz = pz - box.minZ;
      if (lz < best) {
         best = lz;
         nx = 0;
         ny = 0;
         nz = -1;
      }
      const rz = box.maxZ - pz;
      if (rz < best) {
         best = rz;
         nx = 0;
         ny = 0;
         nz = 1;
      }
      this._gnx = nx;
      this._gny = ny;
      this._gnz = nz;
      return b.halfY + best;
   }

   private collide(a: PhysicsBody, b: PhysicsBody) {
      if (a.asleep && b.asleep) return;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dz = b.pos.z - a.pos.z;
      const r = a.radius + b.radius + this._margin;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) return;

      // Vật đang chạy lao vào body ngủ thì đánh thức nó.
      const w2 = this.wakeSpeed * this.wakeSpeed;
      if (a.asleep) {
         const v = b.vel;
         if (v.x * v.x + v.y * v.y + v.z * v.z > w2) this.wake(a);
      } else if (b.asleep) {
         const v = a.vel;
         if (v.x * v.x + v.y * v.y + v.z * v.z > w2) this.wake(b);
      }

      const c = this.nextContact();
      c.a = a;
      c.b = b;
      c.friction = this.friction;
      c.ima = a.asleep ? 0 : 1;
      c.imb = b.asleep ? 0 : 1;
      c.key = Math.min(a.pos.y, b.pos.y);
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
         const c = this._active[i];
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
      const ima = c.ima;
      const imb = c.imb;
      const im = ima + imb;
      if (im === 0) return;

      // Pháp tuyến.
      let dj = -(this.relNormal(c) - c.bias) / im;
      const jn = Math.max(c.jn + dj, 0);
      dj = jn - c.jn;
      c.jn = jn;
      if (ima) a!.vel.set(a!.vel.x - c.nx * dj, a!.vel.y - c.ny * dj, a!.vel.z - c.nz * dj);
      if (imb) b.vel.set(b.vel.x + c.nx * dj, b.vel.y + c.ny * dj, b.vel.z + c.nz * dj);

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
      if (ima) a!.vel.set(a!.vel.x - dx, a!.vel.y - dy, a!.vel.z - dz);
      if (imb) b.vel.set(b.vel.x + dx, b.vel.y + dy, b.vel.z + dz);
   }

   private solvePosition(c: Contact) {
      const a = c.a;
      const b = c.b;
      if (!a) {
         if (!c.box) return;
         const pen = this.boxPenetration(b, c.box);
         if (pen > this._slop) {
            const corr = (pen - this._slop) * 0.8;
            b.pos.set(b.pos.x + this._gnx * corr, b.pos.y + this._gny * corr, b.pos.z + this._gnz * corr);
         }
         return;
      }

      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dz = b.pos.z - a.pos.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const pen = a.radius + b.radius - d;
      if (pen <= this._slop) return;

      const im = c.ima + c.imb;
      if (im === 0) return;
      const corr = (pen - this._slop) * 0.8;
      const nx = d > 1e-6 ? dx / d : 0;
      const ny = d > 1e-6 ? dy / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const wa = (c.ima / im) * corr;
      const wb = (c.imb / im) * corr;
      if (wa) a.pos.set(a.pos.x - nx * wa, a.pos.y - ny * wa, a.pos.z - nz * wa);
      if (wb) b.pos.set(b.pos.x + nx * wb, b.pos.y + ny * wb, b.pos.z + nz * wb);
   }

   // ---------------------------------------------------------------- hiển thị

   private updateVisual(b: PhysicsBody, dt: number) {
      if (b.asleep) {
         // Lần ghi cuối: giữ nguyên góc hiện tại rồi không đụng tới node nữa cho tới khi được đánh thức.
         b.dirty = false;
      } else {
         // Chỉ lăn theo chuyển động khi đủ nhanh; chậm hơn thì giữ nguyên góc (không về 90°).
         const sp = Math.hypot(b.vel.x, b.vel.z);
         if (sp > this.rollSpeed) {
            // Lăn: ω = up x v / r
            Vec3.set(_axis, b.vel.z / sp, 0, -b.vel.x / sp);
            Quat.fromAxisAngle(_q, _axis, (sp / b.radius) * dt);
            Quat.multiply(b.rot, _q, b.rot);
         }
      }

      if (b.useLocal) {
         b.node.setPosition(b.pos);
         b.node.setRotation(b.rot);
      } else {
         b.node.setWorldPosition(b.pos);
         b.node.setWorldRotation(b.rot);
      }
   }
}
