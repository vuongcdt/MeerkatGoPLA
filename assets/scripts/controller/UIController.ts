import { _decorator, Component, Label, Node, Tween, tween, UIOpacity, v3, Vec3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "../views/BlockView";
const { ccclass, property } = _decorator;

/**
 * UI game:
 * - Tutorial "Slide to move": hiện lúc đầu, bàn tay lướt qua lại; ẩn khi người chơi bắt đầu kéo joystick,
 *   hiện lại (fade in) nếu người chơi thả tay và đứng yên quá `idleShowDelay` giây.
 * - Bộ đếm mục tiêu: 3 label ứng với block type 0, 5, 10 (khớp theo BlockView.type), đếm ngược;
 *   về 0 thì ẩn label và hiện dấu tick tương ứng ở `checks`.
 */
@ccclass("UIController")
export class UIController extends Component {
   @property({ type: Node, tooltip: "Bàn tay chỉ dẫn (node con của tutorial)" }) handTutorial: Node = null;
   @property({ type: Node, tooltip: "Node cha của toàn bộ tutorial" }) tutorial: Node = null;
   @property({ type: [Node], tooltip: "Dấu tick, thứ tự trùng với type block" }) checks: Node[] = [];
   @property({ type: [Label], tooltip: "Label đếm ngược, thứ tự trùng với type block" }) totalItems: Label[] = [];
   @property({ type: Node, tooltip: "Node end card, ẩn lúc đầu, hiện khi cả 3 mục tiêu hoàn thành" }) endCard: Node = null;
   @property({ type: Node, tooltip: "Popup bên trong end card (để trống thì dùng chính end card)" }) endPopup: Node = null;
   @property({ tooltip: "Giây chờ sau khi xong mục tiêu cuối rồi mới hiện end card" }) endCardDelay = 0.6;
   @property({ tooltip: "Giây đứng yên (sau khi thả tay) trước khi hiện lại tutorial" }) idleShowDelay = 3;
   @property({ tooltip: "Biên độ lướt của bàn tay (px)" }) handSwipe = 60;

   /** Type block (index trong listItemSpawns) của từng mục tiêu; index trùng với `totalItems` / `checks` / `_totals`. */
   private _types = [0, 5, 10];
   /** Tổng số block mỗi loại, trùng với số ghi sẵn trong label. */
   private _totals = [672, 100, 480];
   private _remain: number[] = [];

   private _handBasePos: Vec3 = v3();
   private _opacity: UIOpacity | null = null;
   private _moving = false;
   private _idleTime = 0;
   private _tutorialShown = false;
   private _ended = false;

   onLoad() {
      this._remain = this._totals.slice();
      this._opacity = this.tutorial?.getComponent(UIOpacity) ?? this.tutorial?.addComponent(UIOpacity) ?? null;
      if (this.handTutorial) {
         this._handBasePos = this.handTutorial.position.clone();
      }
   }

   start() {
      this.checks.forEach((n) => n && (n.active = false));
      this._remain.forEach((_, i) => this.refreshLabel(i));
      if (this.endCard) {
         this.endCard.active = false;
      }
      this.showTutorial(false);
   }

   onEnable() {
      eventTarget.on(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.on(EVENTS.STOP_MOVE, this.onStopMove, this);
      // Sớm nhất là SWALLOWED (vừa chìm xuống mặt hố). EATEN/DESTROYED chỉ là dự phòng; cờ block.counted chặn đếm trùng.
      eventTarget.on(EVENTS.BLOCK_SWALLOWED, this.onBlockNode, this);
      eventTarget.on(EVENTS.BLOCK_EATEN, this.onBlockNode, this);
      eventTarget.on(EVENTS.BLOCK_DESTROYED, this.onBlockDestroyed, this);
   }

   onDisable() {
      eventTarget.off(EVENTS.PLAYER_MOVE, this.onPlayerMove, this);
      eventTarget.off(EVENTS.STOP_MOVE, this.onStopMove, this);
      eventTarget.off(EVENTS.BLOCK_SWALLOWED, this.onBlockNode, this);
      eventTarget.off(EVENTS.BLOCK_EATEN, this.onBlockNode, this);
      eventTarget.off(EVENTS.BLOCK_DESTROYED, this.onBlockDestroyed, this);
      this.stopTutorialTweens();
   }

   update(dt: number) {
      // Đang đứng yên mà tutorial đã ẩn -> đếm giờ để nhắc lại.
      if (this._ended || this._moving || this._tutorialShown) {
         return;
      }
      this._idleTime += dt;
      if (this._idleTime >= this.idleShowDelay) {
         this.showTutorial(true);
      }
   }

   // ---------------------------------------------------------------- Tutorial

   private onPlayerMove() {
      if (this._ended) {
         return;
      }
      this._moving = true;
      this._idleTime = 0;
      if (this._tutorialShown) {
         this.hideTutorial();
      }
   }

   private onStopMove() {
      this._moving = false;
      this._idleTime = 0;
   }

   private showTutorial(fade: boolean) {
      if (!this.tutorial) {
         return;
      }
      this._tutorialShown = true;
      this.tutorial.active = true;
      this.stopTutorialTweens();

      if (this._opacity) {
         this._opacity.opacity = fade ? 0 : 255;
         if (fade) {
            tween(this._opacity).to(0.3, { opacity: 255 }).start();
         }
      }

      // Bàn tay lướt trái <-> phải liên tục.
      if (this.handTutorial) {
         const p = this._handBasePos;
         this.handTutorial.setPosition(p.x - this.handSwipe, p.y, p.z);
         tween(this.handTutorial)
            .repeatForever(
               tween<Node>()
                  .to(0.7, { position: v3(p.x + this.handSwipe, p.y, p.z) }, { easing: "sineInOut" })
                  .to(0.7, { position: v3(p.x - this.handSwipe, p.y, p.z) }, { easing: "sineInOut" }),
            )
            .start();
      }
   }

   private hideTutorial() {
      this._tutorialShown = false;
      this.stopTutorialTweens();
      if (!this.tutorial) {
         return;
      }
      if (!this._opacity) {
         this.tutorial.active = false;
         return;
      }
      tween(this._opacity)
         .to(0.2, { opacity: 0 })
         .call(() => {
            // Người chơi có thể đã thả tay và tutorial hiện lại trong lúc fade -> đừng tắt.
            if (!this._tutorialShown) {
               this.tutorial.active = false;
            }
         })
         .start();
   }

   private stopTutorialTweens() {
      if (this._opacity) {
         Tween.stopAllByTarget(this._opacity);
      }
      if (this.handTutorial) {
         Tween.stopAllByTarget(this.handTutorial);
      }
   }

   // ----------------------------------------------------------- Bộ đếm mục tiêu

   private onBlockNode(node: Node) {
      this.countBlock(node?.getComponent(BlockView));
   }

   private onBlockDestroyed(block: BlockView) {
      this.countBlock(block);
   }

   private countBlock(block: BlockView | null | undefined) {
      if (!block || block.counted) {
         return;
      }
      const type = this._types.indexOf(block.type);
      if (type < 0 || this._remain[type] <= 0) {
         return;
      }
      block.counted = true;
      this._remain[type]--;
      this.refreshLabel(type);
      this.punch(this.totalItems[type]?.node);

      if (this._remain[type] === 0) {
         this.onTypeCompleted(type);
         if (this._remain.every((n) => n <= 0)) {
            this.scheduleOnce(this.showEndCard, this.endCardDelay);
         }
      }
   }

   private refreshLabel(type: number) {
      const label = this.totalItems[type];
      if (label) {
         label.string = `${this._remain[type]}`;
      }
   }

   private onTypeCompleted(type: number) {
      const label = this.totalItems[type];
      const check = this.checks[type];
      if (label) {
         label.node.active = false;
      }
      if (check) {
         check.active = true;
         check.setScale(0, 0, 1);
         tween(check).to(0.35, { scale: v3(1, 1, 1) }, { easing: "backOut" }).start();
      }
   }

   // ---------------------------------------------------------------- End card

   private showEndCard() {
      if (this._ended) {
         return;
      }
      this._ended = true;
      this.hideTutorial();
      if (!this.endCard) {
         return;
      }
      this.endCard.active = true;

      const opacity = this.endCard.getComponent(UIOpacity) ?? this.endCard.addComponent(UIOpacity);
      opacity.opacity = 0;
      tween(opacity).to(0.3, { opacity: 255 }).start();

      const popup = this.endPopup ?? this.endCard;
      popup.setScale(0.6, 0.6, 1);
      tween(popup).to(0.4, { scale: v3(1, 1, 1) }, { easing: "backOut" }).start();
   }

   /** Nảy nhẹ label mỗi lần đếm để người chơi thấy phản hồi. */
   private punch(node: Node | undefined) {
      if (!node) {
         return;
      }
      Tween.stopAllByTarget(node);
      node.setScale(1, 1, 1);
      tween(node).to(0.06, { scale: v3(1.2, 1.2, 1) }).to(0.1, { scale: v3(1, 1, 1) }).start();
   }
}
