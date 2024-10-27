import Utility from "./utility.mjs";
import CurrencyApp from "./currency-app.mjs";

class Region {
  /**
   * @param key {string}
   * @param name {string}
   * @param coins {Coin[]}
   * @param exchangeRates {object}
   */
  constructor(key, name, coins, exchangeRates) {
    this.key = key;
    this.name = name;
    this.coins = coins;
    this.exchangeRates = exchangeRates;
  }

  /**
   * @param json {object}
   * @returns {Region}
   */
  static fromJson(json) {
    return new Region(
      json.key,
      game.i18n.localize(json.name),
      json.coins.map((c) => Coin.fromJson(c)),
      json.exchangeRates
    );
  }

  /**
   * @returns {Coin} main coin
   */
  getMainCoin() {
    return this.coins.reduce((prev, curr) => (prev.value > curr.value ? prev : curr));
  }
}

class Coin {
  /**
   * @param key {string}
   * @param name {string}
   * @param image {string}
   * @param value {number}
   */
  constructor(key, name, image, value) {
    this.key = key;
    this.name = name;
    this.image = image;
    this.value = value;
  }

  get img() {
    return this.image ?? "modules/wfrp4e-core/icons/currency/goldcrown.png";
  }

  /**
   * @param json {object}
   * @returns {Coin}
   */
  static fromJson(json) {
    return new Coin(json.key, game.i18n.localize(json.name), json.img, json.value);
  }
}

class CurrencySet {
  /**
   * @param region {Region}
   * @param coins {object[]}
   */
  constructor(region, coins = []) {
    this.region = region;
    this.coins = coins;
  }

  /** @returns {number} */
  getValue() {
    return this.coins
      .map((coin) => coin.system.quantity.value * coin.system.coinValue.value)
      .reduce((acc, val) => acc + val, 0);
  }

  getExchangeModifier(targetRegion, currentRegion = RobakMarketWfrp4e.currentRegion) {
    return RobakMarketWfrp4e.getExchangeModifier(targetRegion, this.region, currentRegion);
  }

  getConvertedValue(targetRegion, currentRegion = RobakMarketWfrp4e.currentRegion) {
    return RobakMarketWfrp4e.getConvertedValue(this.getValue(), targetRegion, this.region, currentRegion);
  }
}

export async function overrideMarket() {
  libWrapper.register(
    "wfrp4e-macros-and-more",
    `ChatWFRP._onMarketButtonClicked`,
    async function (wrapper, event) {
      if (["payItem", "creditItem"].includes($(event.currentTarget).attr("data-button"))) {
        await onMarketButtonClicked.call(this, event);
      } else {
        wrapper.call(this, event);
      }
    },
    "MIXED"
  );
  libWrapper.register(
    "wfrp4e-macros-and-more",
    `ActorSheetWFRP4e.prototype._onDropMoney`,
    async function (dragData) {
      await onDropMoney.call(this, dragData);
    },
    "OVERRIDE"
  );
  libWrapper.register(
    "wfrp4e-macros-and-more",
    `ActorSheetWFRP4e.prototype._onMoneyIconClicked`,
    async function (ev) {
      await onMoneyIconClicked.call(this, ev);
    },
    "OVERRIDE"
  );
  libWrapper.register(
    "wfrp4e-macros-and-more",
    `ActorSheetWFRP4eNPC.prototype._onNpcIncomeClick`,
    async function (event) {
      await onNpcIncomeClick.call(this, event);
    },
    "OVERRIDE"
  );

  for (let method of Utility.getMethods(MarketWFRP4e)) {
    Utility.log(`Registering ${method}`);
    libWrapper.register(
      "wfrp4e-macros-and-more",
      `MarketWFRP4e.${method}`,
      (wrapper, ...args) => {
        if (RobakMarketWfrp4e.hasOwnProperty(method)) return RobakMarketWfrp4e[method].call(this, ...args);
        return wrapper.call(this, ...args);
      },
      "MIXED"
    );
  }
  Utility.log("Market override succeeded");
}

