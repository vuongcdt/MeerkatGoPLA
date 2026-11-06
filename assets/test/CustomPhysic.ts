import { Node, Quat, v3, Vec3 } from "cc";

export class PhysicsBody {
   public readonly pos = v3();
   public readonly vel = v3();
   public readonly rot = new Quat();
   /** Bán kính hình cầu bao quanh cube: dùng cho va chạm giữa các cube. */
   public radius: number;
   /** Nửa chiều cao thật của cube: dùng cho va chạm với mặt đất để cube nằm sát đất. */
   public halfY: number;
   public readonly node: Node;
   public readonly id: number;
   /** Key voxel hiện tại của cube. */
   public key = 0;
   public sleepTimer = 0;
   public asleep = false;
   public snapped = false;
   public dirty = true;
   public useLocal = false;
   public isStatic = false;

   constructor(id: number, node: Node, radius: number, halfY: number) {
      this.id = id;
      this.node = node;
      this.radius = radius;
      this.halfY = halfY;
      this.pos.set(node.worldPosition);
      this.rot.set(node.worldRotation);
   }
}

/** Độ lệch key của 13 voxel lân cận "phía trước" (key = x + 100y + 10000z, chỉ lấy độ lệch dương). */
const FORWARD: number[] = [];

for (let dz = 0; dz <= 1; dz++) {
   for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
         const offset = dx + dy * 100 + dz * 10000;

         if (offset > 0) {
            FORWARD.push(offset);
         }
      }
   }
}

/**
 * Mỗi cube là một hình cầu: cube rơi lên cube khác thì trượt khỏi nhau theo mặt cầu nên đống đổ xòe ra.
 * - Va chạm cầu-cầu: đẩy ra theo pháp tuyến, triệt tiêu vận tốc đang lao vào nhau (không nảy), ma sát Coulomb
 *   giới hạn bởi lực ép. Thành phần trọng lực dọc theo mặt cầu chính là thứ làm cube trượt.
 * - Tìm cube lân cận bằng lưới voxel `_voxel` (cạnh voxel >= đường kính cầu nên chỉ cần xét 27 voxel quanh cube).
 * - Chạy fixed-step; cube nằm yên đủ lâu thì ngủ, bị cube đang chạy nhanh lao vào thì thức dậy.
 */
export class CustomPhysic {
   running = false;
   gravity = -10;
   maxSpeed = 15;
   linearDamping = 0.1;
   /** Cạnh một voxel (m): tự tính = đường kính cầu * 1.05 của cube lớn nhất. */
   size = 1;
   /** Ma sát giữa các cube. Thấp thì cube dễ trượt khỏi nhau (đống dẹt), cao thì đống dốc hơn. */
   friction = 0.35;
   /** Ma sát với mặt đất. */
   groundFriction = 0.6;
   /** Bán kính cầu = nửa cạnh lớn nhất của cube * hệ số này. Lớn hơn thì cube dễ trượt khỏi nhau hơn. */
   radiusScale = 1.1;
   /** Lệch ngẫu nhiên (m) khi thêm cube để phá thế cân bằng của cột cube thẳng hàng. */
   jitter = 0.003;
   /** Số vòng giải va chạm mỗi bước. */
   iterations = 3;
   /** Bước thời gian cố định (không phụ thuộc FPS). */
   fixedDt = 1 / 120;
   maxSubSteps = 4;
   /** Cube chậm hơn ngưỡng này (m/s) liên tục `sleepTime` giây thì ngủ. */
   sleepSpeed = 0.08;
   sleepTime = 1;
   /** Cube nhanh hơn ngưỡng này (m/s) chạm vào cube đang ngủ sẽ đánh thức nó. */
   wakeSpeed = 0.3;

   private readonly _grounds: Node[] = [];
   private readonly _bodies: PhysicsBody[] = [];
   readonly _voxel: Map<number, Set<PhysicsBody>> = new Map();
   /** Danh sách cặp cube đang chạm nhau, xếp phẳng [a0, b0, a1, b1, ...]; a luôn là cube đang thức. Dựng lại mỗi bước. */
   private readonly _pairs: PhysicsBody[] = [];
   private _acc = 0;
   private _seed = 20240601;

