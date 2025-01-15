import Utility from "./utility.mjs";
import SliderDialog from "./slider-dialog.mjs";

class ActorInventory {
  /**
   * @param {object} actor - The actor object.
   */
  constructor(actor) {
    this.actor = actor;
    this.inventory = this.processItems();
  }

  /**
   * @returns {string} - The actor's ID.
   */
  get id() {
    return this.actor.id;
  }

  /**
   * @returns {string} - The actor's name.
   */
  get name() {
    return this.actor.name;
  }

  /**
   * @returns {string} - The actor's name in uppercase.
   */
  get nameUpperCase() {
    return this.name.toLocaleUpperCase("pl");
  }

  /** @returns {number} - The actor's current encumbrance. */
  get currentEnc() {
    return (
      this.noContainerItems.reduce((acc, x) => acc + x.encumbrance, 0) +
      this.containers.filter((a) => a.name !== "").reduce((acc, x) => acc + x.encumbrance, 0)
    );
  }

  /** @returns {number} - The actor's maximum encumbrance. */
  get maxEnc() {
    return this.actor.system.status.encumbrance.max;
  }

  /** @returns {ContainerInventory[]} */
  get noContainerItems() {
    let items = this.inventory[""]?.items ?? [];
    return items.sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }

  /** @returns {ContainerInventory[]} */
  get containers() {
    return Object.values(this.inventory)
      .filter((c) => c.item)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * @param {Object} x - The item object.
   * @returns {string} - The item type.
   */
  formatItemType(x) {
    const type = x.type === "trapping" ? x.system.trappingType.value : x.type;
    return type === "" ? "misc" : type;
  }

  /** @returns {{[p: string]: ContainerInventory}} **/
  processItems() {
    let inventory = Object.fromEntries(this.actor.itemTypes.container.map((c) => [c.id, new ContainerInventory(c)]));
    inventory[""] = new ContainerInventory();
    const items = [
      ...this.actor.itemTypes.weapon,
      ...this.actor.itemTypes.ammunition,
      ...this.actor.itemTypes.armour,
      ...this.actor.itemTypes.money,
      ...this.actor.itemTypes.trapping
    ].map((i) => new InventoryEntry(i));
    const itemsCategorised = Utility.groupBy(items, (x) => x.location);
    for (const [key, value] of Object.entries(itemsCategorised)) {
      inventory[key] = inventory[key] ?? new ContainerInventory(this.actor.items.get(key));
      inventory[key].items = value;
    }
    return inventory;
  }

  /**
   * @param {string | null} containerId
   * @returns {InventoryEntry[]}
   */
  getItems(containerId = null) {
    return containerId != null
      ? this.inventory[containerId].items
      : Object.values(this.inventory).flatMap((c) => c.items);
  }

  /**
   * @param {string} itemId
   * @returns {InventoryEntry}
   */
  getItem(itemId) {
    return this.getItems().find((i) => i.id === itemId);
  }
}

class ContainerInventory {
  /** @param {object} [item] - The container object. */
  constructor(item) {
    this.item = item;
    this.items = [];
  }

  /** @returns {string} - The container's ID. */
  get id() {
    return this.item?.id ?? "";
  }

  /** @returns {string} - The container's name. */
  get name() {
    return this.item?.name ?? "No Container";
  }

  /** @returns {number} - The container's carrying capacity. */
  get carriesCurrent() {
    let value = this.items.reduce((prev, cur) => Number(prev) + Number(cur.encumbrance), 0);
    return Utility.round(value, 2);
  }

  /** @returns {number} - The container's carrying capacity. */
  get carriesMax() {
    return this.item.system.carries.value;
  }

  /** @returns {string} */
  get img() {
    return this.item.img;
  }

  /** @returns {number} */
  get quantity() {
    return this.item.system.quantity.value;
  }

  /** @returns {number} */
  get encumbrance() {
    return Number(this.item.system.encumbrance.total);
  }

  /** @returns {string} */
  get encumbranceFormatted() {
    const total = this.encumbrance.toFixed(2);
    const value = Number(this.item.system.encumbrance.value * this.quantity).toFixed(2);
    return total === value ? this.encumbrance : `${Utility.round(total, 2)} (${Utility.round(value, 2)})`;
  }

  /**
   * @param {string} id
   * @returns {InventoryEntry}
   */
  getItem(id) {
    return this.items.find((i) => i.id === id);
  }

  /** @param {InventoryEntry} itemEntry */
  addItem(itemEntry) {
    this.items.push(itemEntry);
  }
}

class InventoryEntry {
  /**
   * @param {object} item - The item object.
   * @param {number | null} quantity - The quantity of the item.
   * @param {boolean | null} isEquipped - Whether the item is equipped.
   */
  constructor(item, quantity = null, isEquipped = null) {
    this.item = item;
    this.quantity = quantity ?? item.system.quantity.value;
    this.isEquipped = isEquipped ?? item.system.isEquipped;
  }

