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
   * @param img {string}
   * @param value {number}
   */
  constructor(key, name, img, value) {
    this.key = key;
    this.name = name;
    this.img = img;
    this.value = value;
  }

  /**
   * @param json {object}
   * @returns {Coin}
   */
  static fromJson(json) {
    return new Coin(json.key, game.i18n.localize(json.name), json.img, json.value);
  }
}

export async function overrideMarket() {
  libWrapper.register(
    "wfrp4e-macros-and-more",
    `ChatWFRP._onMarketButtonClicked`,
    async (wrapper, event) => {
      if (["payItem", "creditItem"].includes($(event.currentTarget).attr("data-button"))) {
        await onMarketButtonClicked.call(this, event);
      } else {
        wrapper.call(this, event);
      }
    },
    "MIXED"
  );

  for (let method of Utility.getMethods(MarketWfrp4e)) {
    Utility.log(`Registering ${method}`);
    libWrapper.register(
      "wfrp4e-macros-and-more",
      `MarketWfrp4e.${method}`,
      (wrapper, ...args) => {
        if (RobakMarketWfrp4e.hasOwnProperty(method)) return RobakMarketWfrp4e[method].call(this, ...args);
        return wrapper.call(this, ...args);
      },
      "MIXED"
    );
  }
  Utility.log("Market override succeeded");
}

