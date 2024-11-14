import ConfigurableDialog from "./configurable-dialog.mjs";

class LogEntryGroup {
  constructor(parent, type, category, customName = "") {
    this.parent = parent;
    this.customName = customName;
    this.type = type;
    this.category = category;
    this.entries = [];
  }

  get name() {
    if (!this.entries.length) return this.customName;
    return this.entries.every((entry) => entry.name === this.entries[0]?.name)
      ? this.entries[0]?.name
      : this.customName;
  }

  get color() {
    // Gained exp is always white
    if (this.type === "total") return "#ffffff";

    let color = this.getColorFromCategory(this.category);
    if (this.parent.groupMode === 1 && this.parent.sortMode !== 0) {
      color = this.entryCount === this.count ? color : "#ffff00";
    }
    return color;
  }

  getColorFromCategory(category) {
    switch (category) {
      case "Skill":
        return "#32cd32";
      case "Talent":
        return "hotpink";
      case "Characteristic":
        return "#40E0D0";
      case "Spell/Miracle":
        return "#b2beb5";
      case "Career Change":
        return "#ffffff";
      default:
        return "#dc143c";
    }
  }

  get value() {
    if (!this.entries.length) return null;
    return this.entries.reduce((acc, entry) => acc + entry.value, 0);
  }

  get count() {
    if (this.entries.every((entry) => entry.name === this.entries[0]?.name)) {
      return this.entries.reduce((acc, entry) => acc + sign(entry.value), 0);
    } else {
      return Object.values(this.entriesGrouped).filter((value) => value !== 0).length;
    }
  }

  get entriesGrouped() {
    return this.entries.reduce((acc, entry) => {
      acc[entry.name] = (acc[entry.name] || 0) + entry.value;
      return acc;
    }, {});
  }

  get index() {
    if (!this.entries.length) return undefined;
    return this.entries.reduce((prev, curr) => (prev < curr.index ? prev : curr.index), Infinity);
  }

  get entryCount() {
    switch (this.category) {
      case "Skill":
        return this.parent.actor.itemTypes.skill.find((i) => i.name === this.name)?.system?.advances?.value;
      case "Talent":
        return this.parent.actor.itemTypes.talent.filter((i) => i.name === this.name).length;
      case "Characteristic":
        let entry = Object.entries(game.wfrp4e.config.characteristics).find(([_, value]) => value === this.name);
        if (!entry) return 1;
        return this.parent.actor.system.characteristics[entry[0]].advances;
      default:
        return 1;
    }
  }

  get entriesStr() {
    return this.entries.map((entry) => entry.value).join(", ");
  }

  get tooltip() {
    let entryCount = this.entryCount;
    if (this.parent.groupMode === 1 && this.parent.sortMode !== 0 && entryCount !== this.count) {
      return `Warning: Entry count does not match the expected value.\nRequired: ${entryCount}\nFound: ${this.count}`;
    }

    return Object.entries(this.entriesGrouped)
      .filter(([_, value]) => value !== 0)
      .toSorted(([a0, _], [b0, __]) => a0.localeCompare(b0))
      .toSorted(([_, a1], [__, b1]) => b1 - a1)
      .map(([name, value]) => `${name}: ${value}`)
      .join("\n");
  }
}

class LogEntry {
  constructor(parent, name, value, type, category, id = undefined, index = 0, spent = 0, total = 0) {
    this.parent = parent;
    this.value = Number(value);
    this.type = type;
    this.category = category;
    this.id = id;
    this.index = index;
    this.spent = spent;
    this.total = total;

    this.setName(name);
  }

  matchTemplate(template, str) {
    const regex = new RegExp(`^${template}$`);
    const match = str.match(regex);
    return match ? match[1] : undefined;
  }

  setName(name) {
    this.name = name;
    this.category = this.getCategory(name);
  }

  getCategory(name) {
    const {skill, talent, career, spell} = this.parent.actor.itemTypes;

    if (skill.find((i) => i.name === this.name)) return "Skill";
    if (talent.find((i) => i.name === this.name)) return "Talent";
    const careerTemplate = this.matchTemplate(game.i18n.localize("LOG.CareerChange").replace("{career}", "(.*)"), name);
    if (career.find((i) => i.name === careerTemplate)) return "Career Change";
    const spellTemplate = this.matchTemplate(game.i18n.localize("LOG.MemorizedSpell").replace("{name}", "(.*)"), name);
    if (spell.find((i) => i.name === spellTemplate)) return "Spell/Miracle";
    if (Object.values(game.wfrp4e.config.characteristics).includes(this.name)) return "Characteristic";

    return this.type === "total" ? this.category || "EXP Gain" : this.category || "Unknown";
  }

  static fromLog(parent, obj) {
    return new LogEntry(
      parent,
      obj.reason,
      obj.amount,
      obj.type,
      obj.category,
      obj.id,
      obj.index,
      obj.spent,
      obj.total
    );
  }
}

function sign(x) {
  return x >= 0 ? 1 : -1;
}