  static from({item, quantity, isEquipped}) {
    return new InventoryEntry(item, quantity, isEquipped);
  }

  /**
   * @returns {string} - The item's ID.
   */
  get id() {
    return this.item.id;
  }

  /**
   * @returns {string} - The item's name.
   */
  get name() {
    return this.item.name;
  }

  /**
   * @returns {string} - The item's location.
   */
  get location() {
    return Utility.clean(this.item.location.value);
  }

  /** @returns {number} - The item's encumbrance value. */
  get baseEncumbrance() {
    let enc = this.item.system.encumbrance.value;
    if (this.item.system.encumbrance.value % 1 !== 0) {
      enc = Utility.floor(enc, 2);
    }
    if (this.item.properties?.qualities?.lightweight && enc >= 1) enc -= 1;
    if (this.item.properties?.flaws?.bulky) enc += 1;
    return enc;
  }

  /** @returns {number} */
  get encumbrance() {
    let enc = Utility.floor(this.baseEncumbrance * this.quantity, 2);
    if (this.isEquipped && this.item.system.weighsLessEquipped) {
      enc = Math.max(0, enc - 1);
    }
    return enc;
  }

  /** @returns {string} */
  get encumbranceFormatted() {
    let enc = Utility.floor(this.baseEncumbrance * this.quantity, 2);
    if (this.isEquipped && this.item.system.weighsLessEquipped) {
      let fixedEnc = Math.max(0, enc - 1);
      if (fixedEnc !== enc) {
        return `${fixedEnc} (${enc})`;
      }
    }
    return `${enc}`;
  }

  /** @returns {string} */
  get img() {
    return this.item.img;
  }
}

/**
 * @typedef {Object} InventoryTransaction
 * @property {string} itemId - The ID of the item.
 * @property {number} quantity - The quantity of the item.
 * @property {string} sourceActorId - The ID of the source actor.
 * @property {string} sourceContainerId - The ID of the source container.
 * @property {string} targetActorId - The ID of the target actor.
 * @property {string} targetContainerId - The ID of the target container.
 */

/**
 * Gets the order of a category for sorting purposes.
 * @param {string} x - The category name.
 * @returns {number} - The order of the category.
 */
function getCategoryOrder(x) {
  switch (x) {
    case "weapon":
      return 3;
    case "ammunition":
      return 2;
    case "armour":
      return 1;
    default:
      return 0;
  }
}

export default class InventoryManager extends FormApplication {
  /**
   * Creates an instance of InventoryManager.
   * @param {Object} actor - The actor object.
   * @param {Object} [object={}] - Additional options for the form.
   * @param {Object} [options={}] - Additional options for the form application.
   * @property {InventoryTransaction[]} transactions - The list of transactions to be processed.
   */
  constructor(actor, object = {}, options = {}) {
    super(object, options);
    this.actors = Utility.getStashableActors().map((a) => new ActorInventory(a));
    this.actors = this.actors.toSorted((a, b) => a.actor.name.localeCompare(b.actor.name));

    this.leftActorIndex = this.actors.findIndex((a) => a.id === game.user.character?.id) ?? 0;
    this.rightActorIndex = this.leftActorIndex === 0 ? 1 : 0;
    this.transactions = [];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "macro-and-more-inventory-manager",
      title: "Inventory Manager",
      template: "modules/wfrp4e-macros-and-more/templates/inventory-manager.hbs",
      width: 800,
      height: 600
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("change", `select[id="leftPageSelect"]`, (ev) => {
      this.leftActorIndex = Number(ev.target.value);
      this.render(true);
    });
    html.on("change", `select[id="rightPageSelect"]`, (ev) => {
      this.rightActorIndex = Number(ev.target.value);
      this.render(true);
    });
    const dragDrop = new DragDrop({
      dropSelector: ".actor-inventory",
      dragSelector: ".actor-inventory-entry",
      callbacks: {drop: this.onDrop.bind(this), dragstart: this.onDrag.bind(this)}
    });
    dragDrop.bind(html[0]);
  }

  onDrag(ev) {
    ev.dataTransfer.setData(
      "text/plain",
      JSON.stringify({
        itemId: $(ev.currentTarget).attr("data-item-id"),
        sourceContainerId: $(ev.currentTarget.parentElement).attr("data-source-container-id"),
        sourceActorId: $(ev.currentTarget.parentElement.parentElement).attr("data-source-actor-id")
      })
    );
  }