   /** Sai số cho phép khi cho hai cube coi là đang chạm / nằm sát đất. */
   private readonly _slop = 0.002;

   addGround(node: Node) {}

   addBody(node: Node, size: Vec3 = node.worldScale) {
      const radius = Math.max(size.x, size.y, size.z) * 0.5 * this.radiusScale;
      const body = new PhysicsBody(this._bodies.length, node, radius, size.y * 0.5);
      body.pos.x += (this.rand() - 0.5) * 2 * this.jitter;
      body.pos.z += (this.rand() - 0.5) * 2 * this.jitter;
      this._bodies.push(body);

      const need = radius * 2 * 1.05;

      if (this._bodies.length === 1 || need > this.size) {
         // Voxel đổi cạnh thì key của mọi cube đổi theo: dựng lại lưới.
         this.size = need;
         this.rebuildVoxels();
      } else {
         body.key = this.getKey(body.pos);
         this.getVoxel(body.key).add(body);
      }

      return body;
   }

   removeBody(node: Node) {}

   update(dt: number) {
      if (!this.running) {
         return;
      }

      for (const b of this._bodies) {
         if (b.asleep) {
            continue;
         }

         b.vel.y += this.gravity * dt;
         const speed = b.vel.length();

         if (speed > this.maxSpeed) {
            b.vel.multiplyScalar(this.maxSpeed / speed);
         }

         const voxelKey = this.getKey(b.pos);
         const voxel = this.getVoxel(voxelKey);

         // Vị trí kế tiếp và độ cao có thể đáp xuống (đất hoặc đỉnh cube đang nằm yên ngay bên dưới).
         const next = v3(b.pos).add(v3(b.vel).multiplyScalar(dt));
         let landY = -Infinity;
         const bottom = next.y - b.halfY;

         if (bottom <= 0) {
            landY = b.halfY;
         } else {
            const below = this._voxel.get(this.getKey(v3(next.x, bottom, next.z)));

            if (below) {
               for (const o of below) {
                  if (o !== b && o.asleep) {
                     landY = Math.max(landY, o.pos.y + this.size);
                  }
               }
            }
         }

         if (landY > -Infinity) {
            next.y = landY;
            b.vel.set(0, 0, 0);
            b.asleep = true;
         }

         b.pos.set(next);
         b.node.worldPosition = b.pos;

         const newKey = this.getKey(b.pos);

         if (newKey !== voxelKey) {
            voxel.delete(b);
            const newValue = this.getVoxel(newKey);
            newValue.add(b);
            this._voxel.set(newKey, newValue);
         }
      }
   }

   //    update(dt: number) {
   //       if (!this.running) {
   //          return;
   //       }

   //       this._acc = Math.min(this._acc + dt, this.fixedDt * this.maxSubSteps);

   //       while (this._acc >= this.fixedDt) {
   //          this.substep(this.fixedDt);
   //          this._acc -= this.fixedDt;
   //       }

   //       for (const b of this._bodies) {
   //          if (b.dirty) {
   //             b.node.worldPosition = b.pos;
   //             b.dirty = false;
   //          }
   //       }
   //    }