async function onMoneyIconClicked(ev) {
  ev.preventDefault();
  let {currencies} = RobakMarketWfrp4e.groupMoney(this.actor, RobakMarketWfrp4e.currentRegion);
  for (let currency of Object.values(currencies)) {
    await RobakMarketWfrp4e.updateActorsCoins(this.actor, currency, currency.getValue());
  }
}

async function onMarketButtonClicked(event) {
  let msg = game.messages.get($(event.currentTarget).parents(".message").attr("data-message-id"));
  switch ($(event.currentTarget).attr("data-button")) {
    case "payItem":
      if (!game.user.isGM) {
        let actor = game.user.character;
        let itemData;
        if (msg.flags.transfer) itemData = JSON.parse(msg.flags.transfer).payload;
        if (actor) {
          let succeeded = await RobakMarketWfrp4e.payCommand($(event.currentTarget).attr("data-pay"), actor);
          if (succeeded) {
            WFRP_Audio.PlayContextAudio({item: {type: "money"}, action: "lose"});
            if (itemData) {
              actor.createEmbeddedDocuments("Item", [itemData]);
              ui.notifications.notify(game.i18n.format("MARKET.ItemAdded", {item: itemData.name, actor: actor.name}));
            }
          }
        } else {
          ui.notifications.notify(game.i18n.localize("MARKET.NotifyNoActor"));
        }
      } else {
        ui.notifications.notify(game.i18n.localize("MARKET.NotifyUserMustBePlayer"));
      }
      break;
    case "creditItem":
      if (!game.user.isGM) {
        let actor = game.user.character;
        if (actor) {
          let dataExchange = $(event.currentTarget).attr("data-amount");
          let money = await RobakMarketWfrp4e.creditCommand(dataExchange, actor);
          if (money) {
            WFRP_Audio.PlayContextAudio({item: {type: "money"}, action: "gain"});
            let instances = msg.getFlag("wfrp4e", "instances") - 1;
            let messageUpdate = {};
            if (instances <= 0) {
              messageUpdate = {content: `<p><strong>${game.i18n.localize("CHAT.NoMoreLeft")}</strong></p>`};
            } else {
              messageUpdate = {"flags.wfrp4e.instances": instances};
            }
            game.socket.emit("system.wfrp4e", {type: "updateMsg", payload: {id: msg.id, updateData: messageUpdate}});
          }
        } else {
          ui.notifications.notify(game.i18n.localize("MARKET.NotifyNoActor"));
        }
      } else {
        ui.notifications.notify(game.i18n.localize("MARKET.NotifyUserMustBePlayer"));
      }
      break;
  }
}

async function onDropMoney(dragData) {
  let moneyString = dragData.payload;
  let type = moneyString.slice(-1);
  let amt;
  if (type === "b") {
    amt = Math.round(moneyString.slice(0, -1));
  } else if (type === "s") {
    amt = Number.fromString(moneyString.slice(0, -1)) * 20;
  } else if (type === "g") {
    amt = Number.fromString(moneyString.slice(0, -1)) * 240;
  }
  let requestedRegion = RobakMarketWfrp4e.currentRegion;
  let {currencies} = RobakMarketWfrp4e.groupMoney(this.actor, requestedRegion);
  let currency = currencies[requestedRegion.key];
  await RobakMarketWfrp4e.updateActorsCoins(this.actor, currency, currency.getValue() + amt);
}

