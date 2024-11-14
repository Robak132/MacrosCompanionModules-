export default class MaintenanceWrapper extends FormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
  }

  hash(str) {
    if (!str) return undefined;
    str = str.replace("\r\n", "\n");
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      let char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    let hex = (hash >>> 0).toString(16);
    return hex.padStart(8, "0");
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "macro-and-more-maintenance",
      title: "Maintenance",
      template: "modules/wfrp4e-macros-and-more/templates/maintenance.hbs",
      width: 600
    });
  }

  async _render(force, options) {
    this.folder = await this.getOrCreateFolder();
    this.macros = await this.buildContent();
    if (!this.macros.updated.length && !this.macros.added.length && !this.macros.removed.length) {
      return ui.notifications.notify("No updates needed, all macros are up to date");
    }
    options.height = 104;
    if (this.macros.updated.length) options.height += 34 + this.macros.updated.length * 27;
    if (this.macros.added.length) options.height += 34 + this.macros.added.length * 27;
    if (this.macros.removed.length) options.height += 34 + this.macros.removed.length * 27;
    await super._render(force, options);
  }

  async getData(options = {}) {
    const data = super.getData();
    this.module = await fetch("modules/wfrp4e-macros-and-more/module.json").then((r) => r.json());
    Object.assign(data, this.macros);
    return data;
  }

  toArray(variable) {
    return variable == null ? [] : [].concat(variable);
  }

  async _updateObject(event, formData) {
    let toUpdate = [];
    let toCreate = [];
    let toDelete = [];
    this.toArray(formData.added).forEach((val, i) => {
      if (val) toCreate.push(this.macros.added[i].compendium);
    });
    this.toArray(formData.updated).forEach((val, i) => {
      if (val) {
        let macro = this.macros.updated[i];
        toUpdate.push({
          _id: macro.existing._id,
          name: macro.compendium.name,
          img: macro.compendium.img,
          command: macro.compendium.command,
          "flags.wfrp4e-macros-and-more.version": macro.compendium.flags["wfrp4e-macros-and-more"].version
        });
      }
    });
    this.toArray(formData.removed).forEach((val, i) => {
      if (val) toDelete.push(this.macros?.removed[i]?.existing._id);
    });

    let created = await Macro.createDocuments(toCreate);
    created.forEach((macro) =>
      toUpdate.push({
        _id: macro._id,
        folder: this.folder
      })
    );
    await Macro.updateDocuments(toUpdate);
    await Macro.deleteDocuments(toDelete);

    ui.notifications.notify(
      `${game.i18n.format("UPDATER.Notification", {
        created: toCreate.length,
        updated: toUpdate.length,
        name: this.module.id,
        version: this.module.version
      })}`
    );
  }

  getSourceId = (macro) => macro?.flags["wfrp4e-macros-and-more"]?.sourceId;
  getName = (macro) => macro.existing?.name ?? macro.compendium?.name;

  async buildContent() {
    let macros = {};
    for (let m of game.macros.contents.filter((m) => !!m.flags["wfrp4e-macros-and-more"])) {
      if (m._source?.folder !== this.folder._id) {
        await m.update({folder: this.folder});
      }
      macros[m._id] = {existing: m};
    }
    for (let m of await game.packs.get(`wfrp4e-macros-and-more.macros`).getDocuments()) {
      let entries = Object.entries(macros ?? {});
      let found = entries.find((entry) => this.getSourceId(entry[1].existing) === this.getSourceId(m));
      if (found) {
        macros[found[0]].compendium = m;
      } else {
        macros[this.getSourceId(m)] = {compendium: m};
      }
    }

    // Sorting
    macros = Object.fromEntries(
      Object.entries(macros).sort(([_, a], [__, b]) => this.getName(a).localeCompare(this.getName(b)))
    );

    let content = {
      updated: [],
      added: [],
      removed: []
    };
    for (let [_, macro] of Object.entries(macros)) {
      if (macro.existing) {
        macro.existing.version = macro.existing?.flags["wfrp4e-macros-and-more"]?.version;
        macro.existing.hash = this.hash(macro.existing?.command);
      }
      if (macro.compendium) {
        macro.compendium.version = macro.compendium?.flags["wfrp4e-macros-and-more"]?.version;
        macro.compendium.hash = this.hash(macro.compendium?.command);
      }

      if (macro.existing?.name !== macro.compendium?.name || macro.existing?.hash !== macro.compendium?.hash) {
        if (macro.existing && macro.compendium) {
          content.updated.push({
            name:
              macro.existing.name === macro.compendium.name
                ? macro.existing.name
                : `${macro.existing.name} -> ${macro.compendium.name}`,
            hash:
              macro.existing.hash === macro.compendium.hash
                ? macro.existing.hash
                : `(${macro.existing.hash}) -> (${macro.compendium.hash})`,
            img: macro.existing.img,
            existing: macro.existing,
            compendium: macro.compendium
          });
        } else if (macro.existing) {
          content.removed.push({
            name: macro.existing.name,
            hash: macro.existing.hash,
            img: macro.existing.img,
            existing: macro.existing
          });
        } else if (macro.compendium) {
          content.added.push({
            name: macro.compendium.name,
            hash: macro.compendium.hash,
            img: macro.compendium.img,
            compendium: macro.compendium
          });
        }
      }
    }
    return content;
  }

  async getOrCreateFolder() {
    let existingFolder = game.folders.find((f) => f.name === `Robak's Macros` && f.type === "Macro");
    if (!existingFolder) {
      existingFolder = await Folder.create({
        name: `Robak's Macros`,
        type: "Macro"
      });
    }
    return existingFolder;
  }
}
