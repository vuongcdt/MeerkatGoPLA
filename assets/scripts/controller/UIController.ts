import { _decorator, Component, Label, Node, Tween, tween, UIOpacity, v3, Vec3 } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "../views/BlockView";
import Super_html_script from "../PLA/Super_html_script";
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
   /** Bàn tay chỉ dẫn (node con của tutorial) */
   @property(Node) handTutorial: Node = null;
   /** Node cha của toàn bộ tutorial */
   @property(Node) tutorial: Node = null;
   /** Dấu tick, thứ tự trùng với type block */
   @property([Node]) checks: Node[] = [];
   /** Label đếm ngược, thứ tự trùng với type block */
   @property([Label]) totalItems: Label[] = [];
   /** Node end card, ẩn lúc đầu, hiện khi cả 3 mục tiêu hoàn thành */
   @property(Node) endCard: Node = null;
   /** Popup bên trong end card (để trống thì dùng chính end card) */
   @property(Node) endPopup: Node = null;
   /** Giây chờ sau khi xong mục tiêu cuối rồi mới hiện end card */
   @property endCardDelay = 0.6;
   /** Giây đứng yên (sau khi thả tay) trước khi hiện lại tutorial */
   @property idleShowDelay = 3;
   /** Sau lần di chuyển đầu tiên, đứng yên liên tục chừng này giây thì tự hiện end card */
   @property idleEndCardTime = 30;
   /** Hình số 8 (infinity): bàn tay chạy quanh tâm node này. Bỏ trống = tâm tutorial */
   @property(Node) infinity: Node = null;
   /** Nửa chiều ngang đường số 8 (px) */
   @property handLoopHalfWidth = 100;
   /** Nửa chiều cao mỗi vòng của số 8 (px) */
   @property handLoopHalfHeight = 40;
   /** Thời gian bàn tay chạy hết 1 vòng số 8 (giây) */
   @property handLoopDuration = 1.6;
   /** Lệch thêm của bàn tay so với đường số 8 (px), để đầu ngón tay nằm đúng trên nét vẽ */
   @property handOffset: Vec3 = v3();
   /** Chữ "Slide to move": phóng to/thu nhỏ 2 nhịp mỗi vòng bàn tay (như bản gốc) */
   @property(Node) tutorialText: Node = null;
   /** Mức phóng to của chữ tutorial (bản gốc 1.2) */
   @property tutorialTextPulse = 1.2;
   /** Các nút Play Now: nhịp "đập" liên tục (như bản gốc) */
   @property([Node]) playButtons: Node[] = [];

   /** Type block (index trong listItemSpawns) của từng mục tiêu; index trùng với `totalItems` / `checks` / `_totals`. */
   private _types = [0, 5, 10];
   /** Tổng số block mỗi loại, trùng với số ghi sẵn trong label. */
   private _totals = [672, 100, 480];
   private _remain: number[] = [];

   /** Tiến độ đi trên đường số 8 (0..1), tween giá trị này rồi đặt vị trí bàn tay theo. */
   private _handPath = { t: 0 };
   private _textBaseScale: Vec3 = v3(1, 1, 1);
   private _opacity: UIOpacity | null = null;
   private _moving = false;
   private _idleTime = 0;
   /** Số giây liên tục người chơi không di chuyển (tính từ sau lần di chuyển đầu tiên), dùng để tự hiện end card. */
   private _noMoveTime = 0;
   /** Người chơi đã di chuyển lần nào chưa. Chưa di chuyển thì không đếm giờ tự hiện end card. */
   private _hasMoved = false;
   private _tutorialShown = false;
   private _ended = false;

   onLoad() {
      this._remain = this._totals.slice();
      this._opacity = this.tutorial?.getComponent(UIOpacity) ?? this.tutorial?.addComponent(UIOpacity) ?? null;
      if (this.tutorialText) {
         this._textBaseScale = this.tutorialText.scale.clone();
      }
   }

   start() {
      this.checks.forEach((n) => n && (n.active = false));
      this._remain.forEach((_, i) => this.refreshLabel(i));
      if (this.endCard) {
         this.endCard.active = false;
      }
      this.showTutorial(false);
      this.endCard.on(Node.EventType.TOUCH_START, this.onCta, this);
      this.playButtons.forEach((btn) => btn && this.pulsePlayButton(btn));
   }

   /**
    * Nhịp "đập" của nút Play Now, chép clip Scale của bản gốc (1.27s/chu kỳ):
    * to dần lên 1.163 (0.72s) -> bóp nhanh 0.938 (0.1s) -> về 1 (0.06s) -> đứng yên tới hết chu kỳ.
    * Nhân theo scale gốc của từng nút.
    */
   private pulsePlayButton(btn: Node) {
      const b = btn.scale.clone();
      const at = (k: number) => v3(b.x * k, b.y * k, b.z);
      Tween.stopAllByTarget(btn);
      btn.on(Node.EventType.TOUCH_START, this.onCta, this);
      tween(btn)
         .repeatForever(
            tween<Node>()
               .to(0.72, { scale: at(1.163) }, { easing: "sineInOut" })
               .to(0.1, { scale: at(0.938) }, { easing: "sineIn" })
               .to(0.06, { scale: at(1) }, { easing: "sineOut" })
               .delay(0.39),
         )
         .start();
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
      if (this._ended || this._moving) {
         return;
      }
      // Đã di chuyển ít nhất 1 lần mà sau đó đứng yên quá lâu -> tự hiện end card.
      if (this._hasMoved) {
         this._noMoveTime += dt;
      }
      if (this._hasMoved && this._noMoveTime >= this.idleEndCardTime) {
         // Như bản gốc: hiện end card im lặng (không phát âm thanh thắng).
         this.showEndCard(true);
         return;
      }
      // Đang đứng yên mà tutorial đã ẩn -> đếm giờ để nhắc lại.
      if (this._tutorialShown) {
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
      this._noMoveTime = 0;
      this._hasMoved = true;
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

      // Chữ tutorial phóng to/thu nhỏ 2 nhịp mỗi vòng bàn tay (bản gốc: 1 -> 1.2 -> 1 -> 1.2 -> 1 trong 1 vòng).
      if (this.tutorialText) {
         const b = this._textBaseScale;
         const big = v3(b.x * this.tutorialTextPulse, b.y * this.tutorialTextPulse, b.z);
         const half = this.handLoopDuration / 4;
         this.tutorialText.setScale(b);
         tween(this.tutorialText)
            .repeatForever(tween<Node>().to(half, { scale: big }, { easing: "sineInOut" }).to(half, { scale: b.clone() }, { easing: "sineInOut" }))
            .start();
      }

      // Bàn tay chạy theo hình số 8 nằm liên tục.
      if (this.handTutorial) {
         this._handPath.t = 0;
         this.placeHand(0);
         tween(this._handPath)
            .repeatForever(
               tween<{ t: number }>()
                  .set({ t: 0 })
                  .to(this.handLoopDuration, { t: 1 }, { onUpdate: (target: { t: number }) => this.placeHand(target.t) })
                  .delay(0.3),
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

   /**
    * Đặt bàn tay tại điểm `t` (0..1) trên đường số 8 nằm (lemniscate Gerono):
    * x = W·sin(θ), y = H·sin(2θ), θ = 2πt. t = 0 ở giữa, 0.25 mép phải, 0.75 mép trái.
    */
   private placeHand(t: number) {
      const theta = t * Math.PI * 2;
      const c = this.infinity ? this.infinity.position : Vec3.ZERO;
      this.handTutorial.setPosition(
         c.x + this.handLoopHalfWidth * Math.sin(theta) + this.handOffset.x,
         c.y + this.handLoopHalfHeight * Math.sin(theta * 2) + this.handOffset.y,
         c.z,
      );
   }

   private stopTutorialTweens() {
      Tween.stopAllByTarget(this._handPath);
      if (this.tutorialText) {
         Tween.stopAllByTarget(this.tutorialText);
      }
      if (this._opacity) {
         Tween.stopAllByTarget(this._opacity);
      }
      if (this.handTutorial) {
         Tween.stopAllByTarget(this.handTutorial);
      }
   }

   // ----------------------------------------------------------- Bộ đếm mục tiêu

   /** Block đã phát âm thanh "ăn" (SWALLOWED rồi EATEN cùng 1 block chỉ phát 1 lần). */
   private _collected = new WeakSet<Node>();

   private onBlockNode(node: Node) {
      const isTarget = this.countBlock(node?.getComponent(BlockView));
      if (node && !this._collected.has(node)) {
         this._collected.add(node);
         eventTarget.emit(EVENTS.BLOCK_COLLECTED, isTarget);
      }
   }

   private onBlockDestroyed(block: BlockView) {
      this.countBlock(block);
   }

   /** Đếm block nếu là mục tiêu còn đang đếm. Trả về true nếu block được tính là mục tiêu. */
   private countBlock(block: BlockView | null | undefined): boolean {
      if (!block || block.counted) {
         return false;
      }
      const type = this._types.indexOf(block.type);
      if (type < 0 || this._remain[type] <= 0) {
         return false;
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
      return true;
   }

   private refreshLabel(type: number) {
      const label = this.totalItems[type];
      if (label) {
         label.string = `${this._remain[type]}`;
      }
   }

   private onTypeCompleted(type: number) {
      eventTarget.emit(EVENTS.TARGET_COMPLETED, type);
      const label = this.totalItems[type];
      const check = this.checks[type];
      if (label) {
         label.node.active = false;
      }
      if (check) {
         check.active = true;
         check.setScale(0, 0, 1);
         tween(check)
            .to(0.35, { scale: v3(1, 1, 1) }, { easing: "backOut" })
            .start();
      }
   }

   // ---------------------------------------------------------------- End card

   /** silent = true: hiện end card vì người chơi không di chuyển, không tính là thắng (không phát âm thanh thắng). */
   private showEndCard(silent?: boolean) {
      if (this._ended) {
         return;
      }
      this._ended = true;
      // scheduleOnce truyền dt (số) vào tham số đầu -> chỉ coi là im lặng khi đúng bằng true.
      if (silent !== true) {
         eventTarget.emit(EVENTS.GAME_WIN);
      }
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
      tween(popup)
         .to(0.4, { scale: v3(1, 1, 1) }, { easing: "backOut" })
         .start();
   }

   /** Nảy nhẹ label mỗi lần đếm để người chơi thấy phản hồi. */
   private punch(node: Node | undefined) {
      if (!node) {
         return;
      }
      Tween.stopAllByTarget(node);
      node.setScale(1, 1, 1);
      tween(node)
         .to(0.06, { scale: v3(1.2, 1.2, 1) })
         .to(0.1, { scale: v3(1, 1, 1) })
         .start();
   }

   private onCta() {
      Super_html_script.on_click_game_end();
      Super_html_script.on_click_download();
   }
}
