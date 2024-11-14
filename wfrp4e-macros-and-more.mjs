import ItemTransfer from "./modules/item-transfer.mjs";
import {handleLosingGroupAdvantage} from "./modules/group-advantage-losing.mjs";
import Utility from "./modules/utility.mjs";
import MaintenanceWrapper from "./modules/maintenance.mjs";
import {addActorContextOptions, addItemContextOptions} from "./modules/convert.mjs";
import RobakMarketWfrp4e, {overrideMarket} from "./modules/market.mjs";
import ExperienceVerificator from "./modules/experience-verificator.mjs";
import ConfigurableDialog from "./modules/configurable-dialog.mjs";
import {setupAutoEngaged} from "./modules/auto-engage.mjs";

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
    name: "[Experimental] Currencies in Pay/Credit commands",
    hint: "Enables advanced currency handling in Pay/Credit commands.",
    scope: "world",
    config: true,
    onChange: foundry.utils.debouncedReload,
    default: false,
    restricted: true,
    type: Boolean
  });
  await game.settings.register("wfrp4e-macros-and-more", "current-region", {
    name: "Current region",
    hint: "Current region for currency conversion.",
    scope: "world",
    config: true,
    default: "empire",
    onChange: foundry.utils.debouncedReload,
    restricted: true,
    choices: RobakMarketWfrp4e.getKeyValueRegions(),
    type: String
  });
  await game.settings.register("wfrp4e-macros-and-more", "auto-engaged", {
    name: "Enable Auto-Engaging",
    hint: "Automatically set 'Engaged' condition when rolling attacks.",
    scope: "world",
    config: true,
    onChange: foundry.utils.debouncedReload,
    default: false,
    restricted: true,
    type: Boolean
  });
  await game.settings.registerMenu("wfrp4e-macros-and-more", "menu-maintenance", {
    name: "MACROS-AND-MORE.SettingsMaintenanceMenuName",
    label: "MACROS-AND-MORE.SettingsMaintenanceMenuLabel",
    hint: "MACROS-AND-MORE.SettingsMaintenanceMenuHint",
    icon: "fas fa-cog",
    type: MaintenanceWrapper,
    onChange: foundry.utils.debouncedReload,
    restricted: true
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

  // Load regions
  await RobakMarketWfrp4e.loadRegions();

  // Register settings
  await registerSettings();

  // Register handlebars
  await registerHandlebars();

  // Register
  if (game.settings.get("wfrp4e-macros-and-more", "auto-engaged")) {
    setupAutoEngaged();
  }

  // Register market
  if (game.settings.get("wfrp4e-macros-and-more", "currency-market")) {
    await overrideMarket();
  }

  // Load scripts
  await fetch("modules/wfrp4e-macros-and-more/packs/effects.json")
    .then((r) => r.json())
    .then(async (effects) => {
      foundry.utils.mergeObject(game.wfrp4e.config.effectScripts, effects);
    });

  SocketHandlers.transferItem = async function (data) {
    Utility.log("Received transfer object", data);
    if (!game.user.isUniqueGM) return;
    return ItemTransfer.handleTransfer(data);
  };
  SocketHandlers.darkWhispers = async function (data) {
    Utility.log("Received dark whispers", data);
    if (!game.user.isUniqueGM) return;
    return Utility.darkWhispersDialog(data);
  };
});

Hooks.on("updateCombat", async (combat, updates, _, __) => {
  let setting = game.settings.get("wfrp4e-macros-and-more", "losing-advantage");
  if (setting && game.user.isUniqueGM && foundry.utils.hasProperty(updates, "round")) {
    await handleLosingGroupAdvantage(combat.combatants);
  }
});

Hooks.on("getItemDirectoryEntryContext", addItemContextOptions);

Hooks.on("getActorDirectoryEntryContext", addActorContextOptions);

Hooks.on("renderActorSheetWFRP4eCharacter", (sheet, html, _) => ItemTransfer.setupItemHandler(sheet, html));

Hooks.on("renderActorSheetWFRP4eCreature", (sheet, html, _) => ItemTransfer.setupItemHandler(sheet, html));

Hooks.on("renderActorSheetWFRP4eNPC", (sheet, html, _) => ItemTransfer.setupItemHandler(sheet, html));

Hooks.on("renderActorSheetWFRP4eVehicle", (sheet, html, _) => ItemTransfer.setupItemHandler(sheet, html));

Hooks.on("renderChatLog", (log, html) => {
  html.on("click", ".unstable-actor", async (event) => {
    event.preventDefault();
    const dmg = Number.fromString($(event.currentTarget).attr("data-damage"));
    const actor = canvas.tokens.get($(event.currentTarget).attr("data-token")).actor;
    await actor.applyBasicDamage(dmg, {damageType: game.wfrp4e.config.DAMAGE_TYPE.IGNORE_ALL});
  });
});
