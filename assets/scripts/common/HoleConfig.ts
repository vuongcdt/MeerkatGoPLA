/** Thông số hố, chép từ LevelConfig / ItemConfig của bản gốc. */
export const HoleConfig = {
   /** XP cần để lên level tiếp theo. Vượt quá mảng thì dùng mốc cuối. */
   requiredXP: [10, 20, 70, 100, 130, 400, 450, 500, 600, 700, 800, 950, 1100, 1300, 1500, 1750, 2000, 2250, 2500],
   startScale: 1,
   scaleGrowth: 0.2,
   startRadius: 3,
   scaleRadius: 0.4,
   speedGrowth: 1.1,
   /** Camera lùi ra theo growth^level. */
   cameraGrowth: 1.05,
   /** XP của từng loại block, không khai thì 1. */
   points: { obj_77: 5, obj_78: 5 } as Record<string, number>,

   getRequiredXP(level: number) {
      return this.requiredXP[Math.min(level, this.requiredXP.length - 1)];
   },
   getScale(level: number) {
      return this.startScale + this.scaleGrowth * level;
   },
   getRadius(level: number) {
      return this.startRadius + this.scaleRadius * level;
   },
   getSpeedMultiplier(level: number) {
      return Math.pow(this.speedGrowth, level);
   },
   getPoints(name: string) {
      return this.points[name] ?? 1;
   },
};
