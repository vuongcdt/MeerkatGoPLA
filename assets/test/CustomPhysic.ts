import { Node, Quat, v3, Vec3 } from "cc";

export class PhysicsBody {
   public readonly pos = v3();
   public readonly vel = v3();
   public readonly rot = new Quat();
   public radius: number;
   public halfY: number;
   public readonly node: Node;
   public sleepTimer = 0;
   public asleep = false;
   public snapped = false;
   public dirty = true;
   public useLocal = false;
   public isStatic = false;

   constructor(node: Node, radius: number, halfY: number) {
      this.node = node;
      this.radius = radius;
      this.halfY = halfY;
      this.pos.set(node.worldPosition);
      this.rot.set(node.worldRotation);
   }
}

export class CustomPhysic {
   running = false;
   gravity = -10;
   maxSpeed = 15;
   linearDamping = 0.1;
   size = 1;

   private readonly _grounds: Node[] = [];
   private readonly _bodies: PhysicsBody[] = [];
   readonly _voxel: Map<number, Set<PhysicsBody>> = new Map();

   addGround(node: Node) {}

   addBody(node: Node, size: Vec3 = node.worldScale) {
      this.size = size.y;
      const radius = Math.max(size.x, size.y, size.z) * 0.5;
      const body = new PhysicsBody(node, radius, size.y * 0.5);
      const key = this.getKey(v3(node.worldPosition));
      const value = this.getVoxel(key);

      value.add(body);
      this._voxel.set(key, value);
      this._bodies.push(body);
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

   private getVoxel(voxelKey: number) {
      const voxel = this._voxel.get(voxelKey) ?? new Set<PhysicsBody>();
      if (voxel.size === 0) {
         this._voxel.set(voxelKey, voxel);
      }
      return voxel;
   }

   private getKey(pos: Vec3) {
      return Math.floor(pos.x / this.size) + Math.floor(pos.y / this.size) * 100 + Math.floor(pos.z / this.size) * 10000;
   }
}