  async onDrop(ev) {
    /** @type {InventoryTransaction} */
    let data = JSON.parse(ev.dataTransfer.getData("text/plain"));
    data = foundry.utils.mergeObject(data, {
      quantity: 1,
      targetActorId: $(ev.currentTarget.parentElement).attr("data-source-actor-id"),
      targetContainerId: $(ev.currentTarget).attr("data-source-container-id")
    });
    if (data.sourceActorId === data.targetActorId && data.sourceContainerId === data.targetContainerId) return;

    let maxQuantity = this.getActorInventory(data.sourceActorId).getItem(data.itemId).quantity;
    let response = 1;
    if (maxQuantity !== 1) {
      response = await SliderDialog.create({
        title: "How much do you want to transfer?",
        maxValue: this.getActorInventory(data.sourceActorId).getItem(data.itemId).quantity
      });
    }
    if (!response) return;
    data.quantity = response;

    if (data.targetContainerId !== "") {
      let item = this.getActorInventory(data.sourceActorId).getItem(data.itemId);
      let targetContainer = this.getActorInventory(data.targetActorId).inventory[data.targetContainerId];
      if (item.baseEncumbrance * data.quantity + targetContainer.carriesCurrent > targetContainer.carriesMax) {
        return ui.notifications.error("Not enough space in the target container.");
      }
    }

    this.transactions.push(data);
    this.visualHandleTransfer(data);
    this.render(true);
  }

  /**
   * @param {string} id
   * @returns {ActorInventory}
   */
  getActorInventory(id) {
    return this.actors.find((a) => a.id === id);
  }

  async getData(options = {}) {
    const data = super.getData();
    data.actors = this.actors;
    data.leftActor = this.actors[this.leftActorIndex];
    data.leftActorIndex = this.leftActorIndex;
    data.rightActor = this.actors[this.rightActorIndex];
    data.rightActorIndex = this.rightActorIndex;
    return data;
  }

  visualHandleTransfer({itemId, quantity, targetActorId, targetContainerId, sourceActorId, sourceContainerId}) {
    const sourceActorInv = this.getActorInventory(sourceActorId);
    const targetActorInv = this.getActorInventory(targetActorId);
    let itemEntry = sourceActorInv.getItem(itemId);

    const foundItem = this.findItemToMerge(itemEntry, quantity, targetActorInv, targetContainerId);
    if (foundItem) {
      foundItem.quantity += quantity;
    } else {
      let createdItemEntry = InventoryEntry.from(itemEntry);
      createdItemEntry.quantity = quantity;
      createdItemEntry.isEquipped = false;
      targetActorInv.inventory[targetContainerId].addItem(createdItemEntry);
    }
    itemEntry.quantity -= quantity;
    if (itemEntry.quantity === 0) {
      sourceActorInv.inventory[sourceContainerId].items = sourceActorInv
        .getItems(sourceContainerId)
        .filter((i) => i.id !== itemEntry.id);
    }
  }

  /**
   * @param {InventoryEntry} sourceInvEntry
   * @param {ActorInventory} actor
   * @param {number} quantity
   * @param {string} containerId
   * @returns {InventoryEntry|null}
   */
  findItemToMerge(sourceInvEntry, quantity, actor, containerId) {
    for (let actorInvEntry of actor.getItems(containerId)) {
      if (actorInvEntry.name !== sourceInvEntry.name) continue;
      if (actorInvEntry.quantity == null || sourceInvEntry.quantity - quantity < 0) continue;
      if (
        Utility.isObjectEqual(actorInvEntry.item.system, sourceInvEntry.item.system, [
          "quantity",
          "encumbrance.total",
          "equipped",
          "worn",
          "location"
        ])
      ) {
        return actorInvEntry;
      }
    }
    return null;
  }

  /**
   * Adds event listeners to the rendered HTML.
   * @param {Object} html - The HTML content of the dialog.
   */
  getRenderScripts(html) {
    $(html)
      .find("input[type=range]")
      .on("input", (e) => {
        $(e.target).next().val(e.target.value);
      });
    $(html)
      .find("input[type=number]")
      .on("input", (e) => {
        $(e.target).prev().val(e.target.value);
      });
    $(html)
      .find("select")
      .on("input", function () {
        let slider = document.getElementsByName(this.name)[0];
        let input = document.getElementsByName(this.name)[1];
        if (input.value === "0") {
          slider.value = slider.max;
          input.value = slider.max;
        }
        if (this.options[this.options.selectedIndex].label === "") {
          slider.value = slider.min;
          input.value = slider.min;
        }
      });
  }

  /**
   * @param {string} html - The HTML form element.
   */
  async transferItems(html) {
    const itemTransfers = $(html)
      .find("select")
      .map((_, e) => {
        return {
          item: game.actors.get(e.dataset.sourceActor).items.get(e.dataset.item),
          targetActorId: e.options[e.options.selectedIndex].dataset.targetActor,
          targetContainerId: e.options[e.options.selectedIndex].dataset.targetContainer,
          sourceActorId: e.dataset.sourceActor,
          sourceContainerId: e.dataset.sourceContainer,
          quantity: Number($(html).find(`input[type=number][name=${e.dataset.item}]`).val())
        };
      })
      .get()
      .filter((s) => s.targetContainerId != null && s.targetActorId != null);
    Utility.log(itemTransfers);
    await game.robakMacros.transferItem.transferItems(itemTransfers);
  }
}