export async function onMarketButtonClicked(event) {
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

            // Only allow credit to be taken as many times as it has been split
            // This allows a player to take multiple times if they wish, but not more than the original total amount
            // This solution might fail if two or more players click the button at the same time and create a race condition
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

export default class RobakMarketWfrp4e extends MarketWfrp4e {
  static async loadRegions() {
    let regions = await fetch("modules/wfrp4e-macros-and-more/data/regions.json").then((r) => r.json());
    RobakMarketWfrp4e.regions = Object.fromEntries(
      Object.entries(regions).map(([key, r]) => [key, Region.fromJson(r)])
    );
    RobakMarketWfrp4e.currentRegion = regions[game.settings.get("wfrp4e-macros-and-more", "current-region")];
    RobakMarketWfrp4e.regionLookupTable = RobakMarketWfrp4e.#createLookupTable(RobakMarketWfrp4e.regions);
  }

  // ---------------------------- Override ---------------------------- //
  /**
   * Directly execute the pay command.
   * @param amount {string} The amount to pay.
   * @param actor {object}  The actor making the payment.
   * @param options {object} Additional options.
   */
  static directPayCommand(amount, actor, options = {}) {
    RobakMarketWfrp4e.payCommand(amount, actor, options).then(() => Utility.log("Pay command executed"));
  }

  /**
   * Execute the pay command.
   * @param {string} cmd - The command string.
   * @param {object} actor - The actor making the payment.
   * @param {object} [options={}] - Additional options.
   * @returns {boolean} Whether the payment was successful.
   */
  static async payCommand(cmd, actor, options = {}) {
    let [command, regionKey, strictMode] = cmd.split("@");
    let requestedRegion = regionKey == null ? RobakMarketWfrp4e.currentRegion : RobakMarketWfrp4e.regions[regionKey];
    strictMode ??= false;

    let moneyToPay = RobakMarketWfrp4e.parseMoneyTransactionString(command);
    if (!moneyToPay) {
      await RobakMarketWfrp4e.#printPayWrongCommand(options);
      return false;
    }

    moneyToPay = RobakMarketWfrp4e.consolidate(moneyToPay);
    let {moneyGroups, total} = RobakMarketWfrp4e.groupMoney(actor, requestedRegion);
    let requestedMoney = moneyGroups[requestedRegion.key];

    if (requestedMoney?.total >= moneyToPay?.total) {
      Utility.log("Paying with requested currency");
      await RobakMarketWfrp4e.validateMoney(actor, requestedRegion);
      await RobakMarketWfrp4e.changeWithRequestedMoney(actor, requestedMoney, moneyToPay.total);
      await RobakMarketWfrp4e.throwMoney(moneyToPay);
      await this.#printPaySummary(moneyToPay, actor, options);
      return true;
    } else if (!strictMode && total >= moneyToPay?.total) {
      Utility.log("Paying with requested and/or converted currency");
      const data = Object.entries(moneyGroups)
        .filter(([_, region]) => region.converted !== 0)
        .map(([key, region]) => {
          const selectedRegion = RobakMarketWfrp4e.regions[key];
          return {
            id: key,
            active: "",
            regionName: selectedRegion.name,
            converted: region.converted,
            name: `${Utility.formatMoney({bp: region.total})} ${selectedRegion.getMainCoin().name} 
                  (${Utility.formatMoney({bp: region.converted})} ${requestedRegion.getMainCoin().name})`,
            img: selectedRegion?.getMainCoin()?.img ?? "modules/wfrp4e-core/icons/currency/goldcrown.png"
          };
        });
      let result = await new Promise((resolve) =>
        new CurrencyApp(data, moneyToPay.total, requestedRegion.getMainCoin().name, resolve).render(true)
      );
      await RobakMarketWfrp4e.throwMoney(moneyToPay);
      await this.#printPaySummary(moneyToPay, actor, options);
      return true;
    } else {
      Utility.log("Not enough money");
      await RobakMarketWfrp4e.#printNotEnoughMoney(moneyToPay, requestedRegion, moneyGroups, requestedMoney, options);
    }
    return false;
  }

  /**
   * Execute the credit command.
   * @param {string} amount - The amount to credit.
   * @param {object} actor - The actor receiving the credit.
   * @param {object} [options={}] - Additional options.
   * @returns {object|boolean} The updated money inventory or false if an error occurred.
   */
  static async creditCommand(amount, actor, options = {}) {
    // First we parse the amount
    let moneyItemInventory = actor.getItemTypes("money").map((i) => i.toObject());
    let moneyToSend = RobakMarketWfrp4e.parseMoneyTransactionString(amount);
    let msg = `<h3><b>${game.i18n.localize("MARKET.CreditCommand")}</b></h3>`;
    let errorOccured = false;
    // Wrong amount
    if (!moneyToSend) {
      msg += `<p>${game.i18n.localize("MARKET.MoneyTransactionWrongCommand")}</p><p><i>${game.i18n.localize(
        "MARKET.CreditCommandExample"
      )}</i></p>`;
      errorOccured = true;
    }
    // Command is ok, let's try to pay
    else {
      // We need to get the character money items for gc, ss and bp. This is a "best effort" lookup method. If it fails, we stop the amount to prevent any data loss.
      let characterMoney = RobakMarketWfrp4e.getCharacterMoney(moneyItemInventory);
      RobakMarketWfrp4e.checkCharacterMoneyValidity(moneyItemInventory, characterMoney);

      // If one money is missing, we stop here before doing anything bad
      if (Object.values(characterMoney).includes(false)) {
        msg += `<p>${game.i18n.localize("MARKET.CantFindMoneyItems")}</p>`;
        errorOccured = true;
      } else {
        // Great, we can just deduce the quantity for each money
        moneyItemInventory[characterMoney.gc].system.quantity.value += moneyToSend.gc;
        moneyItemInventory[characterMoney.ss].system.quantity.value += moneyToSend.ss;
        moneyItemInventory[characterMoney.bp].system.quantity.value += moneyToSend.bp;
      }
    }
    if (errorOccured) {
      moneyItemInventory = false;
    } else {
      msg += game.i18n.format("MARKET.Credit", {
        number1: moneyToSend.gc,
        number2: moneyToSend.ss,
        number3: moneyToSend.bp
      });
      msg += `<br><b>${game.i18n.localize("MARKET.ReceivedBy")}</b> ${actor.name}`;
      RobakMarketWfrp4e.throwMoney(moneyToSend);
    }
    if (options.suppressMessage) {
      ui.notifications.notify(
        `${actor.name} received ${moneyToSend.gc}${game.i18n.localize(
          "MARKET.Abbrev.GC"
        )} ${moneyToSend.ss}${game.i18n.localize(
          "MARKET.Abbrev.SS"
        )} ${moneyToSend.bp}${game.i18n.localize("MARKET.Abbrev.BP")}`
      );
    } else {
      await ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "roll"));
    }
    return moneyItemInventory;
  }

  /**
   * Process a credit request.
   * @param {string} creditRequest - The credit request string.
   * @param {string} optionOrName - The option or player name.
   */
  static async processCredit(creditRequest, optionOrName) {
    let parsedPayRequest = RobakMarketWfrp4e.parseMoneyTransactionString(creditRequest);

    //If the /credit command has a syntax error, we display an error message to the gm
    if (!parsedPayRequest) {
      let msg = `<h3><b>${game.i18n.localize("MARKET.CreditRequest")}</b></h3>`;
      msg += `<p>${game.i18n.localize("MARKET.MoneyTransactionWrongCommand")}</p><p><i>${game.i18n.localize(
        "MARKET.CreditCommandExample"
      )}</i></p>`;
      await ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "gmroll"));
    } //generate a card with a summary and a receive button
    else {
      let amount, message, forceWhisper;
      optionOrName = optionOrName || "split"; // Default behavior

      // Process split/each options
      let nbActivePlayers = Array.from(game.users).filter((u) => u.role !== 4 && u.active).length;
      if (optionOrName.toLowerCase() === "each" || optionOrName.toLowerCase() === "split") {
        if (nbActivePlayers === 0) {
          let message = game.i18n.localize("MARKET.NoPlayers");
          await ChatMessage.create({content: message});
          return;
        }
        if (optionOrName.toLowerCase() === "split") {
          amount = RobakMarketWfrp4e.splitAmountBetweenAllPlayers(parsedPayRequest, nbActivePlayers);
          message = game.i18n.format("MARKET.RequestMessageForSplitCredit", {
            activePlayerNumber: nbActivePlayers,
            initialAmount: RobakMarketWfrp4e.amountToString(parsedPayRequest)
          });
        } else if (optionOrName.toLowerCase() === "each") {
          amount = parsedPayRequest;
          message = game.i18n.format("MARKET.RequestMessageForEachCredit", {
            activePlayerNumber: nbActivePlayers,
            initialAmount: RobakMarketWfrp4e.amountToString(parsedPayRequest)
          });
        }
      } else {
        amount = parsedPayRequest;
        let paName = optionOrName.trim().toLowerCase();
        let player = game.users.players.filter((p) => p.name.toLowerCase() === paName);
        if (player[0]) {
          // Player found !
          forceWhisper = player[0].name;
          message = game.i18n.format("MARKET.CreditToUser", {
            userName: player[0].name,
            initialAmount: RobakMarketWfrp4e.amountToString(parsedPayRequest)
          });
        } else {
          let actor = game.actors.find((a) => a.name.toLowerCase().includes(paName.toLowerCase()));
          if (actor) {
            let money = RobakMarketWfrp4e.creditCommand(RobakMarketWfrp4e.amountToString(amount), actor); // Imediate processing!
            if (money) {
              await actor.updateEmbeddedDocuments("Item", money);
            }
            return;
          } else {
            message = game.i18n.localize("MARKET.NoMatchingPlayer");
            await ChatMessage.create({content: message});
            return;
          }
        }
      }
      let cardData = {
        digestMessage: message,
        amount: RobakMarketWfrp4e.amountToString(amount),
        QtGC: amount.gc,
        QtSS: amount.ss,
        QtBP: amount.bp
      };
      renderTemplate("modules/wfrp4e-macros-and-more/templates/market-credit.hbs", cardData).then((html) => {
        let chatData = WFRP_Utility.chatDataSetup(html, "roll", false, {forceWhisper});
        foundry.utils.setProperty(chatData, "flags.wfrp4e.instances", nbActivePlayers);
        ChatMessage.create(chatData);
      });
    }
  }

  /**
   * Create a lookup table for regions.
   * @param {object} regions - The regions object.
   * @returns {object} The lookup table.
   * @private
   */
  static #createLookupTable(regions) {
    let lookupTable = {};
    for (let region of Object.values(regions)) {
      for (let coin of region.coins) {
        lookupTable[coin.name] = region;
      }
    }
    return lookupTable;
  }

  /**
   * @param value {string} value in pennies
   * @param currentRegion {string} current region key
   * @param targetMoneyRegion {string} target region key
   * @param sourceMoneyRegion {string} source region key
   */
  static exchange(value, currentRegion, targetMoneyRegion, sourceMoneyRegion) {
    let modifier = 1;
    if (sourceMoneyRegion === targetMoneyRegion) return {converted: value, modifier};
    if (currentRegion !== sourceMoneyRegion) {
      modifier *= 1 / RobakMarketWfrp4e.regions[currentRegion].exchangeRates[sourceMoneyRegion];
    }
    if (currentRegion !== targetMoneyRegion) {
      modifier *= RobakMarketWfrp4e.regions[currentRegion].exchangeRates[targetMoneyRegion];
    }
    let converted = Math.floor(value * modifier);
    return {converted, modifier: Utility.round(modifier, 2)};
  }

  static consolidate(moneyObject) {
    let total = (moneyObject?.gc ?? 0) * 240 + (moneyObject?.ss ?? 0) * 12 + (moneyObject?.bp ?? 0);
    let temp = total;
    let gc = Math.floor(temp / 240);
    temp = temp % 240;
    let ss = Math.floor(temp / 12);
    let bp = temp % 12;
    return {gc, ss, bp, total};
  }

  static groupMoney(actor, reqRegion) {
    const moneyItemInventory = actor.getItemTypes("money").map((i) => i.toObject());

    let moneyGroups = {};
    for (let money of moneyItemInventory) {
      let otherMoneyRegion = RobakMarketWfrp4e.regionLookupTable[money.name];
      if (otherMoneyRegion) {
        let value = moneyGroups[otherMoneyRegion.key] || {coins: [], total: 0};
        value.coins.push(money);
        value.total += money.system.quantity.value * money.system.coinValue.value;
        moneyGroups[otherMoneyRegion.key] = value;
      }
    }
    let total = 0;
    for (let [key, value] of Object.entries(moneyGroups)) {
      const {converted, modifier} = RobakMarketWfrp4e.exchange(
        value.total,
        RobakMarketWfrp4e.currentRegion.key,
        reqRegion.key,
        key
      );
      moneyGroups[key].converted = converted;
      moneyGroups[key].modifier = modifier;
      total += converted;
    }
    Utility.log(moneyGroups);
    return {moneyGroups, total};
  }

  /**
   * @param actor {*}
   * @param requestedRegion {Region}
   */
  static async validateMoney(actor, requestedRegion) {
    const moneyItemInventory = actor.getItemTypes("money").map((i) => i.toObject());
    let result = [];
    for (let coin of requestedRegion.coins) {
      if (!moneyItemInventory.find((m) => m.name === coin.name)) {
        let found = await game.wfrp4e.utility.findItem(coin.name);
        if (found) {
          found = found.toObject();
          found["system.quantity.value"] = 0;
        } else {
          found = {
            name: coin.name,
            img: coin.img,
            type: "money",
            "system.description.value": "",
            "system.quantity.value": 0,
            "system.coinValue.value": coin.value,
            "system.encumbrance.value": 0.005
          };
        }
        result.push(found);
      }
    }
    if (result.length) {
      Utility.log(`Creating: `, result);
      await actor.createEmbeddedDocuments("Item", result);
    }
  }

  /**
   * @param actor {*}
   * @param requestedMoney {{coins: object[], converted: number, modifier: number, total: number}}
   * @param totalMoneyChange {number}
   */
  static async changeWithRequestedMoney(actor, requestedMoney, totalMoneyChange) {
    let updates = [];
    for (let coin of requestedMoney.coins.toSorted((a, b) => a.system.coinValue.value - b.system.coinValue.value)) {
      if (totalMoneyChange === 0) break;
      if (totalMoneyChange >= coin.system.coinValue.value) {
        let num = Math.min(coin.system.quantity.value, Math.floor(totalMoneyChange / coin.system.coinValue.value));
        if (num !== 0) {
          coin.system.quantity.value -= num;
          totalMoneyChange -= num * coin.system.coinValue.value;
          updates.push(coin);
        }
      }
    }
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  /**
   * @param cmd {string} Command to parse
   * @param player {object}
   */
  static async generatePayCard(cmd, player) {
    let [payRequest, regionKey, strictMode] = cmd.split("@");
    let requestedRegion = regionKey == null ? RobakMarketWfrp4e.currentRegion : RobakMarketWfrp4e.regions[regionKey];
    strictMode ??= false;

    let parsedPayRequest = RobakMarketWfrp4e.parseMoneyTransactionString(payRequest);
    // If the /pay command has a syntax error, we display an error message to the gm
    if (!parsedPayRequest) {
      let msg = `<h3><b>${game.i18n.localize("MARKET.PayRequest")}</b></h3>`;
      msg += `<p>${game.i18n.localize("MARKET.MoneyTransactionWrongCommand")}</p>
        <p><i>${game.i18n.localize("MARKET.PayCommandExample")}</i></p>`;
      await ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "gmroll"));
    } else {
      // generate a card with a summary and a pay button
      let cardData = {
        payRequest: cmd,
        value: Utility.formatMoney(parsedPayRequest),
        label: requestedRegion.getMainCoin().name
      };
      renderTemplate("modules/wfrp4e-macros-and-more/templates/market-pay.hbs", cardData).then((html) => {
        let chatData = WFRP_Utility.chatDataSetup(html, "roll", false, {forceWhisper: player});
        ChatMessage.create(chatData);
      });
    }
  }

  static makeSomeChange(amount, bpRemainder) {
    let gc = 0;
    let ss = 0;
    let bp = 0;
    if (amount >= 0) {
      gc = Math.floor(amount / 240);
      amount = amount % 240;
      ss = Math.floor(amount / 12);
      bp = amount % 12;
      bp = bp + (bpRemainder > 0 ? 1 : 0);
    }
    return {
      gc: gc,
      ss: ss,
      bp: bp
    };
  }

  static amountToString(amount) {
    let gc = game.i18n.localize("MARKET.Abbrev.GC");
    let ss = game.i18n.localize("MARKET.Abbrev.SS");
    let bp = game.i18n.localize("MARKET.Abbrev.BP");
    return `${amount.gc || amount.g || 0}${gc} ${amount.ss || amount.s || 0}${ss} ${amount.bp || amount.b || 0}${bp}`;
  }

  static splitAmountBetweenAllPlayers(initialAmount, nbOfPlayers) {
    // convert initialAmount in bp
    let bpAmount = initialAmount.gc * 240 + initialAmount.ss * 12 + initialAmount.bp;
    // divide bpAmount by nb of players and get the true remainder
    let bpRemainder = bpAmount % nbOfPlayers;
    bpAmount = Math.floor(bpAmount / nbOfPlayers);
    // rebuild an amount of gc/ss/bp from bpAmount
    return RobakMarketWfrp4e.makeSomeChange(bpAmount, bpRemainder);
  }

  // ---------------------------- Helper functions ---------------------------- //
  static async #printPaySummary(moneyToPay, actor, options) {
    let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3>`;
    msg += game.i18n.format("MARKET.Paid", {
      number1: moneyToPay.gc,
      number2: moneyToPay.ss,
      number3: moneyToPay.bp
    });
    msg += `<br><b>${game.i18n.localize("MARKET.PaidBy")}</b> ${actor.name}`;
    await RobakMarketWfrp4e.#printMessageToChat(msg, options);
  }

  static async #printMessageToChat(msg, options) {
    if (options.suppressMessage) {
      ui.notifications.notify(msg);
    } else {
      await ChatMessage.create(WFRP_Utility.chatDataSetup(msg, "roll"));
    }
  }

  static async #printNotEnoughMoney(moneyToPay, requestedRegion, moneyGroups, requestedMoney, options) {
    let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3>
      ${game.i18n.localize("MARKET.NotEnoughMoney")}<br>
      <b>Local money needed:</b> ${Utility.formatMoney(moneyToPay)} ${requestedRegion.getMainCoin().name}<br>
      <b>Local money available:</b> ${Utility.formatMoney(requestedMoney)} ${requestedRegion.getMainCoin().name}<br>`;
    let otherCurrencyMsg = "";
    let otherCurrencyTotal = 0;
    for (let [key, value] of Object.entries(moneyGroups)) {
      let region = RobakMarketWfrp4e.regions[key];
      if (value.converted === 0) continue;

      otherCurrencyMsg += `<li><strong>${region.name}:</strong> ${value.converted} ${requestedRegion.getMainCoin().name} (x${value.modifier})</li>`;
      otherCurrencyTotal += value.converted;
    }
    if (otherCurrencyMsg !== "") {
      msg += `<b>Other (converted): ${otherCurrencyTotal} ${requestedRegion.getMainCoin().name}</b><ul>${otherCurrencyMsg}</ul>`;
    }
    return await RobakMarketWfrp4e.#printMessageToChat(msg, options);
  }

  static async #printPayWrongCommand(options) {
    let msg = `<h3><b>${game.i18n.localize("MARKET.PayCommand")}</b></h3>
      <p>${game.i18n.localize("MARKET.MoneyPayCommandWrongCommand")}</p>
      <p><i>${game.i18n.localize("MARKET.PayCommandExample")}</i></p>`;
    await RobakMarketWfrp4e.#printMessageToChat(msg, options);
  }
}
