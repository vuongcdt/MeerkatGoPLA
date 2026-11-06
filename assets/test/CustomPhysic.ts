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
      const key = this.getKey(v3(node.worldPosition).multiplyScalar(1 / this.size));
      const value = this._voxel.get(key) ?? new Set<PhysicsBody>();

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
         const voxel = this._voxel.get(voxelKey) ?? new Set<PhysicsBody>();

         if (voxel.size > 1) {
            b.vel.y = 0;
            continue;
         }

         if (b.pos.y >= b.halfY) {
            b.pos.add(v3(b.vel).multiplyScalar(dt));
            b.node.worldPosition = b.pos;
            b.node.worldRotation = b.rot;
            b.dirty = true;
         }

         const newKey = this.getKey(b.pos);

         if (newKey !== voxelKey[0]) {
            voxel.delete(b);
            const newValue = this._voxel.get(newKey) ?? new Set<PhysicsBody>();
            newValue.add(b);
            this._voxel.set(newKey, newValue);
         }
      }
   }

   private getKey(pos: Vec3) {
      return Math.floor(pos.x / this.size) + Math.floor(pos.y / this.size) * 100 + Math.floor(pos.z / this.size) * 10000;
   }
}