async function onNpcIncomeClick(event) {
  let status = this.actor.details.status.value.split(" ");
  let dieAmount = game.wfrp4e.config.earningValues[WFRP_Utility.findKey(status[0], game.wfrp4e.config.statusTiers)][0];
  dieAmount = Number(dieAmount) * status[1];
  let moneyEarned;
  if (WFRP_Utility.findKey(status[0], game.wfrp4e.config.statusTiers) != "g") {
    dieAmount = dieAmount + "d10";
    moneyEarned = (await new Roll(dieAmount).roll()).total;
  } else {
    moneyEarned = dieAmount;
  }

  let amt;
  switch (WFRP_Utility.findKey(status[0], game.wfrp4e.config.statusTiers)) {
    case "b":
      amt = moneyEarned;
      break;
    case "s":
      amt = moneyEarned * 12;
      break;
    case "g":
      amt = moneyEarned * 240;
      break;
  }

  let requestedRegion = RobakMarketWfrp4e.currentRegion;
  await RobakMarketWfrp4e.validateMoney(this.actor, requestedRegion);
  let {currencies} = RobakMarketWfrp4e.groupMoney(this.actor, requestedRegion);
  let currency = currencies[requestedRegion.key];
  await RobakMarketWfrp4e.updateActorsCoins(this.actor, currency, currency.getValue() + amt);
}

export default class RobakMarketWfrp4e extends MarketWFRP4e {
  static get currentRegion() {
    return RobakMarketWfrp4e.regions[game.settings.get("wfrp4e-macros-and-more", "current-region")];
  }

  static getKeyValueRegions() {
    return Object.fromEntries(Object.values(RobakMarketWfrp4e.regions).map((region) => [region.key, region.name]));
  }

  static async loadRegions() {
    let regions = await fetch("modules/wfrp4e-macros-and-more/data/regions.json").then((r) => r.json());
    RobakMarketWfrp4e.regions = Object.fromEntries(
      Object.entries(regions).map(([key, r]) => [key, Region.fromJson(r)])
    );
  }

  /**
   * Directly execute the pay command.
   * @param amount {string} The amount to pay.
   * @param actor {object}  The actor making the payment.
   */
  static async directPayCommand(amount, actor) {
    await RobakMarketWfrp4e.payCommand(amount, actor);
  }

  /**
   * Execute the pay command.
   * @param {string} cmd - The command string.
   * @param {object} actor - The actor making the payment.
   * @param {object} - Additional options.
   * @returns {Promise<boolean>} Whether the payment was successful.
   * @override
   */
  static async payCommand(cmd, actor) {
    let [command, regionKey, strictMode] = cmd.split("@");
    let requestedRegion = regionKey ? RobakMarketWfrp4e.regions[regionKey] : RobakMarketWfrp4e.currentRegion;
    strictMode ??= false;

    let moneyValue = RobakMarketWfrp4e.parseMoneyTransactionStringToValue(command);
    if (!moneyValue) {
      await RobakMarketWfrp4e.printPayWrongCommand();
      return false;
    }

    let {currencies, total} = RobakMarketWfrp4e.groupMoney(actor, requestedRegion);
    let requestedCurrency = currencies[requestedRegion.key];

    if (requestedCurrency?.getValue() >= moneyValue) {
      Utility.log("Paying with requested currency");
      await RobakMarketWfrp4e.validateMoney(actor, requestedRegion);
      let {paid} = await RobakMarketWfrp4e.payInCurrency(actor, requestedRegion, requestedCurrency, moneyValue);
      RobakMarketWfrp4e.throwMoney(moneyValue);
      await RobakMarketWfrp4e.printPaySummary(actor, requestedRegion, [{currency: requestedCurrency, value: paid}]);
      return true;
    } else if (!strictMode && total >= moneyValue) {
      Utility.log("Paying with requested and/or converted currency");
      let selectedCurrencies = await RobakMarketWfrp4e.getCurrencyFromApp(
        Object.values(currencies),
        moneyValue,
        requestedRegion
      );
      if (!selectedCurrencies) return false;

      let paySummary = [];
      for (let currency of selectedCurrencies) {
        if (moneyValue === 0) break;
        await RobakMarketWfrp4e.validateMoney(actor, currency.region);
        let {paid, remaining} = await RobakMarketWfrp4e.payInCurrency(actor, requestedRegion, currency, moneyValue);
        moneyValue = remaining;
        paySummary.push({currency, value: paid});
        Utility.log(`Paid ${RobakMarketWfrp4e.formatMoney(paid)} ${currency.region.getMainCoin().name}`);
      }
      RobakMarketWfrp4e.throwMoney(moneyValue);
      await RobakMarketWfrp4e.printPaySummary(actor, requestedRegion, paySummary);
      return true;
    } else {
      Utility.log("Not enough money");
      await RobakMarketWfrp4e.printNotEnoughMoney(moneyValue, requestedRegion, Object.values(currencies), total);
    }
    return false;
  }

