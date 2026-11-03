import { _decorator, Collider, Component, ITriggerEvent } from "cc";
import { EVENTS, eventTarget } from "../common/eventTarget";
import { BlockView } from "./BlockView";
const { ccclass } = _decorator;

@ccclass("BlockDestroyer")
export class BlockDestroyer extends Component {
   private _collider: Collider | null = null;

   onLoad() {
      this._collider = this.getComponent(Collider);
   }

   onEnable() {
      this._collider?.on("onTriggerEnter", this.onTriggerEnter, this);
   }

   onDisable() {
      this._collider?.off("onTriggerEnter", this.onTriggerEnter, this);
   }

   private onTriggerEnter(event: ITriggerEvent) {
      const block = event.otherCollider.node.getComponent(BlockView);
      if (!block || !block.isValid) {
         return;
      }
      eventTarget.emit(EVENTS.BLOCK_DESTROYED, block);
      block.node.destroy();
   }
}