export default class ExperienceVerificator extends FormApplication {
  static SORT_MODES = ["Sort: Time", "Sort: Reason", "Sort: Value", "Sort: Category"];
  static GROUP_MODES = ["Group: Off", "Group: Reason", "Group: Category"];
  static VIEW_MODES = ["Mode: View", "Mode: Edit"];
  static SPENT_CATEGORIES = ["Skill", "Talent", "Characteristic", "Spell/Miracle", "Career Change", "Unknown"];
  static GAINED_CATEGORIES = ["Character Creation", "EXP Gain", "Unknown"];

  constructor(actor, object = {}, options = {}) {
    super(object, options);
    this.sortMode = 0;
    this.groupMode = 1;
    this.editMode = false;
    if (!actor) {
      const actors = game.actors.filter((a) => a.hasPlayerOwner && a.type === "character" && a.isOwner);
      actor = actors[1];
    }
    this.init(actor);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "macro-and-more-verificator",
      template: "modules/wfrp4e-macros-and-more/templates/experience-verificator.hbs",
      width: 900,
      height: 660
    });
  }

  init(actor) {
    this.actor = actor;
    this.experience = foundry.utils.duplicate(this.actor.system.details.experience);
    this.parseLog();
  }

  splitExp(sum, length, baseExp) {
    const x = (i) => baseExp + 5 * Math.ceil(i / 5);
    let absLength = Math.abs(length);
    let absSum = Math.abs(sum);
    let seq = [];
    let testSum = 0;
    let i = 1;

    while (testSum < absSum) {
      seq.push(x(i));
      testSum += x(i);
      if (i > absLength) {
        testSum -= seq.shift();
      }
      i++;
    }

    if (sum < 0) {
      seq = seq.map((val) => -val);
    }

    return testSum === absSum ? seq : undefined;
  }

  parseLog() {
    this.log = [];
    for (let entry of this.experience.log) {
      let ungrouped = this.ungroupEntry(entry);
      if (ungrouped.length === 1) {
        this.log.push(LogEntry.fromLog(this, ungrouped[0]));
      } else {
        this.log.push(...ungrouped.map((u) => LogEntry.fromLog(this, u)));
      }
    }
    this.refreshCalculatedStats();
  }

  refreshCalculatedStats() {
    this.calcSpentExp = 0;
    this.calcGainedExp = 0;
    this.log.forEach((entry, index) => {
      entry.index = index;
      if (entry.type === "spent") {
        this.calcSpentExp += entry.value;
      } else {
        this.calcGainedExp += entry.value;
      }
      entry.calcSpent = this.calcSpentExp;
      entry.calcTotal = this.calcGainedExp;
    });
  }

  groupLog(log, groupMode, sortMode) {
    if (log.length === 0) return [];
    const groupCondition = this.getGroupCondition(groupMode);
    if (groupCondition && sortMode !== 0) {
      log = log.toSorted((a, b) => groupCondition(a).localeCompare(groupCondition(b)));
    }

    let groupLog = [];
    let group = null;
    for (let entry of log) {
      if (
        !group ||
        !groupCondition ||
        (sign(entry.value) !== sign(group.value) && sortMode === 0) ||
        groupCondition(entry) !== groupCondition(group)
      ) {
        if (group) groupLog.push(group);
        group = new LogEntryGroup(this, entry.type, entry.category);
      }
      group.entries.push(entry);
    }
    if (group) groupLog.push(group);
    return groupLog;
  }

  ungroupEntry(entry) {
    let stack = [];
    for (let i = entry.reason.length - 1; i >= 0; i--) {
      if (entry.reason[i] === ")") {
        stack.push(i);
      } else if (entry.reason[i] === "(" && stack.length) {
        let j = stack.pop();
        let length = Number(entry.reason.substring(i + 1, j));
        if (!length) {
          return [entry];
        }
        let baseExp = Object.values(game.wfrp4e.config.characteristics).find((value) => value === this.name) ? 20 : 5;
        let ungrouped = this.splitExp(entry.amount, length, baseExp);
        if (!ungrouped) {
          return [entry];
        }
        return ungrouped.map((v) => {
          let duplicatedEntry = foundry.utils.duplicate(entry);
          duplicatedEntry.amount = v;
          duplicatedEntry.reason = entry.reason.substring(0, i - 1);
          return duplicatedEntry;
        });
      }
    }
    return [entry];
  }

  getGroupCondition(mode) {
    switch (mode) {
      case 1:
        return (obj) => obj.name;
      case 2:
        return (obj) => obj.category;
    }
    return undefined;
  }

  getSortCondition(mode) {
    switch (mode) {
      case 0:
        return (obj) => obj.toSorted((a, b) => b.index - a.index);
      case 1:
        return (obj) => obj.toSorted((a, b) => a.name.localeCompare(b.name));
      case 2:
        return (obj) => obj.toSorted((a, b) => b.value - a.value);
      case 3:
        return (obj) => obj.toSorted((a, b) => a.category.localeCompare(b.category));
    }
    return undefined;
  }

  deleteEntryGroup(e, log) {
    e.preventDefault();
    if (!this.editMode) return;

    let entryGroup = log[Number($(e.currentTarget).attr("name"))];
    if (!entryGroup.entries.length) return;

    ConfigurableDialog.create({
      title: "Delete Entry Group",
      data: [[{value: `Are you sure you want to delete: ${entryGroup.name}?`}]],
      buttons: {
        confirm: {
          label: "Delete Entry",
          callback: () => {
            this.log = this.log.filter((e) => entryGroup.entries[0].index !== e.index);
            this.refreshCalculatedStats();
            this.render(true);
          }
        },
        confirmAll: {
          label: "Delete Group",
          callback: () => {
            let ids = entryGroup.entries.map((e) => e.index);
            this.log = this.log.filter((e) => !ids.includes(e.index));
            this.refreshCalculatedStats();
            this.render(true);
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => null
        }
      }
    });
  }

  editEntryGroup(e, log) {
    e.preventDefault();
    if (!this.editMode) return;

    let entryGroup = log[Number($(e.currentTarget).attr("name"))];
    if (!entryGroup.entries.length) return;

    ConfigurableDialog.create({
      title: "Edit Entry Group",
      data: [
        [
          {value: `Name`, style: "style='text-align: center;max-width: 50%'"},
          {value: `Category`, style: "style='text-align: center;max-width: 35%'"},
          {value: `Value`, style: "style='text-align: center;max-width: 15%'"}
        ],
        ...entryGroup.entries
          .toSorted((a, b) => b.index - a.index)
          .map((entry) => [
            {
              id: "name",
              type: "input",
              inputType: "text",
              value: entry.name,
              style: "style='text-align: center;max-width: 50%'"
            },
            {
              id: "category",
              type: "select",
              value: (entry.type === "spent"
                ? ExperienceVerificator.SPENT_CATEGORIES
                : ExperienceVerificator.GAINED_CATEGORIES
              ).map((c) => ({name: c, value: c})),
              selected: entry.category,
              style: "style='text-align: center;max-width: 35%'"
            },

            {
              id: "value",
              type: "input",
              inputType: "number",
              value: entry.value,
              style: "style='text-align: center;max-width: 15%'"
            }
          ])
      ],
      buttons: {
        confirm: {
          label: "Confirm",
          callback: (html) => {
            let result = ConfigurableDialog.parseResult(html, options.forceList);
            entryGroup.entries
              .toSorted((a, b) => b.index - a.index)
              .forEach((entry, i) => {
                entry.setName(result.name[i]);
                entry.category = result.category[i];
                entry.value = result.value[i];
              });
            this.render(true);
          }
        },
        cancel: {
          label: "Cancel",
          callback: () => null
        }
      },
      options: {forceList: ["name", "category", "value"]}
    });
  }

  getSpentGroupLog(groupMode, sortMode) {
    const sortCondition = this.getSortCondition(sortMode);

    let spentGroupLog = this.groupLog(
      this.log.filter((entry) => entry.type === "spent"),
      groupMode,
      sortMode
    );
    for (let skill of this.actor.itemTypes.skill) {
      if (skill.system.advances.value !== 0 && !spentGroupLog.some((entry) => entry.name === skill.name)) {
        spentGroupLog.push(new LogEntryGroup(this, "spent", "Skill", skill.name));
      }
    }
    for (let talent of this.actor.itemTypes.talent) {
      if (!spentGroupLog.some((entry) => entry.name === talent.name)) {
        spentGroupLog.push(new LogEntryGroup(this, "spent", "Talent", talent.name));
      }
    }
    for (let [key, value] of Object.entries(this.actor.system.characteristics)) {
      let name = game.wfrp4e.config.characteristics[key];
      if (value.advances !== 0 && !spentGroupLog.some((entry) => entry.name === name)) {
        spentGroupLog.push(new LogEntryGroup(this, "spent", "Characteristic", name));
      }
    }
    for (let spell of this.actor.itemTypes.spell) {
      let formattedName = game.i18n.format("LOG.MemorizedSpell", {name: spell.name});
      if (
        (spell.system.memorized.value || spell.system.lore.value === "petty") &&
        !spentGroupLog.some((entry) => entry.name === formattedName)
      ) {
        spentGroupLog.push(new LogEntryGroup(this, "spent", "Spell/Miracle", formattedName));
      }
    }
    for (let career of this.actor.itemTypes.career) {
      let formattedName = game.i18n.format("LOG.CareerChange", {career: career.name});
      if (!spentGroupLog.some((entry) => entry.name === formattedName)) {
        spentGroupLog.push(new LogEntryGroup(this, "spent", "Career Change", formattedName));
      }
    }
    if (groupMode === 2) {
      spentGroupLog = spentGroupLog.filter((entry) => entry.value != null && entry.value !== 0);
    }
    return sortCondition(spentGroupLog);
  }

  getGainedGroupLog(groupMode, sortMode) {
    const sortCondition = this.getSortCondition(sortMode);

    return sortCondition(
      this.groupLog(
        this.log.filter((entry) => entry.type !== "spent"),
        groupMode,
        sortMode
      )
    );
  }

  getSpeciesData(species) {
    let {skills, talents, randomTalents} = game.wfrp4e.utility.speciesSkillsTalents(species.value, species.subspecies);
    skills ??= [];
    talents ??= [];
    randomTalents ??= {};
    let speciesName = game.wfrp4e.config.species[species.value];
    if (species.subspecies) {
      speciesName += ` (${game.wfrp4e.config.subspecies[species.value][species.subspecies].name})`;
    }
    let speciesTalents = [];
    let talentCount = Object.values(randomTalents).reduce((acc, val) => acc + val, 0);

    for (let t of talents) {
      if (Number.isNumeric(t)) {
        randomTalents["talents"] = randomTalents["talents"] ?? [];
        randomTalents["talents"] += t;
        talentCount += t;
      } else {
        if (t.includes(", ")) {
          t = t
            .split(", ")
            .sort((a, b) => a.localeCompare(b))
            .join(` ${game.i18n.localize("SHEET.Or")} `);
        }
        speciesTalents.push(t);
        talentCount += 1;
      }
    }
    speciesTalents = speciesTalents.sort((a, b) => a.localeCompare(b));
    return {skills, talents: speciesTalents, talentCount, randomTalents, speciesName};
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", `button[id="prev"]`, async () => {
      await this.save();
      const actors = game.actors.filter((a) => a.hasPlayerOwner && a.type === "character" && a.isOwner);
      const index = actors.findIndex((a) => a.name === this.actor.name);
      this.init(actors[(index - 1 + actors.length) % actors.length]);
      this.render(true);
    });
    html.on("click", `button[id="next"]`, async () => {
      await this.save();
      const actors = game.actors.filter((a) => a.hasPlayerOwner && a.type === "character" && a.isOwner);
      const index = actors.findIndex((a) => a.name === this.actor.name);
      this.init(actors[(index + 1) % actors.length]);
      this.render(true);
    });
    html.on("click", `button[id="confirm"]`, async () => {
      await this.save();
      await this.close();
    });
    html.on("click", `button[id="verify"]`, async () => {
      await this.save();
      if (!this.fixingIssues) return ui.notifications.info("No issues found.");
      this.render(true);
    });
    html.on("click", `button[id="group"]`, () => {
      this.sortMode = (this.sortMode + 1) % ExperienceVerificator.SORT_MODES.length;
      this.render(true);
    });
    html.on("click", `button[id="compact"]`, () => {
      this.groupMode = (this.groupMode + 1) % ExperienceVerificator.GROUP_MODES.length;
      this.render(true);
    });
    html.on("click", `button[id="edit"]`, () => {
      if (!game.user.isGM)
        return ui.notifications.warn("You don't have permission to edit this actor's experience log.");
      this.editMode = !this.editMode;
      this.render(true);
    });
    html.on("click", ".spent-exp-row", (e) => this.editEntryGroup(e, this.spentGroupLog));
    html.on("click", ".gained-exp-row", (e) => this.editEntryGroup(e, this.gainedGroupLog));
    html.on("contextmenu", ".spent-exp-row", (e) => this.deleteEntryGroup(e, this.spentGroupLog));
    html.on("contextmenu", ".gained-exp-row", (e) => this.deleteEntryGroup(e, this.gainedGroupLog));
  }

  async getData(options = {}) {
    const data = super.getData();
    this.gainedGroupLog = this.getGainedGroupLog(this.groupMode, this.sortMode);
    this.spentGroupLog = this.getSpentGroupLog(this.groupMode, this.sortMode);

    options.title = `Experience Verificator: ${this.actor.name}`;
    data.sortModeDesc = ExperienceVerificator.SORT_MODES[this.sortMode];
    data.groupModeDesc = ExperienceVerificator.GROUP_MODES[this.groupMode];
    data.editModeDesc = this.editMode ? ExperienceVerificator.VIEW_MODES[1] : ExperienceVerificator.VIEW_MODES[0];
    data.gainedLog = this.gainedGroupLog;
    data.spentLog = this.spentGroupLog;
    data.experienceSpentCalculated = this.calcSpentExp;
    data.experienceGainedCalculated = this.calcGainedExp;
    data.experienceSpent = this.experience.spent;
    data.experienceGained = this.experience.total;
    return data;
  }

  async save() {
    if (!game.user.isGM) return;
    this.ignoreIssues = false;
    this.fixingIssues = false;
    await this.runGainedExpCheck();
    await this.runAttributesCheck();
    await this.runSkillsCheck();
    await this.runTalentsCheck();
    await this.runCareerCheck();
    await this.runSpellsCheck();
    const fixTotalExp = await this.runFinalExpCheck();
    let newLog = this.log.map((entry) => {
      return {
        id: entry.id,
        amount: entry.value,
        reason: entry.name,
        category: entry.category,
        spent: fixTotalExp ? entry.calcSpentExp : entry.spent,
        total: fixTotalExp ? entry.calcGainedExp : entry.total,
        type: entry.type
      };
    });
    await this.actor.update({
      "system.details.experience.total": fixTotalExp ? this.calcGainedExp : this.experience.total,
      "system.details.experience.spent": fixTotalExp ? this.calcSpentExp : this.experience.spent,
      "system.details.experience.log": newLog
    });
    this.experience = foundry.utils.duplicate(this.actor.system.details.experience);
  }

  async runGainedExpCheck() {
    let speciesEntry = this.log.find((entry) => entry.id === "char-gen-exp-species");
    let careerEntry = this.log.find((entry) => entry.id === "char-gen-exp-career");
    let attributesEntry = this.log.find((entry) => entry.id === "char-gen-exp-attributes");
    let starSignEntry = this.log.find((entry) => entry.id === "char-gen-exp-star-sign");
    if (speciesEntry && careerEntry && attributesEntry && starSignEntry) return;
    if (this.ignoreIssues || !(await this.confirmRepair())) return;

    let result = await ConfigurableDialog.create({
      title: "Verification Error: Character Creation EXP",
      confirmLabel: "Add",
      data: [
        [
          {
            value: `No player character creation info. Do you want to add one? Found unknown exp: <strong>${this.experience.total - this.calcGainedExp}</strong>`
          }
        ],
        [
          {value: "Race Selection:"},
          {
            id: "species",
            type: "select",
            selected: speciesEntry?.value,
            value: [
              {name: "Chosen [0]", value: 0},
              {name: "Random [20]", value: 20}
            ]
          }
        ],
        [
          {value: "Career Selection:"},
          {
            id: "career",
            type: "select",
            selected: careerEntry?.value,
            value: [
              {name: "Chosen [0]", value: 0},
              {name: "Random (Choice from 3) [25]", value: 25},
              {name: "Random (First Choice) [50]", value: 50}
            ]
          }
        ],
        [
          {value: "Attribute Selection:"},
          {
            id: "attributes",
            type: "select",
            selected: attributesEntry?.value,
            value: [
              {name: "Re-roll or Point-Buy [0]", value: 0},
              {name: "Random (Reordered) [25]", value: 25},
              {name: "Random [50]", value: 50}
            ]
          }
        ],
        [
          {value: "Star Sign Selection:"},
          {
            id: "starSign",
            type: "select",
            selected: starSignEntry?.value,
            value: [
              {name: "Chosen [0]", value: 0},
              {name: "Random [25]", value: 25}
            ]
          }
        ]
      ]
    });
    if (!result) return;
    this.log = this.log.filter((entry) => !(entry.id && entry.id.startsWith("char-gen-exp")));
    this.log.unshift(
      new LogEntry(
        this,
        "Character Creation: Star Sign",
        result.starSign,
        "total",
        "Character Creation",
        "char-gen-exp-star-sign"
      )
    );
    this.log.unshift(
      new LogEntry(
        this,
        "Character Creation: Attributes",
        result.attributes,
        "total",
        "Character Creation",
        "char-gen-exp-attributes"
      )
    );
    this.log.unshift(
      new LogEntry(
        this,
        "Character Creation: Career",
        result.career,
        "total",
        "Character Creation",
        "char-gen-exp-career"
      )
    );
    this.log.unshift(
      new LogEntry(
        this,
        "Character Creation: Species",
        result.species,
        "total",
        "Character Creation",
        "char-gen-exp-species"
      )
    );
    this.refreshCalculatedStats();
  }

  async runAttributesCheck() {
    const loggedProfessionAttributes = this.log.filter((e) => e.id === "char-gen-career-attribute").map((e) => e.name);
    const loggedProfessionAttributesGrp = loggedProfessionAttributes.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    const loggedAttributes = this.getSpentGroupLog(1, 1)
      .filter((e) => e.category === "Characteristic" && e.entryCount !== e.count)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .toSorted((a, b) => a.entryCount - a.count - b.entryCount + b.count);

    if (loggedProfessionAttributes.length === 5 && !loggedAttributes.length) return;
    if (this.ignoreIssues || !(await this.confirmRepair())) return;

    let career = this.actor.itemTypes.career.toSorted((a, b) => b.sort - a.sort)[0];
    let careerTalents = (career.system.characteristics ?? [])
      .map((a) => game.wfrp4e.config.characteristics[a])
      .sort((a, b) => a.localeCompare(b));

    let formattedLogAttributes = loggedAttributes.map((attribute) => {
      let text = `${attribute.name} (${attribute.entryCount - attribute.count})`;
      if (careerTalents.includes(attribute.name)) return `<span style="color: yellow">${text}</span>`;
      return text;
    });
    let data = [
      [
        {
          value: `<strong>Experience log contains unmatched attributes:</strong><br>${formattedLogAttributes.join(", ")}`
        }
      ],
      [
        {
          value: `<span style="color: yellow"><strong>${career.name} has those attributes:</strong></span><br>
                  ${careerTalents.join(", ")}<br>
                  <span style="color: yellow"><strong>Found entries in log:</strong></span><br>
                  ${Object.entries(loggedProfessionAttributesGrp)
                    .map(([key, value]) => `${key} (${value})`)
                    .join(", ")}`
        }
      ]
    ];
    if (loggedAttributes.length) {
      loggedAttributes.forEach((a) => {
        data.push([
          {
            value: a.name,
            style: `style="max-width: 50%"`
          },
          {
            id: "state",
            type: "select",
            value: [
              {name: ``, value: ""},
              {name: `First Career (Free)`, value: "career"},
              {name: `Free`, value: "free"}
            ],
            style: `style="max-width: 40%"`
          },
          {
            id: "lvl",
            type: "input",
            inputType: "number",
            value: 1,
            style: `style="text-align: center;max-width: 10%" min=1 max=${a.entryCount - a.count}`
          }
        ]);
      });
    } else {
      data.push([
        {
          value: "No unmatched attributes found, fix issue manually."
        }
      ]);
    }

    let result = await ConfigurableDialog.create({
      title: "Verification Error: Unmatched attributes",
      confirmLabel: "Fix",
      data,
      options: {forceList: ["state", "lvl"]}
    });
    if (!result) return;
    Object.values(result.state).forEach((state, i) => {
      if (state === "") return;
      let id = state !== "free" ? `char-gen-${state}-attribute` : undefined;
      for (let j = 0; j < result.lvl[i]; j++) {
        this.log.unshift(new LogEntry(this, loggedAttributes[i].name, 0, "spent", "Characteristic", id));
      }
    });
    this.refreshCalculatedStats();
  }

  async runSkillsCheck() {
    let loggedSpeciesSkills = this.log.filter((entry) => entry.id === "char-gen-species-skill").map((e) => e.name);
    let loggedSpeciesSkillsGrp = loggedSpeciesSkills.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    let loggedCareerSkills = this.log.filter((entry) => entry.id === "char-gen-career-skill").map((e) => e.name);
    let loggedCareerSkillsGrp = loggedCareerSkills.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
    let loggedSkills = this.getSpentGroupLog(1, 1)
      .filter((e) => e.category === "Skill" && e.entryCount !== e.count)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .toSorted((a, b) => a.entryCount - a.count - b.entryCount + b.count);

    if (
      Object.values(loggedSpeciesSkillsGrp).filter((value) => value === 3).length === 3 &&
      Object.values(loggedSpeciesSkillsGrp).filter((value) => value === 5).length === 3 &&
      Object.values(loggedCareerSkillsGrp).filter((value) => value > 10).length === 0 &&
      loggedCareerSkills.length === 40 &&
      !loggedSkills.length
    ) {
      return;
    }
    if (this.ignoreIssues || !(await this.confirmRepair())) return;

    let {skills, speciesName} = this.getSpeciesData(this.actor.details.species);

    let career = this.actor.itemTypes.career.toSorted((a, b) => b.sort - a.sort)[0];
    let careerSkills = career.system.skills ?? [];

    let formattedLogSkills = loggedSkills.map((skill) => {
      let text = `${skill.name} (${skill.entryCount - skill.count})`;
      if (careerSkills.includes(skill.name)) return `<span style="color: yellow">${text}</span>`;
      if (skills.some((s) => s.includes(skill.name))) return `<span style="color: limegreen">${text}</span>`;
      return text;
    });
    let data = [
      [{value: `<strong>Experience log contains unmatched skills:</strong><br>${formattedLogSkills.join(", ")}`}],
      [
        {
          value: `<span style="color: limegreen"><strong>${speciesName} has those skills:</strong></span><br>
                  ${skills.join(", ")}<br>
                  <span style="color: limegreen"><strong>Found entries in log:</strong></span><br>
                  ${Object.entries(loggedSpeciesSkillsGrp)
                    .map(([key, value]) => `${key} (${value})`)
                    .join(", ")}`
        }
      ],
      [
        {
          value: `<span style="color: yellow"><strong>${career.name} has those skills:</strong></span><br>
                  ${careerSkills.join(", ")}<br>
                  <span style="color: yellow"><strong>Found entries in log:</strong></span><br>
                  ${Object.entries(loggedCareerSkillsGrp)
                    .map(([key, value]) => `${key} (${value})`)
                    .join(", ")}`
        }
      ]
    ];
    if (loggedSkills.length) {
      loggedSkills.forEach((t) => {
        data.push([
          {
            value: t.name,
            style: `style="max-width: 50%"`
          },
          {
            id: "state",
            type: "select",
            value: [
              {name: ``, value: ""},
              {name: `Species (Free)`, value: "species"},
              {name: `First Career (Free)`, value: "career"},
              {name: `Free`, value: "free"}
            ],
            style: `style="max-width: 40%"`
          },
          {
            id: "lvl",
            type: "input",
            inputType: "number",
            value: 1,
            style: `style="text-align: center;max-width: 10%" min=1 max=${t.entryCount - t.count}`
          }
        ]);
      });
    } else {
      data.push([
        {
          value: "No unmatched skills found, fix issue manually."
        }
      ]);
    }
    let result = await ConfigurableDialog.create({
      title: "Verification Error: Unmatched Skills",
      confirmLabel: "Fix",
      data,
      options: {forceList: ["state", "lvl"]}
    });
    if (!result) return;
    Object.values(result.state).forEach((state, i) => {
      if (state === "") return;
      let id = state !== "free" ? `char-gen-${state}-skill` : undefined;
      for (let j = 0; j < result.lvl[i]; j++) {
        this.log.unshift(new LogEntry(this, loggedSkills[i].name, 0, "spent", "Skill", id));
      }
    });
    this.refreshCalculatedStats();
  }

  async runTalentsCheck() {
    const loggedSpeciesTalents = this.log
      .filter((e) => e.id === "char-gen-species-talent")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.name);
    const loggedCareerTalents = this.log
      .filter((e) => e.id === "char-gen-career-talent")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.name);
    const loggedTalents = this.getSpentGroupLog(1, 1)
      .filter((e) => e.category === "Talent" && e.entryCount !== e.count)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .toSorted((a, b) => a.entryCount - a.count - b.entryCount + b.count);

    let {talents, talentCount, randomTalents, speciesName} = this.getSpeciesData(this.actor.details.species);
    for (let [key, value] of Object.entries(randomTalents)) {
      if (value === 0) continue;
      let table = game.wfrp4e.tables.findTable(key);
      talents.push(
        `<span title="${table.results.contents.map((r) => r.text).join("\n")}">Random Talent (${value})</span>`
      );
    }

    if (loggedSpeciesTalents.length === talentCount && loggedCareerTalents.length === 1 && !loggedTalents.length) {
      return;
    }
    if (this.ignoreIssues || !(await this.confirmRepair())) return;

    let career = this.actor.itemTypes.career.toSorted((a, b) => b.sort - a.sort)[0];
    let careerTalents = (career.system.talents ?? []).sort((a, b) => a.localeCompare(b));

    let formattedLogTalents = loggedTalents.map((talent) => {
      let text = `${talent.name} (${talent.entryCount - talent.count})`;
      if (careerTalents.includes(talent.name)) return `<span style="color: yellow">${text}</span>`;
      if (talents.some((t) => t.includes(talent.name))) return `<span style="color: limegreen">${text}</span>`;
      return text;
    });
    let data = [
      [{value: `<strong>Experience log contains unmatched talents:</strong><br>${formattedLogTalents.join(", ")}`}],
      [
        {
          value: `<span style="color: limegreen"><strong>${speciesName} has those talents:</strong></span><br>
                  ${talents.join(", ")}<br>
                  <span style="color: limegreen"><strong>Found entries in log:</strong></span><br>
                  ${loggedSpeciesTalents.join(", ")}`
        }
      ],
      [
        {
          value: `<span style="color: yellow"><strong>${career.name} has those skills:</strong></span><br>
                  ${careerTalents.join(", ")}<br>
                  <span style="color: yellow"><strong>Found entries in log:</strong></span><br>
                  ${loggedCareerTalents.join(", ")}`
        }
      ]
    ];
    if (loggedTalents.length) {
      loggedTalents.forEach((t) => {
        data.push([
          {
            value: t.name,
            style: `style="max-width: 50%"`
          },
          {
            id: "state",
            type: "select",
            value: [
              {name: ``, value: ""},
              {name: `Species (Free)`, value: "species"},
              {name: `First Career (Free)`, value: "career"},
              {name: `Free`, value: "free"}
            ],
            style: `style="max-width: 40%"`
          },
          {
            id: "lvl",
            type: "input",
            inputType: "number",
            value: 1,
            style: `style="text-align: center;max-width: 10%" min=1 max=${t.entryCount - t.count}`
          }
        ]);
      });
    } else {
      data.push([
        {
          value: "No unmatched talents found, fix issue manually."
        }
      ]);
    }

    let result = await ConfigurableDialog.create({
      title: "Verification Error: Unmatched talents",
      confirmLabel: "Fix",
      data,
      options: {forceList: ["state", "lvl"]}
    });
    if (!result) return;

    Object.values(result.state).forEach((state, i) => {
      if (state === "") return;
      let id = state !== "free" ? `char-gen-${state}-talent` : undefined;
      for (let j = 0; j < result.lvl[i]; j++) {
        this.log.unshift(new LogEntry(this, loggedTalents[i].name, 0, "spent", "Talent", id));
      }
    });
    this.refreshCalculatedStats();
  }

  async runCareerCheck() {
    const loggedCareers = this.log
      .filter((e) => e.id === "char-gen-career")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => e.name);
    const loggedTalents = this.getSpentGroupLog(1, 1).filter(
      (e) => e.category === "Career Change" && e.entryCount !== e.count
    );

    if (loggedCareers.length === 1 && !loggedTalents.length) return;
    if (this.ignoreIssues || !(await this.confirmRepair())) return;

    let career = this.actor.itemTypes.career.toSorted((a, b) => b.sort - a.sort)[0];

    let formattedLogCareer = loggedTalents.map((c) => {
      if (career.name === c.name) return `<span style="color: yellow">${c.name}</span>`;
      return c.name;
    });
    let data = [
      [{value: `<strong>Experience log contains unmatched careers:</strong><br>${formattedLogCareer.join(", ")}`}],
      [
        {
          value: `<span style="color: yellow"><strong>Your first career is ${career.name}</strong></span><br>
                  <span style="color: yellow"><strong>Found entries in log:</strong></span><br>
                  ${loggedCareers.join(", ")}`
        }
      ]
    ];
    if (loggedTalents.length) {
      loggedTalents.forEach((t) => {
        data.push([
          {
            value: t.name,
            style: `style="max-width: 50%"`
          },
          {
            id: "state",
            type: "select",
            value: [
              {name: ``, value: ""},
              {name: `First Career (Free)`, value: "career"},
              {name: `Free`, value: "free"}
            ],
            style: `style="max-width: 40%"`
          },
          {
            id: "lvl",
            type: "input",
            inputType: "number",
            value: 1,
            style: `style="text-align: center;max-width: 10%" min=1 max=${t.entryCount - t.count}`
          }
        ]);
      });
    } else {
      data.push([{value: "No unmatched careers found, fix issue manually."}]);
    }

    let result = await ConfigurableDialog.create({
      title: "Verification Error: Unmatched talents",
      confirmLabel: "Fix",
      data,
      options: {forceList: ["state", "lvl"]}
    });
    if (!result) return;
    Object.values(result.state).forEach((state, i) => {
      if (state === "") return;
      let id = state !== "free" ? `char-gen-${state}` : undefined;
      for (let j = 0; j < result.lvl[i]; j++) {
        this.log.unshift(new LogEntry(this, loggedTalents[i].name, 0, "spent", "Career Change", id));
      }
    });
    this.refreshCalculatedStats();
  }

  async runSpellsCheck() {
    const loggedSpells = this.getSpentGroupLog(1, 1).filter(
      (e) => e.category === "Spell/Miracle" && e.entryCount !== e.count
    );

    if (!loggedSpells.length) return;
    if (this.ignoreIssues || !(await this.confirmRepair())) return;

    let formattedLogCareer = loggedSpells.map((c) => c.name);
    let data = [
      [{value: `<strong>Experience log contains unmatched spells:</strong><br>${formattedLogCareer.join(", ")}`}]
    ];
    if (loggedSpells.length) {
      loggedSpells.forEach((t) => {
        data.push([
          {
            value: t.name,
            style: `style="max-width: 70%"`
          },
          {
            id: "state",
            type: "select",
            value: [
              {name: ``, value: ""},
              {name: `Free`, value: "free"}
            ],
            style: `style="max-width: 20%"`
          },
          {
            id: "lvl",
            type: "input",
            inputType: "number",
            value: 1,
            style: `style="text-align: center;max-width: 10%" min=1 max=${t.entryCount - t.count}`
          }
        ]);
      });
    } else {
      data.push([{value: "No unmatched careers found, fix issue manually."}]);
    }

    let result = await ConfigurableDialog.create({
      title: "Verification Error: Unmatched spells",
      confirmLabel: "Fix",
      data,
      options: {forceList: ["state", "lvl"]}
    });
    if (!result) return;
    Object.values(result.state).forEach((state, i) => {
      if (state === "") return;
      for (let j = 0; j < result.lvl[i]; j++) {
        this.log.unshift(new LogEntry(this, loggedSpells[i].name, 0, "spent", "Career Change"));
      }
    });
    this.refreshCalculatedStats();
  }

  async runFinalExpCheck() {
    let totalExp = this.experience.total;
    let spentExp = this.experience.spent;

    let data = [];
    if (totalExp !== this.calcGainedExp) {
      data.push([{value: `Total EXP: ${totalExp} (Calculated: ${this.calcGainedExp})`}]);
    }
    if (spentExp !== this.calcSpentExp) {
      data.push([{value: `Spent EXP: ${spentExp} (Calculated: ${this.calcSpentExp})`}]);
    }
    if (!data.length || this.ignoreIssues || !(await this.confirmRepair())) return false;

    return await ConfigurableDialog.create({
      title: "Verification Error: Final Experience",
      confirmLabel: "Fix",
      data
    });
  }

  async confirmRepair() {
    if (this.fixingIssues) return true;
    const result = await Dialog.confirm({
      title: "Verification Error",
      content: `<div class="form-group"><label>Verificator found issues, do you want to fix them now?</label></div>`
    });
    if (!result) {
      this.ignoreIssues = true;
    } else {
      this.fixingIssues = true;
    }
    return result;
  }
}