  /**
   * Handles payment of currency for an actor.
   * @param {object} actor - The actor whose currency will be modified.
   * @param {Region} requestedRegion - The region to convert currency to.
   * @param {CurrencySet} currency - The currency details to use for the transaction (local currency).
   * @param {number} gValue - The total change to pay (global currency).
   * @returns {Promise<{paid: number, remaining: number}>} An object containing the paid and remaining amounts.
   */
  static async payInCurrency(actor, requestedRegion, currency, gValue) {
    // l - local currency, g - global currency
    const modifier = currency.getExchangeModifier(requestedRegion);
    let lValue = gValue / modifier;
    let lToPay = Math.max(0, gValue - RobakMarketWfrp4e.getConvertedValue(gValue, currency.region, requestedRegion)); // 3.44 remaining -> 4 to pay
    let lPaid = lValue - lToPay;

    // Lowest value of the currency coin
    let lMinCoinValue = currency.coins.reduce((p, c) => {
      return p.system.coinValue.value < c.system.coinValue.value ? p : c;
    }).system.coinValue.value;
    lPaid = Math.ceil(lPaid / lMinCoinValue); // 320 / 240 = 1.33 -> 2
    lToPay = Math.max(0, Math.ceil(lToPay / lMinCoinValue)); // 3.44 -> 4
    let lRemaining = currency.getValue() - lPaid;
    await RobakMarketWfrp4e.updateActorsCoins(actor, currency, lRemaining);

    return {
      paid: lPaid,
      remaining: lToPay * modifier
    };
  }

  /**
   * Process a credit request.
   * @param {string} cmd - The command string.
   * @param {string} optionOrName - The option or player name.
   * @returns {Promise<boolean>} Whether the credit was successful.
   */
  static async processCredit(cmd, optionOrName) {
    let [command, regionKey] = cmd.split("@");
    let requestedRegion = regionKey ? RobakMarketWfrp4e.regions[regionKey] : RobakMarketWfrp4e.currentRegion;
    optionOrName = (optionOrName || "split").trim().toLowerCase();

    let moneyValue = RobakMarketWfrp4e.parseMoneyTransactionStringToValue(command);
    if (!moneyValue) {
      await RobakMarketWfrp4e.printCreditWrongCommand();
      return false;
    }

    let nbActivePlayers = game.users.filter((u) => u.role !== 4 && u.active).length;
    if (["each", "split"].includes(optionOrName)) {
      if (nbActivePlayers === 0) {
        RobakMarketWfrp4e.printNoPlayers();
        return false;
      }

      let message = `<p><b>Total amount of money:</b><br>${RobakMarketWfrp4e.formatMoney(moneyValue, requestedRegion)}</p><b>Each of the ${nbActivePlayers} players will receive:<br></b>`;
      if (optionOrName === "split") moneyValue = Math.floor(moneyValue / nbActivePlayers);
      message += RobakMarketWfrp4e.formatMoney(moneyValue, requestedRegion);
      RobakMarketWfrp4e.generateCreditCard(cmd, message, nbActivePlayers);
      return true;
    } else {
      let player = Array.of(game.users.players).find((p) => p.name.toLowerCase() === optionOrName);
      if (player) {
        let message = `The amount of money ${RobakMarketWfrp4e.formatMoney(moneyValue, requestedRegion)} is sent to user ${player.name}.`;
        RobakMarketWfrp4e.generateCreditCard(cmd, message, 1, player.name);
        return true;
      } else {
        let actor = Array.of(game.actors).find((a) => a.name.toLowerCase().includes(optionOrName));
        if (actor) {
          await RobakMarketWfrp4e.creditCommand(cmd, actor);
          return true;
        } else {
          RobakMarketWfrp4e.printNoMatchingPlayer();
          return false;
        }
      }
    }
  }

