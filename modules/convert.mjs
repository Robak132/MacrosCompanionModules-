const localiseItemType = (type) => game.i18n.localize(`TYPES.Item.${type}`);

const localiseActorType = (type) => game.i18n.localize(`TYPES.Actor.${type}`);

function getDefaultIcon(type) {
  switch (type) {
    case "ammunition":
    case "container":
    case "trapping":
    case "weapon":
    case "money":
    case "cargo":
      return "modules/wfrp4e-core/icons/equipment/trapping.png";
    case "armour":
      return "modules/wfrp4e-core/icons/armour/armour.png";
    case "injury":
      return "modules/wfrp4e-core/icons/injuries/injury.png";
    case "psychology":
      return "modules/wfrp4e-core/icons/psychologies/psychology.png";
    case "disease":
    case "prayer":
    case "skill":
    case "talent":
    case "spell":
    case "trait":
    case "mutation":
      return `modules/wfrp4e-core/icons/${type}s/${type}.png`;
    default:
      return null;
  }
}

function hasDefaultIcon(item) {
  if (
    item.type === "weapon" &&
    (item.img === "modules/wfrp4e-core/icons/equipment/melee-weapon.png" ||
      "modules/wfrp4e-core/icons/equipment/ranged-weapon.png")
  ) {
    return true;
  }
  return item.img === getDefaultIcon(item.type);
}

export async function addItemContextOptions(html, options) {
  options.push({
    name: game.i18n.localize("MACROS-AND-MORE.ChangeItemType"),
    icon: `<i class="far fa-exchange"></i>`,
    condition: () => game.user.isGM || game.user.isOwner,
    callback: async (header) => {
      const itemId = header.data("document-id");
      const item = game.items.get(itemId);
      const originalTypeLocalised = localiseItemType(item.type);
      const options = Object.keys(CONFIG.Item.dataModels)
        .filter((t) => t !== item.type)
        .sort((a, b) => localiseItemType(a).localeCompare(localiseItemType(b)))
        .map((t) => `<option value="${t}">${localiseItemType(t)}</option>`);

      await new Dialog({
        title: game.i18n.localize("MACROS-AND-MORE.ChangeItemType"),
        content: `<form>
          <div class="form-group">
            <p style="flex: 1" class="section-title">${originalTypeLocalised}</p>
            <span style="flex: 1;text-align: center">&#8594;</span>
            <select style="flex: 1" name="convert-type">
              ${options}
            </select>
          </div>
        </form>`,
        buttons: {
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          },
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Confirm",
            callback: async (html) => {
              const convertType = html.find('[name="convert-type"]').val();
              let update = {
                type: convertType
              };
              if (hasDefaultIcon(item)) {
                update.img = getDefaultIcon(convertType) ?? item.img;
              }
              try {
                await item.update(update);
              } catch (e) {
                // Ignoring error
              }
              window.foundry.utils.debouncedReload();
            }
          }
        },
        default: "yes"
      }).render(true);
    }
  });
}

export async function addActorContextOptions(html, options) {
  options.push({
    name: game.i18n.localize("MACROS-AND-MORE.ChangeActorType"),
    icon: `<i class="far fa-exchange"></i>`,
    condition: () => game.user.isGM || game.user.isOwner,
    callback: async (header) => {
      const documentId = header.data("document-id");
      const actor = game.actors.get(documentId);
      const originalTypeLocalised = localiseActorType(actor.type);
      const options = Object.keys(CONFIG.Actor.dataModels)
        .filter((t) => t !== actor.type)
        .sort((a, b) => localiseActorType(a).localeCompare(localiseActorType(b)))
        .map((t) => `<option value="${t}">${localiseActorType(t)}</option>`);

      await new Dialog({
        title: game.i18n.localize("MACROS-AND-MORE.ChangeActorType"),
        content: `<form>
          <div class="form-group">
            <p style="flex: 1" class="section-title">${originalTypeLocalised}</p>
            <span style="flex: 1;text-align: center">&#8594;</span>
            <select style="flex: 1" name="convert-type">
              ${options}
            </select>
          </div>
        </form>`,
        buttons: {
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          },
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Confirm",
            callback: async (html) => {
              const convertType = html.find('[name="convert-type"]').val();
              try {
                await actor.update({
                  type: convertType
                });
              } catch (e) {
                // Ignoring error
              }
              window.foundry.utils.debouncedReload();
            }
          }
        },
        default: "yes"
      }).render(true);
    }
  });
}