   private substep(dt: number) {
      const damp = Math.max(0, 1 - this.linearDamping * dt);

      // 1. Tích phân vận tốc và vị trí.
      let anyAwake = false;

      for (const b of this._bodies) {
         if (b.asleep) {
            continue;
         }

         anyAwake = true;
         const v = b.vel;
         v.y += this.gravity * dt;
         v.multiplyScalar(damp);
         const speed = v.length();

         if (speed > this.maxSpeed) {
            v.multiplyScalar(this.maxSpeed / speed);
         }

         b.pos.set(b.pos.x + v.x * dt, b.pos.y + v.y * dt, b.pos.z + v.z * dt);
         b.dirty = true;
      }

      if (!anyAwake) {
         return;
      }

      // 2. Tìm các cặp đang chạm một lần, rồi giải va chạm vài vòng trên danh sách đó.
      this.findPairs();
      const pairs = this._pairs;

      for (let it = 0; it < this.iterations; it++) {
         for (const b of this._bodies) {
            if (!b.asleep) {
               this.collideGround(b);
            }
         }

         for (let i = 0; i < pairs.length; i += 2) {
            this.collidePair(pairs[i], pairs[i + 1]);
         }
      }

      // 3. Ngủ + chuyển voxel cho cube đã di chuyển.
      const sleepSpeed2 = this.sleepSpeed * this.sleepSpeed;

      for (const b of this._bodies) {
         if (b.asleep) {
            continue;
         }

         const v = b.vel;

         if (v.x * v.x + v.y * v.y + v.z * v.z < sleepSpeed2) {
            b.sleepTimer += dt;

            if (b.sleepTimer >= this.sleepTime) {
               b.asleep = true;
               v.set(0, 0, 0);
            }
         } else {
            b.sleepTimer = 0;
         }
      }

      this.updateVoxels();
   }

   /** Va chạm với mặt đất y = 0: đẩy lên, triệt tiêu vận tốc đi xuống, ma sát làm chậm vận tốc ngang. */
   private collideGround(b: PhysicsBody) {
      const pen = b.halfY - b.pos.y;

      if (pen <= -this._slop) {
         return;
      }

      if (pen > 0) {
         b.pos.y += pen;
      }

      if (b.vel.y < 0) {
         const jn = -b.vel.y;
         b.vel.y = 0;
         this.applyFriction(b, null, 0, 1, 0, jn, this.groundFriction);
      }
   }

   /**
    * Duyệt từng voxel: ghép cặp các cube trong cùng voxel, và với 13 voxel lân cận "phía trước" (đủ để mỗi cặp voxel
    * chỉ duyệt một lần). Chỉ giữ cặp thật sự chạm nhau mà có ít nhất một cube đang thức.
    */
   private findPairs() {
      this._pairs.length = 0;

      for (const [key, cell] of this._voxel) {
         for (const a of cell) {
            for (const b of cell) {
               if (a.id < b.id) {
                  this.addPair(a, b);
               }
            }
         }

         for (let i = 0; i < FORWARD.length; i++) {
            const next = this._voxel.get(key + FORWARD[i]);

            if (!next) {
               continue;
            }

            for (const a of cell) {
               for (const b of next) {
                  this.addPair(a, b);
               }
            }
         }
      }
   }

   private addPair(a: PhysicsBody, b: PhysicsBody) {
      if (a.asleep && b.asleep) {
         return;
      }

      const dx = a.pos.x - b.pos.x;
      const dy = a.pos.y - b.pos.y;
      const dz = a.pos.z - b.pos.z;
      const r = a.radius + b.radius;

      if (dx * dx + dy * dy + dz * dz >= r * r) {
         return;
      }

      // Đặt cube đang thức lên trước; cube thức chạy nhanh lao vào cube ngủ thì đánh thức nó.
      const [awake, other] = a.asleep ? [b, a] : [a, b];

      if (other.asleep && awake.vel.lengthSqr() > this.wakeSpeed * this.wakeSpeed) {
         other.asleep = false;
         other.sleepTimer = 0;
         other.dirty = true;
      }

      this._pairs.push(awake, other);
   }

