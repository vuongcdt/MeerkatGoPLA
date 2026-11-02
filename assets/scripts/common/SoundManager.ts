import { _decorator, AudioSource, Component, Node } from "cc";
import { AsyncUtils } from "./AsyncUtils";
const { ccclass, property } = _decorator;

@ccclass("SoundManager")
export class SoundManager extends Component {
   public static instance: SoundManager = null;

   @property(AudioSource) clickBobbin: AudioSource = null;
   @property(AudioSource) clickFailBobbin: AudioSource = null;
   @property(AudioSource) moveBobbin: AudioSource = null;
   @property(AudioSource) nextBobbin: AudioSource = null;
   @property(AudioSource) newBobbin: AudioSource = null;
   @property(AudioSource) winSound: AudioSource = null;
   @property(AudioSource) loseSound: AudioSource = null;
   @property([AudioSource]) completeBobbins: AudioSource[] = [];
   @property([AudioSource]) pullsWools: AudioSource[] = [];

   private _index = 0;

   protected onLoad(): void {
      if (SoundManager.instance == null) {
         SoundManager.instance = this;
      }
   }

   protected onDisable(): void {
      SoundManager.instance = null;
   }

   playPullWoolsSound() {
      this.pullsWools[this._index++ % this.pullsWools.length].play();
   }

   playFailBobbinSound() {
      this.clickFailBobbin.play();
   }

   playMoveBobbinSound() {
      this.moveBobbin.play();
   }

   playCompleteBobbinSound() {
      this.completeBobbins[this._index++ % this.completeBobbins.length].play();
   }

   playClickBobbinSound() {
      this.clickBobbin.play();
   }

   playNextBobbinSound() {
      this.nextBobbin.play();
   }

   playWinSound() {
      this.winSound.play();
   }
   
   playLoseSound() {
      this.loseSound.play();
   }
   
   playNewBobbinSound() {
      this.newBobbin.play();
   }
}
