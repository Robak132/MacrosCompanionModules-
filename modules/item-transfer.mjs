import Utility from "./utility.mjs";

export default class ItemTransfer {
  static setupItemHandler(sheet, html) {
    if (!game.settings.get("wfrp4e-macros-and-more", "transfer-item-gui")) return;

    let link = '<a class="item-control item-transfer" title="Transfer Item"><i class="fas fa-hands-helping"></i></a>';
    $(link).insertAfter(html.find(".inventory .inventory-list .item-post"));
    $(link).insertBefore(html.find(".inventory .inventory-list .item-remove"));
    html.find(".item-control.item-transfer").on("click", ItemTransfer.transferItemHandler.bind(sheet.actor));
  }

  static transferItemHandler(e) {
    e.preventDefault();
    const item = this.items.find((item) => item.id === e.currentTarget.closest(".item").dataset.itemId);
    ItemTransfer.#createDialog(this, item);
  }

  static async transferItems(transferObjects) {
    const groupedObjects = [];
    for (const transferObject of transferObjects) {
      if (game.user.isGM) {
        await this.handleTransfer(transferObject);
      } else if (!game.users.find((u) => u.active && u.isGM)) {
        return ui.notifications.error("You cannot offer item to other player's actor when is GM not present");
      } else {
        await game.socket.emit(`module.wfrp4e-macros-and-more`, {
          type: "transferItem",
          payload: transferObject
        });
      }

      if (transferObject.sourceActorId === transferObject.targetActorId) {
        continue;
      }
      const obj = groupedObjects.find(
        (o) => o.sourceActorId === transferObject.sourceActorId && o.targetActorId === transferObject.targetActorId
      );
      if (obj === undefined) {
        groupedObjects.push({
          sourceActorId: transferObject.sourceActorId,
          targetActorId: transferObject.targetActorId,
          value: [transferObject]
        });
      } else {
        obj.value.push(transferObject);
      }
    }

    const msg = groupedObjects
      .map((group) => {
        return `
        <b>From: </b>${game.actors.get(group.sourceActorId).name}<br>
        <b>To: </b>${game.actors.get(group.targetActorId).name}<br>
        <b>Items: </b>
        <ul>${group.value.map((o) => `<li>${o.item.name} (${o.quantity})</li>`).join("")}</ul>`;
      })
      .join("<hr>");
    if (msg !== "") {
      ChatMessage.create({
        user: game.userId,
        speaker: ChatMessage.getSpeaker(),
        content: "<h1>Item Transfer Raport</h1>" + msg,
        whisper: game.users.filter((u) => u.isGM).map((u) => u._id)
      });
    }
  }

