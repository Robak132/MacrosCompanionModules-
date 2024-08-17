import ItemTransfer from "./modules/item-transfer.mjs";
import {handleLosingGroupAdvantage} from "./modules/group-advantage-losing.mjs";
import Utility from "./modules/utility.mjs";
import MaintenanceWrapper from "./modules/maintenance.mjs";
import {addActorContextOptions, addItemContextOptions} from "./modules/convert.mjs";
import ExperienceVerificator from "./modules/experience-verificator.mjs";
import ConfigurableDialog from "./modules/configurable-dialog.mjs";

async function registerSettings() {
  await game.settings.register("wfrp4e-macros-and-more", "transfer-item-gui", {
    name: "Enable Transfer Item",
    hint: "Enables Transfer Item button in character sheets.",
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });
  await game.settings.register("wfrp4e-macros-and-more", "losing-advantage", {
    name: 'Enable "Losing Advantage" rule',
    hint: 'Prints reminder of "Losing Advantage" rule every combat round if using Group Advantage.',
    scope: "world",
    config: true,
    default: false,
    type: Boolean
  });
  await game.settings.register("wfrp4e-macros-and-more", "currency-market", {
    name: "Currencies in Pay/Credit commands",
    hint: 'Control currency usage in Pay/Credit commands.\n"Disabled" will disable other currencies.\n"Compatibility Mode" will use default WFRP4e system.\n"Override Mode" will use custom currency system',
    scope: "world",
    config: true,
    default: "override",
    type: String,
    choices: {
      disable: "Disabled",
      compatibility: "Compatibility Mode",
      override: "Override Mode"
    }
  });
  await game.settings.registerMenu("wfrp4e-macros-and-more", "menu-maintenance", {
    name: "MACROS-AND-MORE.SettingsMaintenanceMenuName",
    label: "MACROS-AND-MORE.SettingsMaintenanceMenuLabel",
    hint: "MACROS-AND-MORE.SettingsMaintenanceMenuHint",
    icon: "fas fa-cog",
    type: MaintenanceWrapper,
    onChange: debouncedReload,
    restricted: true
  });

  await game.settings.register("wfrp4e-macros-and-more", "current-region", {
    scope: "world",
    config: false,
    default: "empire"
  });
  await game.settings.register("wfrp4e-macros-and-more", "gm_see_players", {
    name: `MACROS-AND-MORE.settings.gm_see_players.Name`,
    default: true,
    type: Boolean,
    scope: "world",
    config: true,
    hint: `MACROS-AND-MORE.settings.gm_see_players.Hint`,
    onChange: () => ui.players.render()
  });
  await game.settings.register("wfrp4e-macros-and-more", "roll_storage", {
    name: `MACROS-AND-MORE.settings.roll_storage.Name`,
    default: 50,
    type: Number,
    range: {
      min: -1,
      max: 500,
      step: 10
    },
    scope: "world",
    config: true,
    hint: `MACROS-AND-MORE.settings.roll_storage.Hint`
  });
  await game.settings.register("wfrp4e-macros-and-more", "players_see_players", {
    name: `MACROS-AND-MORE.settings.players_see_players.Name`,
    default: true,
    type: Boolean,
    scope: "world",
    config: true,
    hint: `MACROS-AND-MORE.settings.players_see_players.Hint`,
    onChange: () => ui.players.render()
  });
  await game.settings.register("wfrp4e-macros-and-more", "count_hidden", {
    name: `MACROS-AND-MORE.settings.count_hidden.Name`,
    default: true,
    type: Boolean,
    scope: "world",
    config: true,
    hint: `MACROS-AND-MORE.settings.count_hidden.Hint`
  });
}

async function registerHandlebars() {
  await Handlebars.registerHelper("isOne", (value) => value === 1);
  await Handlebars.registerHelper("isTwo", (value) => value === 2);
  await Handlebars.registerHelper("isThreePlus", (value) => value > 2);
  await Handlebars.registerHelper("isTie", (value) => value.length > 1);
  await Handlebars.registerHelper("isLast", (index, length) => {
    if (length - index === 1) {
      return true;
    }
  });
  await Handlebars.registerHelper("isSecondLast", (index, length) => {
    if (length - index === 2) {
      return true;
    }
  });
}

// Hooks
Hooks.once("init", async function () {
  Utility.log("Initializing");
  game.robakMacros = {
    transferItem: ItemTransfer,
    maintenance: MaintenanceWrapper,
    experienceVerificator: ExperienceVerificator,
    utils: Utility,
    configurableDialog: ConfigurableDialog
  };

  // Register settings
  await registerSettings();

  // Register handlebars
  await registerHandlebars();

  // Load scripts
  fetch("modules/wfrp4e-macros-and-more/data/effects.json")
    .then((r) => r.json())
    .then(async (effects) => {
      mergeObject(game.wfrp4e.config.effectScripts, effects);
    });
});

Hooks.once("ready", async () => {
  game.socket.on("module.wfrp4e-macros-and-more", async ({type, data}) => {
    Utility.log("Received transfer object", data);
    if (!game.user.isUniqueGM) {
      return;
    }
    switch (type) {
      case "transferItem":
        return ItemTransfer.handleTransfer(data);
      case "darkWhispers":
        await Utility.darkWhispersDialog(data);
    }
  });
});

