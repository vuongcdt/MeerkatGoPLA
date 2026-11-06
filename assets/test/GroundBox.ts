import { Node, Vec3 } from "cc";

/**
 * Box tĩnh (AABB, bỏ qua xoay của node) dùng làm mặt đất / vật cản cho SimplePhysics, LitePhysics và CustomPhysic.
 * Box được đọc từ node ở runtime (lúc tạo, và mỗi frame qua `sync()` do physic gọi nên di chuyển/đổi kích thước node là tự cập nhật),
 * không cần khai báo kích thước thủ công:
 * - Truyền `size` (và `center`, mặc định = vị trí world của node): dùng đúng kích thước đó.
 * - Không truyền: lấy từ BoxCollider của node (size/center nhân worldScale); không có collider thì dùng worldScale (mesh 1x1x1).
 */
export class GroundBox {
   public minX = 0;
   public minY = 0;
   public minZ = 0;
   public maxX = 0;
   public maxY = 0;
   public maxZ = 0;
   public readonly node: Node;
   /** Các key ô lưới mà box đang đăng ký (rỗng nếu box quá lớn và nằm trong danh sách box lớn). Do physic quản lý. */
   public keys: number[] = [];
   public big = false;
   /** Đánh dấu lượt truy vấn để một box trải trên nhiều ô chỉ bị xét một lần cho mỗi body. Do physic quản lý. */
   public stamp = 0;

   private readonly _size: Vec3 | null;
   private readonly _center: Vec3 | null;
   /** BoxCollider của node (tra một lần, null nếu node không có). */
   private _col: { size: Vec3; center: Vec3 } | null | undefined = undefined;

   constructor(node: Node, size?: Vec3, center?: Vec3) {
      this.node = node;
      this._size = size ? size.clone() : null;
      this._center = center ? center.clone() : null;
      this.refresh();
   }

   /** Đọc lại box từ node; trả về true nếu box thay đổi so với lần đọc trước (node bị di chuyển/đổi kích thước). */
   public sync(): boolean {
      const x0 = this.minX;
      const y0 = this.minY;
      const z0 = this.minZ;
      const x1 = this.maxX;
      const y1 = this.maxY;
      const z1 = this.maxZ;
      this.refresh();
      const e = 1e-5;
      return (
         Math.abs(this.minX - x0) > e ||
         Math.abs(this.minY - y0) > e ||
         Math.abs(this.minZ - z0) > e ||
         Math.abs(this.maxX - x1) > e ||
         Math.abs(this.maxY - y1) > e ||
         Math.abs(this.maxZ - z1) > e
      );
   }

   /** Đọc lại box từ node (không báo thay đổi). */
   public refresh() {
      const node = this.node;
      const ws = node.worldScale;
      const wp = node.worldPosition;
      let sx = ws.x;
      let sy = ws.y;
      let sz = ws.z;
      let cx = wp.x;
      let cy = wp.y;
      let cz = wp.z;

      if (this._size) {
         sx = this._size.x;
         sy = this._size.y;
         sz = this._size.z;
         if (this._center) {
            cx = this._center.x;
            cy = this._center.y;
            cz = this._center.z;
         }
      } else {
         if (this._col === undefined) {
            this._col = ((node as any).getComponent?.("cc.BoxCollider") as { size: Vec3; center: Vec3 } | null) ?? null;
         }
         const col = this._col;
         if (col) {
            sx = col.size.x * Math.abs(ws.x);
            sy = col.size.y * Math.abs(ws.y);
            sz = col.size.z * Math.abs(ws.z);
            cx += col.center.x * ws.x;
            cy += col.center.y * ws.y;
            cz += col.center.z * ws.z;
         }
      }

      this.minX = cx - sx * 0.5;
      this.maxX = cx + sx * 0.5;
      this.minY = cy - sy * 0.5;
      this.maxY = cy + sy * 0.5;
      this.minZ = cz - sz * 0.5;
      this.maxZ = cz + sz * 0.5;
   }
}
