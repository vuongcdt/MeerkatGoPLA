import { _decorator, AudioClip, AudioSource, Component, director, Input, input } from "cc";
import { EVENTS, eventTarget } from "./eventTarget";
const { ccclass, property } = _decorator;

/**
 * Âm thanh game:
 * - Nhạc nền lặp (volume 0.3). Trình duyệt / mạng quảng cáo chặn tự phát tiếng nên lần chạm đầu tiên
 *   sẽ resume AudioContext và phát lại nhạc nền nếu chưa chạy.
 * - SFX: mỗi clip có một nhóm AudioSource dùng xoay vòng (nhiều block bị nuốt cùng lúc vẫn kêu được),
 *   cùng một clip không phát 2 lần trong < 2 frame để không bị rè khi nuốt hàng loạt.
 */
@ccclass("SoundManager")
export class SoundManager extends Component {
   public static instance: SoundManager = null;

   @property(AudioClip) bgm: AudioClip = null;
   /** Ăn block thường */
   @property(AudioClip) collect: AudioClip = null;
   /** Ăn block mục tiêu */
   @property(AudioClip) objectiveConsume: AudioClip = null;
   /** Hoàn thành một loại mục tiêu */
   @property(AudioClip) objectiveComplete: AudioClip = null;
   /** Hố lên level */
   @property(AudioClip) levelUp: AudioClip = null;
   /** Thắng (hiện end card) */
   @property(AudioClip) win: AudioClip = null;

   @property bgmVolume = 0.3;
   @property sfxVolume = 1;
   /** Số AudioSource xoay vòng cho mỗi clip */
   @property poolSize = 6;

   private _bgm: AudioSource | null = null;
   private _pools = new Map<AudioClip, { sources: AudioSource[]; next: number; lastFrame: number }>();

   onLoad() {
      if (!SoundManager.instance) {
         SoundManager.instance = this;
      }
      this._bgm = this.addComponent(AudioSource);
      this._bgm.playOnAwake = false;
   }

   start() {
      this.playBGM();
   }

   onEnable() {
      input.on(Input.EventType.TOUCH_START, this.onFirstTouch, this);
      eventTarget.on(EVENTS.BLOCK_COLLECTED, this.onCollected, this);
      eventTarget.on(EVENTS.TARGET_COMPLETED, this.onTargetCompleted, this);
      eventTarget.on(EVENTS.LEVEL_UP, this.onLevelUp, this);
      eventTarget.on(EVENTS.GAME_WIN, this.onWin, this);
   }

   onDisable() {
      input.off(Input.EventType.TOUCH_START, this.onFirstTouch, this);
      eventTarget.off(EVENTS.BLOCK_COLLECTED, this.onCollected, this);
      eventTarget.off(EVENTS.TARGET_COMPLETED, this.onTargetCompleted, this);
      eventTarget.off(EVENTS.LEVEL_UP, this.onLevelUp, this);
      eventTarget.off(EVENTS.GAME_WIN, this.onWin, this);
   }

   onDestroy() {
      if (SoundManager.instance === this) {
         SoundManager.instance = null;
      }
   }

   playBGM() {
      if (!this._bgm || !this.bgm) {
         return;
      }
      if (this._bgm.clip === this.bgm && this._bgm.playing) {
         return;
      }
      this._bgm.clip = this.bgm;
      this._bgm.loop = true;
      this._bgm.volume = this.bgmVolume;
      this._bgm.play();
   }

   playSFX(clip: AudioClip | null) {
      if (!clip) {
         return;
      }
      let pool = this._pools.get(clip);
      if (!pool) {
         pool = { sources: [], next: 0, lastFrame: -10 };
         for (let i = 0; i < this.poolSize; i++) {
            const source = this.addComponent(AudioSource);
            source.playOnAwake = false;
            source.clip = clip;
            pool.sources.push(source);
         }
         this._pools.set(clip, pool);
      }
      const frame = director.getTotalFrames();
      if (frame - pool.lastFrame < 2) {
         return;
      }
      pool.lastFrame = frame;
      const source = pool.sources[pool.next];
      pool.next = (pool.next + 1) % pool.sources.length;
      source.stop();
      source.volume = this.sfxVolume;
      source.currentTime = 0;
      source.play();
   }

   /** Lần chạm đầu: mở khoá audio của trình duyệt rồi phát nhạc nền (nếu lúc load bị chặn). */
   private onFirstTouch() {
      input.off(Input.EventType.TOUCH_START, this.onFirstTouch, this);
      const ctx = (this._bgm as any)?._player?._gainNode?.context as AudioContext | undefined;
      if (ctx && ctx.state === "suspended") {
         ctx.resume();
      }
      this.playBGM();
   }

   private onCollected(isTarget: boolean) {
      this.playSFX(isTarget ? this.objectiveConsume : this.collect);
   }

   private onTargetCompleted() {
      this.playSFX(this.objectiveComplete);
   }

   private onLevelUp() {
      this.playSFX(this.levelUp);
   }

   private onWin() {
      this.playSFX(this.win);
   }
}