  /**
   * Execute the credit command.
   * @param {string} cmd - The command string.
   * @param {object} actor - The actor receiving the credit.
   * @param {object} options - Additional options.
   * @returns {Promise<boolean>} The updated money inventory or false if an error occurred.
   * @override
   */
  static async creditCommand(cmd, actor, options = {}) {
    let [command, regionKey] = cmd.split("@");
    let requestedRegion = regionKey ? RobakMarketWfrp4e.regions[regionKey] : RobakMarketWfrp4e.currentRegion;

    let moneyValue = RobakMarketWfrp4e.parseMoneyTransactionStringToValue(command);
    if (!moneyValue) {
      await RobakMarketWfrp4e.printCreditWrongCommand();
      return false;
    }
    await RobakMarketWfrp4e.validateMoney(actor, requestedRegion);
    let {currencies} = RobakMarketWfrp4e.groupMoney(actor, requestedRegion);
    let currency = currencies[requestedRegion.key];

    await RobakMarketWfrp4e.updateActorsCoins(actor, currency, currency.getValue() + moneyValue);
    RobakMarketWfrp4e.throwMoney(moneyValue);
    await RobakMarketWfrp4e.printCreditSummary(actor, moneyValue, requestedRegion, options);
    return true;
  }

  /**
   * @param {CurrencySet[]} currencies
   * @param {number} moneyValue
   * @param {Region} requestedRegion
   * @returns {Promise<CurrencySet[]>}
   */
  static async getCurrencyFromApp(currencies, moneyValue, requestedRegion) {
    return await new Promise((resolve) => {
      new CurrencyApp(currencies, moneyValue, requestedRegion, resolve).render(true);
    });
  }

  /**
   * @returns {Object.<string, Region>} The lookup table.
   */
  static getLookupTable() {
    let lookupTable = {};
    for (let region of Object.values(RobakMarketWfrp4e.regions)) {
      for (let coin of region.coins) {
        lookupTable[coin.name] = region;
      }
    }
    return lookupTable;
  }

  /**
   * Parse a price string like "8gc6bp" or "74ss 12gc" etc.
   * @param {String} string - The string to parse
   * @returns {number|null} The parsed price
   */
  static parseMoneyTransactionStringToValue(string) {
    const expression = /((\d+)\s?(\p{L}+))/gu;
    let matches = [...string.matchAll(expression)];

    let price = 0;
    for (let match of matches) {
      if (match.length !== 4) return null;
      switch (match[3].toLowerCase()) {
        case game.i18n.localize("MARKET.Abbrev.GC").toLowerCase():
          price += parseInt(match[2], 10) * 240;
          break;
        case game.i18n.localize("MARKET.Abbrev.SS").toLowerCase():
          price += parseInt(match[2], 10) * 12;
          break;
        case game.i18n.localize("MARKET.Abbrev.BP").toLowerCase():
          price += parseInt(match[2], 10);
          break;
      }
    }
    return price === 0 ? null : price;
  }

  /**
   * @param value {number} value in pennies
   * @param targetRegion {Region} target region
   * @param sourceRegion {Region} source region
   * @param currentRegion {Region} current region
   * @returns {number} The exchange modifier
   */
  static getConvertedValue(value, targetRegion, sourceRegion, currentRegion = RobakMarketWfrp4e.currentRegion) {
    return Math.floor(value * RobakMarketWfrp4e.getExchangeModifier(targetRegion, sourceRegion, currentRegion));
  }

  /**
   * @param targetRegion {Region} target region
   * @param sourceRegion {Region} source region
   * @param currentRegion {Region} current region
   * @returns {number} The exchange modifier
   */
  static getExchangeModifier(targetRegion, sourceRegion, currentRegion = RobakMarketWfrp4e.currentRegion) {
    if (sourceRegion.key === targetRegion.key) return 1;

    let modifier = 1;
    if (currentRegion.key !== sourceRegion.key) modifier /= currentRegion.exchangeRates[sourceRegion.key];
    if (currentRegion.key !== targetRegion.key) modifier *= currentRegion.exchangeRates[targetRegion.key];

    return modifier;
  }