Hooks.once("devModeReady", ({registerPackageDebugFlag}) => {
  registerPackageDebugFlag("wfrp4e-macros-and-more");
});

Hooks.on("updateCombat", (combat, updates, _, __) => {
  if (
    game.settings.get("wfrp4e-macros-and-more", "losing-advantage") &&
    game.user.isUniqueGM &&
    foundry.utils.hasProperty(updates, "round")
  ) {
    handleLosingGroupAdvantage(combat.combatants);
  }
});

Hooks.on("getItemDirectoryEntryContext", addItemContextOptions);

Hooks.on("getActorDirectoryEntryContext", addActorContextOptions);

Hooks.on("renderActorSheetWfrp4e", (sheet, html, _) => ItemTransfer.setupItemHandler(sheet, html));

Hooks.on("renderChatLog", (log, html, _) => {
  html.on("click", ".robak-darkwhisper-button", async (event) => {
    event.preventDefault();
    if (!game.user.isGM) {
      let actor = game.user.character;
      let characters = JSON.parse($(event.currentTarget).attr("data-characters"));
      let authorId = $(event.currentTarget).attr("data-author");
      if (actor && characters.includes(actor._id)) {
        let response = "";
        switch ($(event.currentTarget).attr("data-button")) {
          case "actOnWhisper":
            response = `${game.i18n.format("GMTOOLKIT.Message.DarkWhispers.Accepted", {currentUser: actor.name})}`;
            break;
          case "denyDarkGods":
            response = `${game.i18n.format("GMTOOLKIT.Message.DarkWhispers.Rejected", {currentUser: actor.name})}`;
            break;
        }
        response += `<blockquote>${$(event.currentTarget).attr("data-ask")}</blockquote>`;

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({actor: game.user.character}),
          content: response,
          whisper: [authorId, ...ChatMessage.getWhisperRecipients("GM")]
        });
      } else {
        ui.notifications.notify(game.i18n.format("GMTOOLKIT.Notification.NoActor", {currentUser: game.user.name}));
      }
    } else {
      ui.notifications.notify(
        game.i18n.format("GMTOOLKIT.Notification.UserMustBePlayer", {action: event.currentTarget.text})
      );
    }
  });
});

Hooks.on("updateChatMessage", async (chatMessage) => {
  const isBlind = chatMessage.blind;
  if (!chatMessage.flags.testData) return;
  if (
    !isBlind ||
    (isBlind && game.settings.get("wfrp4e-macros-and-more", "count_hidden")) ||
    (isBlind && chatMessage.user.isGM)
  ) {
    await game.robakMacros.rollTracker.saveTrackedRoll(chatMessage.user.id, chatMessage);
  }
});

Hooks.on("createChatMessage", async (chatMessage) => {
  const isBlind = chatMessage.blind;
  if (
    !isBlind ||
    (isBlind && game.settings.get("wfrp4e-macros-and-more", "count_hidden")) ||
    (isBlind && chatMessage.user.isGM)
  ) {
    if (chatMessage.isRoll && chatMessage.rolls[0]?.dice[0]?.faces === 100) {
      await game.robakMacros.rollTracker.saveSimpleRoll(chatMessage.user.id, chatMessage);
    } else {
      await game.robakMacros.rollTracker.saveReRoll(chatMessage.user.id, chatMessage);
    }
  }
});

Hooks.on("renderPlayerList", (playerList, html) => {
  if (game.user.isGM) {
    if (game.settings.get("wfrp4e-macros-and-more", "gm_see_players")) {
      // This adds our icon to ALL players on the player list, if the setting is toggled
      const tooltip = game.i18n.localize("MACROS-AND-MORE.button-title");
      // create the button where we want it to be
      for (let user of game.users) {
        const buttonPlacement = html.find(`[data-user-id="${user.id}"]`);
        buttonPlacement.append(
          `<button type="button" title='${tooltip}' class="roll-tracker-item-button flex0" id="${user.id}"><i class="fas fa-dice-d20"></i></button>`
        );
        html.on("click", `#${user.id}`, () => {
          new RollTrackerDialog(user.id).render(true);
        });
      }
    } else {
      // Put the roll tracker icon only beside the GM's name
      const loggedInUser = html.find(`[data-user-id="${game.userId}"]`);
      const tooltip = game.i18n.localize("MACROS-AND-MORE.button-title");
      loggedInUser.append(
        `<button type="button" title='${tooltip}' class="roll-tracker-item-button flex0" id="${game.userId}"><i class="fas fa-dice-d20"></i></button>`
      );
      html.on("click", `#${game.userId}`, () => {
        new RollTrackerDialog(game.userId).render(true);
      });
    }
  } else if (game.settings.get("wfrp4e-macros-and-more", "players_see_players")) {
    // find the element which has our logged in user's id
    const loggedInUser = html.find(`[data-user-id="${game.userId}"]`);
    const tooltip = game.i18n.localize("MACROS-AND-MORE.button-title");
    loggedInUser.append(
      `<button type="button" title='${tooltip}' class="roll-tracker-item-button flex0" id="${game.userId}"><i class="fas fa-dice-d20"></i></button>`
    );
    html.on("click", `#${game.userId}`, () => {
      new RollTrackerDialog(game.userId).render(true);
    });
  }
});