  static async handleTransfer({item, targetActorId, targetContainerId, sourceActorId, sourceContainerId, quantity}) {
    const sourceActor = game.actors.get(sourceActorId);
    const targetActor = game.actors.get(targetActorId);
    let updatedItem = foundry.utils.duplicate(item);

    // Global Transfer
    if (sourceActorId !== targetActorId || item.system.quantity.value !== quantity) {
      Utility.log(`Adding ${updatedItem._id} to ${targetActorId} (${targetContainerId})`);
      const foundItem = this.#findItems(item, targetActor, quantity, targetContainerId);
      if (foundItem) {
        Utility.log(`Duplicate found: ${foundItem._id}`);
        updatedItem = await this.#updateItem({
          item: foundItem,
          actor: targetActor,
          quantity: foundItem.system.quantity.value + quantity
        });
      } else {
        const createdItem = foundry.utils.duplicate(item);
        createdItem.system.quantity.value = quantity;
        createdItem.system.location.value = "";

        updatedItem = (await targetActor.createEmbeddedDocuments("Item", [createdItem]))[0];
        Utility.log(`Duplicate not found: Creating ${updatedItem._id}`);
      }
      Utility.log(`Removing ${item._id} from ${sourceActorId} (${sourceContainerId})`);
      await this.#updateItem({
        item,
        actor: sourceActor,
        quantity: item.system.quantity.value - quantity
      });
    }

    // Local Transfer
    if (sourceActorId === targetActorId || (sourceActorId !== targetActorId && targetContainerId !== "")) {
      Utility.log(`Transfer ${updatedItem._id} from ${sourceContainerId} to ${targetContainerId}`);
      const foundItem = this.#findItems(updatedItem, targetActor, quantity, targetContainerId);
      if (foundItem) {
        Utility.log(`Duplicate found: ${foundItem._id}`);
        await this.#updateItem({
          item: foundItem,
          actor: targetActor,
          quantity: foundItem.system.quantity.value + quantity
        });
        await this.#updateItem({
          item: updatedItem,
          actor: targetActor,
          quantity: updatedItem.system.quantity.value - quantity
        });
      } else {
        Utility.log(`Duplicate not found: Moving ${updatedItem._id}`);
        await this.#moveItem(updatedItem, targetActor, targetContainerId);
      }
    }
  }

  static async #moveItem(item, actor, containerId) {
    Utility.log(`Updating ${item._id}: changing location to ${containerId}`);
    const update = {
      _id: item._id,
      "system.location.value": containerId,
      "system.equipped": false,
      "system.worn.value": false
    };
    return (await actor.updateEmbeddedDocuments("Item", [update]))[0];
  }

  static async #updateItem({item, actor, quantity}) {
    Utility.log(`Updating ${item._id}: changing quantity to ${quantity}`);
    const update = {
      _id: item._id,
      "system.quantity.value": quantity,
      "system.equipped": false,
      "system.worn.value": false
    };
    const updatedItem = (await actor.updateEmbeddedDocuments("Item", [update]))[0];
    if (updatedItem.system.quantity.value === 0) {
      Utility.log(`Deleting ${item._id}`);
      await actor.deleteEmbeddedDocuments("Item", [item._id]);
      return null;
    }
  }

  static #findItems(sourceItem, actor, quantity, containerId) {
    for (const actorItem of actor.items) {
      const dupActorItem = foundry.utils.duplicate(actorItem);
      const dupSourceItem = foundry.utils.duplicate(sourceItem);

      if (dupActorItem.name !== dupSourceItem.name) {
        continue;
      }
      if (dupActorItem.system.quantity?.value == null || dupActorItem.system.quantity.value - quantity < 0) {
        continue;
      }

      dupActorItem.system.location.value = Utility.clean(dupActorItem.system.location.value);
      dupSourceItem.system.location.value = Utility.clean(containerId);
      if (
        Utility.isObjectEqual(dupActorItem.system, dupSourceItem.system, ["quantity.value", "equipped", "worn.value"])
      ) {
        return actorItem;
      }
    }
    return null;
  }

  static #createDialog(actor, item) {
    new Dialog({
      title: "Transfer Item",
      content: `
        <form>
          <div class="form-group">
            <label style="flex: 1" >Quantity</label>
            <input style="flex: 3" class="slider" id="quantitySlider" min="1" max="${item.system.quantity.value}" value="${item.system.quantity.value}" type="range">
            <input style="flex: 1;text-align: center" id="quantity" min="1" max="${item.system.quantity.value}" value="${item.system.quantity.value}" type="number">
          </div>
          <div class="form-group">
            <label style="flex: 1">Players:</label>
            <select style="flex: 4"
                    data-source-actor="${actor.id}"
                    data-source-container="${item.system.location.value}">
              ${this.createSelectTag(actor.id, item.system.location.value)}
            </select>
          </div>
        </form>
        <script>
          document.getElementById('quantity').oninput = function() {
            document.getElementById('quantitySlider').value = this.value;
          };
          document.getElementById('quantitySlider').oninput = function() {
            document.getElementById('quantity').value = this.value;
          };
        </script>`,
      buttons: {
        yes: {
          icon: '<i class="fas fa-check"></i>',
          label: "Transfer Item",
          callback: (html) => {
            let quantity = document.getElementById("quantity").value;
            if (isNaN(quantity)) {
              Utility.log("Item quantity invalid");
              return ui.notifications.error("Item quantity invalid.");
            } else {
              quantity = Number(quantity);
            }

            const transferObjects = $(html)
              .find("select")
              .map((_, e) => {
                return {
                  item,
                  targetActorId: e.options[e.options.selectedIndex].dataset.targetActor,
                  targetContainerId: Utility.clean(e.options[e.options.selectedIndex].dataset.targetContainer),
                  sourceActorId: e.dataset.sourceActor,
                  sourceContainerId: Utility.clean(e.dataset.sourceContainer),
                  quantity
                };
              })
              .get();
            return this.transferItems(transferObjects);
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "yes"
    }).render(true);
  }

  static createSelectTag(sourceActorId, sourceContainerId) {
    const cleanedSourceContainerId = Utility.clean(sourceContainerId);
    let select = "";
    for (const actor of Utility.getStashableActors().sort((a) => (a.id === sourceActorId ? -1 : 1))) {
      select += `
          <option style="font-weight: bold;"
                  data-target-container=""
                  data-target-actor="${actor.id}"
                  ${actor.id === sourceActorId && cleanedSourceContainerId === "" ? "disabled" : ""}
                  label="${actor.name}">`;
      for (const container of Utility.getContainers(actor)) {
        select += `
          <option data-target-container="${container.id}"
                  data-target-actor="${actor.id}" 
                  ${actor.id === sourceActorId && container.id === cleanedSourceContainerId ? "disabled" : ""}
                  label="&nbsp;&nbsp;&nbsp;&nbsp;${container.name}">`;
      }
    }
    const isGMActive = !!game.users.find((u) => u.active && u.isGM);
    const otherActors = Utility.getTransferableActors().map(
      (actor) => `
          <option style="font-weight: bold;"
                  data-target-container=""
                  data-target-actor="${actor.id}"
                  ${isGMActive ? "" : "disabled"}
                  label="${actor.name}">`
    );
    if (otherActors.length !== 0) {
      select += "<option disabled>──────────</option>" + otherActors.join("");
    }
    return select;
  }
}