  /**
   * @param {Object} actor - The actor to update.
   * @param {CurrencySet} currency - The currency to update.
   * @param {number} value - The value to update.
   */
  static async updateActorsCoins(actor, currency, value) {
    let updates = [];
    for (let coin of currency.coins.toSorted((a, b) => b.system.coinValue.value - a.system.coinValue.value)) {
      let coinValue = coin.system.coinValue.value;
      let q = Math.floor(value / coinValue);
      value = value % coinValue;
      updates.push({_id: coin._id, "system.quantity.value": q});
    }
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * @param {object} actor
   * @param {Region} requestedRegion
   * @returns {{currencies: Object.<string, CurrencySet>, total: number}}
   */
  static groupMoney(actor, requestedRegion) {
    const moneyItemInventory = actor.getItemTypes("money").map((i) => i.toObject());

    /** @type {Object.<string, CurrencySet>} */
    let currencies = {};
    let lookupTable = RobakMarketWfrp4e.getLookupTable();
    for (let money of moneyItemInventory) {
      let region = lookupTable[money.name];
      if (region) {
        let value = currencies[region.key] || new CurrencySet(region);
        value.coins.push(money);
        currencies[region.key] = value;
      }
    }
    let total = 0;
    for (let currency of Object.values(currencies)) {
      total += currency.getConvertedValue(requestedRegion);
    }
    return {currencies, total};
  }

  /**
   * @param actor {object}
   * @param requestedRegion {Region}
   */
  static async validateMoney(actor, requestedRegion) {
    const moneyItemInventory = actor.getItemTypes("money").map((i) => i.toObject());
    let result = [];
    for (let coin of requestedRegion.coins) {
      if (!moneyItemInventory.find((m) => m.name === coin.name)) {
        result.push({
          name: coin.name,
          img: coin.img,
          type: "money",
          "system.description.value": "",
          "system.quantity.value": 0,
          "system.coinValue.value": coin.value,
          "system.encumbrance.value": 0.005
        });
      }
    }
    if (result.length) {
      Utility.log(`Creating: `, result);
      await actor.createEmbeddedDocuments("Item", result);
    }
  }

  static throwMoney(moneyValue) {
    let number = Math.floor(moneyValue / 240);
    moneyValue = moneyValue % 240;
    number = Math.max(number, Math.floor(moneyValue / 12));
    moneyValue = moneyValue % 12;
    number = Math.max(number, Math.floor(moneyValue));
    if (game.dice3d && game.settings.get("wfrp4e", "throwMoney")) {
      new Roll(`${number}dc`).evaluate().then((roll) => {
        game.dice3d.showForRoll(roll);
      });
    }
  }

  // ---------------------------- Money format functions ---------------------- //

  /**
   * Formats a given amount of money into a string representation.
   * @param value {number} The money to format.
   * @param region {Region|null} The region to use for formatting.
   * @returns {string} The formatted string representation of the money.
   */
  static formatMoney(value, region = null) {
    const goldCoin = region?.coins?.some((c) => c.key === "zk") ?? false;
    const silverCoin = region?.coins?.some((c) => c.key === "s") ?? false;
    const bronzeCoin = region?.coins?.some((c) => c.key === "p") ?? false;
    let formattedValue = RobakMarketWfrp4e.formatMoneyValue(value, {goldCoin, silverCoin, bronzeCoin});
    if (region) formattedValue += ` ${region.getMainCoin().name}`;
    return formattedValue;
  }

  /**
   * Formats a given amount of money into a string representation.
   * @param value {number} The money to format.
   * @param goldCoin {boolean} Whether to include gold coins.
   * @param silverCoin {boolean} Whether to include silver coins.
   * @param bronzeCoin {boolean} Whether to include bronze coins
   * @returns {string} The formatted string representation of the money.
   */
  static formatMoneyValue(value, {goldCoin = true, silverCoin = true, bronzeCoin = true}) {
    let gold = goldCoin ? Math.floor(value / 240) : 0;
    value %= 240;
    let silver = silverCoin ? Math.floor(value / 12) : 0;
    value %= 12;
    let bronze = bronzeCoin ? Math.floor(value) : 0;

    let result = gold ? `${gold} ` : "";
    if (!silver && !bronze) return result.trim();
    result += `${silver || "-"}/${bronze || "-"}`;
    return result.trim();
  }

  /**
   * @param {{gc?:number, ss?:number, bp?: number}} moneyObject
   * @returns {{gc: number, ss: number, bp: number, total: number}}
   */
  static consolidate(moneyObject) {
    let total = (moneyObject?.gc ?? 0) * 240 + (moneyObject?.ss ?? 0) * 12 + (moneyObject?.bp ?? 0);
    let temp = total;
    let gc = Math.floor(temp / 240);
    temp = temp % 240;
    let ss = Math.floor(temp / 12);
    let bp = temp % 12;
    return {gc, ss, bp, total};
  }

  /**
   * Consolidate every money the player has in order to give him the fewer coins possible
   * @param {Array} money
   */
  static consolidateMoney(money) {
    //We sort the money from the highest BP value to the lowest (so gc => ss => bp)
    //This allow us to deal with custom money too and to not be dependent on the money name (translation errors could break the code otherwise)
    money.sort((a, b) => b.system.coinValue.value - a.system.coinValue.value);

    let brass = 0;
    //First we calculate the BP value
    for (let m of money) brass += m.system.quantity.value * m.system.coinValue.value;

    //Then we consolidate the coins
    for (let m of money) {
      //We don't know what players could create as a custom money and we dont want to divide by zero, ever. It would kill a kitten somewhere, probably.
      if (m.system.coinValue.value <= 0) break;
      m.system.quantity.value = Math.trunc(brass / m.system.coinValue.value);
      brass = brass % m.system.coinValue.value;
    }

    return money;
  }

  // ---------------------------- Helper functions ---------------------------- //

  /**
   * @param cmd {string} Command to parse
   * @param player {object}
   */
  static generatePayCard(cmd, player) {
    let [payRequest, regionKey] = cmd.split("@");
    let requestedRegion = regionKey ? RobakMarketWfrp4e.regions[regionKey] : RobakMarketWfrp4e.currentRegion;

    let parsedPayRequest = RobakMarketWfrp4e.parseMoneyTransactionStringToValue(payRequest);
    // If the /pay command has a syntax error, we display an error message to the gm
    if (!parsedPayRequest) {
      let msg = `<h3><b>${game.i18n.localize("MARKET.PayRequest")}</b></h3>`;
      msg += `<p>${game.i18n.localize("MARKET.MoneyTransactionWrongCommand")}</p>
        <p><i>${game.i18n.localize("MARKET.PayCommandExample")}</i></p>`;
      ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "gmroll"));
    } else {
      // generate a card with a summary and a pay button
      let cardData = {
        payRequest: cmd,
        value: RobakMarketWfrp4e.formatMoney(parsedPayRequest, requestedRegion)
      };
      renderTemplate("modules/wfrp4e-macros-and-more/templates/market-pay.hbs", cardData).then((html) => {
        let chatData = WFRP_Utility.chatDataSetup(html, "roll", false, {forceWhisper: player});
        ChatMessage.create(chatData);
      });
    }
  }

  /**
   * @param {string} cmd - Command to parse
   * @param {string} message - Message to display
   * @param {number} nbActivePlayers - Number of active players
   * @param {string} forceWhisper - Force whisper to a specific player
   */
  static generateCreditCard(cmd, message, nbActivePlayers, forceWhisper = undefined) {
    let cardData = {
      creditRequest: cmd,
      message
    };
    renderTemplate("modules/wfrp4e-macros-and-more/templates/market-credit.hbs", cardData).then((html) => {
      let chatData = WFRP_Utility.chatDataSetup(html, "roll", false, {forceWhisper});
      foundry.utils.setProperty(chatData, "flags.wfrp4e.instances", nbActivePlayers);
      ChatMessage.create(chatData);
    });
  }

  /**
   * @param {Object} actor
   * @param {Region} requestedRegion
   * @param {{currency: CurrencySet, value: number}[]} paySummary
   */
  static printPaySummary(actor, requestedRegion, paySummary) {
    let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3><b>Payment complete:</b>`;
    let currencyMsg = "";
    for (let {currency, value} of paySummary) {
      const region = currency.region;
      const localMoney = RobakMarketWfrp4e.formatMoney(value, region);
      const convertedValue = Math.ceil(value * currency.getExchangeModifier(requestedRegion));
      const globalMoney = RobakMarketWfrp4e.formatMoney(convertedValue, requestedRegion);
      currencyMsg += `<li>${localMoney} (${globalMoney})</li>`;
    }
    msg += `<ul>${currencyMsg}</ul><b>${game.i18n.localize("MARKET.PaidBy")}</b> ${actor.name}`;
    ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "roll"));
  }

  /**
   * @param {Object} actor - The actor receiving the credit.
   * @param {number} moneyValue - The amount of money received.
   * @param {Region} requestedRegion - Region of the money.
   * @param {Object} options - Additional options.
   */
  static printCreditSummary(actor, moneyValue, requestedRegion, options) {
    let msg = `<h3><b>${game.i18n.localize("MARKET.CreditCommand")}</b></h3><b>Credit complete:</b>
      <ul><li>${RobakMarketWfrp4e.formatMoney(moneyValue, requestedRegion)}</li></ul>
      <b>${game.i18n.localize("MARKET.ReceivedBy")}</b> ${actor.name}`;

    if (options.suppressMessage) {
      ui.notifications.notify(`${actor.name} received ${RobakMarketWfrp4e.formatMoney(moneyValue, requestedRegion)}`);
    } else {
      ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "roll"));
    }
  }

  /**
   * @param {number} moneyValue
   * @param {Region} requestedRegion
   * @param {CurrencySet[]} currencies
   * @param {number} total
   */
  static printNotEnoughMoney(moneyValue, requestedRegion, currencies, total) {
    let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3>
      ${game.i18n.localize("MARKET.NotEnoughMoney")}<br>
      <b>Needed Money:</b> ${RobakMarketWfrp4e.formatMoney(moneyValue, requestedRegion)}<br>
      <b>Available money:</b> ${RobakMarketWfrp4e.formatMoney(total, requestedRegion)}`;
    let otherCurrencyMsg = currencies
      .filter((currency) => currency.getValue() !== 0)
      .map((currency) => {
        const localMoney = RobakMarketWfrp4e.formatMoney(currency.getValue(), currency.region);
        const converted = currency.getConvertedValue(requestedRegion);
        const globalMoney = RobakMarketWfrp4e.formatMoney(converted, requestedRegion);
        return `<li>${localMoney} (${globalMoney})</li>`;
      })
      .join("");
    if (otherCurrencyMsg !== "") msg += `<ul>${otherCurrencyMsg}</ul>`;
    ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "roll"));
  }

  static printPayWrongCommand() {
    let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3>
      <p>${game.i18n.localize("MARKET.MoneyTransactionWrongCommand")}</p>
      <p><i>${game.i18n.localize("MARKET.PayCommandExample")}</i></p>`;
    ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "roll"));
  }

  static printCreditWrongCommand() {
    let msg = `<h3><b>${game.i18n.localize("MARKET.CreditRequest")}</b></h3>
      <p>${game.i18n.localize("MARKET.MoneyTransactionWrongCommand")}</p>
      <p><i>${game.i18n.localize("MARKET.CreditCommandExample")}</i></p>`;
    ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "gmroll"));
  }

  static printNoPlayers() {
    ChatMessage.create({content: game.i18n.localize("MARKET.NoPlayers")});
  }

  static printNoMatchingPlayer() {
    ChatMessage.create({content: game.i18n.localize("MARKET.NoMatchingPlayer")});
  }
}