   /** Va chạm cầu-cầu giữa b (đang thức) và o (ngủ hoặc đang thức). Pháp tuyến n hướng từ o sang b. */
   private collidePair(b: PhysicsBody, o: PhysicsBody) {
      const dx = b.pos.x - o.pos.x;
      const dy = b.pos.y - o.pos.y;
      const dz = b.pos.z - o.pos.z;
      const r = b.radius + o.radius;
      const d2 = dx * dx + dy * dy + dz * dz;

      if (d2 >= r * r) {
         return;
      }

      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 0;
      const ny = d > 1e-6 ? dy / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const pen = r - d;

      // Đẩy ra: cube ngủ đứng yên, hai cube đang chạy chia đôi.
      const share = o.asleep ? 1 : 0.5;

      if (pen > this._slop) {
         const corr = (pen - this._slop) * share;
         b.pos.set(b.pos.x + nx * corr, b.pos.y + ny * corr, b.pos.z + nz * corr);

         if (!o.asleep) {
            o.pos.set(o.pos.x - nx * corr, o.pos.y - ny * corr, o.pos.z - nz * corr);
            o.dirty = true;
         }
      }

      // Triệt tiêu vận tốc lao vào nhau (không nảy).
      const im = o.asleep ? 1 : 2;
      const rx = b.vel.x - (o.asleep ? 0 : o.vel.x);
      const ry = b.vel.y - (o.asleep ? 0 : o.vel.y);
      const rz = b.vel.z - (o.asleep ? 0 : o.vel.z);
      const vn = rx * nx + ry * ny + rz * nz;

      if (vn >= 0) {
         return;
      }

      const jn = -vn / im;
      b.vel.set(b.vel.x + nx * jn, b.vel.y + ny * jn, b.vel.z + nz * jn);

      if (!o.asleep) {
         o.vel.set(o.vel.x - nx * jn, o.vel.y - ny * jn, o.vel.z - nz * jn);
      }

      this.applyFriction(b, o.asleep ? null : o, nx, ny, nz, jn, this.friction);
   }

   /**
    * Ma sát Coulomb sau khi đã triệt tiêu vận tốc pháp tuyến: giảm vận tốc tiếp tuyến tương đối nhưng không quá `mu * jn`.
    * jn càng lớn (ép càng mạnh) thì ma sát càng lớn. `o` = null nghĩa là vật tĩnh (đất hoặc cube đang ngủ).
    */
   private applyFriction(b: PhysicsBody, o: PhysicsBody | null, nx: number, ny: number, nz: number, jn: number, mu: number) {
      const rx = b.vel.x - (o ? o.vel.x : 0);
      const ry = b.vel.y - (o ? o.vel.y : 0);
      const rz = b.vel.z - (o ? o.vel.z : 0);
      const vn = rx * nx + ry * ny + rz * nz;
      const tx = rx - nx * vn;
      const ty = ry - ny * vn;
      const tz = rz - nz * vn;
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz);

      if (len < 1e-9) {
         return;
      }

      const im = o ? 2 : 1;
      const jt = Math.min(len / im, mu * jn);
      const k = jt / len;
      b.vel.set(b.vel.x - tx * k, b.vel.y - ty * k, b.vel.z - tz * k);

      if (o) {
         o.vel.set(o.vel.x + tx * k, o.vel.y + ty * k, o.vel.z + tz * k);
      }
   }

   private rand() {
      this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0;
      return this._seed / 4294967296;
   }

   // ---------------------------------------------------------------- voxel

   private rebuildVoxels() {
      this._voxel.clear();

      for (const b of this._bodies) {
         b.key = this.getKey(b.pos);
         this.getVoxel(b.key).add(b);
      }
   }

   /** Cube nào đã sang voxel khác thì chuyển voxel (cube ngủ không di chuyển nên bỏ qua). */
   private updateVoxels() {
      for (const b of this._bodies) {
         if (b.asleep) {
            continue;
         }

         const newKey = this.getKey(b.pos);

         if (newKey !== b.key) {
            const old = this.getVoxel(b.key);
            old.delete(b);

            if (old.size === 0) {
               this._voxel.delete(b.key);
            }

            this.getVoxel(newKey).add(b);
            b.key = newKey;
         }
      }
   }

   private getVoxel(voxelKey: number) {
      let voxel = this._voxel.get(voxelKey);

      if (!voxel) {
         voxel = new Set<PhysicsBody>();
         this._voxel.set(voxelKey, voxel);
      }

      return voxel;
   }

   private getKey(pos: Vec3) {
      return Math.floor(pos.x / this.size) + Math.floor(pos.y / this.size) * 100 + Math.floor(pos.z / this.size) * 10000;
   }
}
