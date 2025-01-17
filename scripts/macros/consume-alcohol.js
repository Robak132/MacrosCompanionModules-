/* ==========
* MACRO: Consume Alcohol Macro
* AUTHORS: @Robak132
* DESCRIPTION: Automatically counts failures and adds modifiers when drunk.
========== */

/**
 * @typedef {Object} Beverage
 * @property {string} id - The unique identifier for the beverage.
 * @property {string} difficulty - The difficulty level of consuming the beverage.
 * @property {string} name - The name of the beverage.
 * @property {string} strength - The strength of the beverage.
 * @property {number} tests - The number of tests required for the beverage.
 * @property {string} description - A description of the beverage.
 */

class ConsumeAlcohol extends Dialog {
  constructor(data, options) {
    super(data, options);
    this.targets = data.targets;
  }

  /**
   * Counts the number of alcohol consumption failures for the given actor.
   * @param {Object} actor - The actor whose failures are being counted.
   * @returns {number} The number of failures.
   */
  countFailures(actor) {
    const ca1 = actor.effects.filter((e) => e.conditionId === "consumealcohol1");
    if (ca1.length) return 1;
    const ca2 = actor.effects.filter((e) => e.conditionId === "consumealcohol2");
    if (ca2.length) return 2;
    const ca3 = actor.effects.filter((e) => e.conditionId === "consumealcohol3");
    if (ca3.length) return ca3.length + 2;
    return 0;
  }

  /**
   * Adds or updates the alcohol consumption modifiers for the given actor.
   * @param {Object} actor - The actor to whom the modifiers are being added.
   */
  async addModifier(actor) {
    const failures = this.countFailures(actor);
    if (failures === 0) {
      actor.addSystemEffect("consumealcohol1");
    } else if (failures < 3) {
      actor.removeSystemEffect(`consumealcohol${failures}`);
      actor.addSystemEffect(`consumealcohol${failures + 1}`);
    } else {
      await actor.updateEmbeddedDocuments("ActiveEffect", [
        {
          _id: actor.effects.find((e) => e.conditionId === "consumealcohol3" && e.disabled === false).id,
          disabled: true
        }
      ]);
      actor.addSystemEffect("consumealcohol3");
    }
    if (actor.characteristics.t.bonus <= failures + 1) {
      game.tables.find((table) => table.getFlag("wfrp4e", "key") === "stinking-drunk").draw();
    }
  }

  /**
   *
   * @param {Object} actor
   */
  async removeModifier(actor) {
    const failures = this.countFailures(actor);
    if (failures === 0) return;

    if (failures === 1) {
      actor.removeSystemEffect("consumealcohol1");
    } else if (failures <= 3) {
      actor.removeSystemEffect(`consumealcohol${failures}`);
      actor.addSystemEffect(`consumealcohol${failures - 1}`);
    } else {
      const effect = actor.effects.find((e) => e.conditionId === "consumealcohol3" && e.disabled === true);
      if (effect) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      }
    }
  }

  /**
   * Consumes the specified beverage for the selected characters.
   * @param {string} selectedOptionId - The ID of the selected option.
   */
  async consumeAlcohol(selectedOptionId) {
    for (let actor of this.targets) {
      switch (selectedOptionId) {
        case "increase":
          await this.addModifier(actor);
          break;
        case "reduce":
          await this.removeModifier(actor);
          break;
        case "remove_all":
          const effects = actor.effects.filter((e) => e.conditionId?.startsWith("consumealcohol")).map((e) => e.id);
          await actor.deleteEmbeddedDocuments("ActiveEffect", effects);
          break;
        default:
          let beverage = ConsumeAlcohol.BEVERAGES.find((b) => b.id === selectedOptionId);
          let userId = game.users.find((u) => u.character?.id === actor.id)?.id ?? "GM";
          for (let i = 0; i < beverage.tests; i++) {
            const test = await SocketHandlers.sendRollToUserAndWait(
              userId,
              actor.id,
              game.i18n.localize("NAME.ConsumeAlcohol"),
              {
                fields: {
                  difficulty: beverage.difficulty
                }
              }
            );
            if (test.data.result.outcome === "failure") {
              await this.addModifier(actor);
            }
          }
      }
    }
  }

  /**
   * List of predefined beverages with their properties.
   * @type {Beverage[]}
   */
  static BEVERAGES = [
    {
      id: "small_beer",
      difficulty: "easy",
      name: "Small Beer",
      strength: "Test (+40) per pint",
      tests: 1,
      description: "Small beer is a weak, low-alcohol beer, often consumed by children and the poor."
    },
    {
      id: "ale",
      difficulty: "average",
      name: "Ale",
      strength: "Test (+20) per pint",
      tests: 1,
      description: "Ale is the most common drink in the Empire, brewed in every town and village."
    },
    {
      id: "dwarf_ale",
      difficulty: "average",
      name: "Dwarf Ale",
      strength: "3 Tests (+20) per pint",
      tests: 3,
      description: "The most celebrated ales by renowned Dwarf breweries."
    },
    {
      id: "bugman_ale",
      difficulty: "average",
      name: "Bugman’s XXXXXX Ale",
      strength: "4 Tests (+20) per pint",
      tests: 4,
      description: "The most famous and potent ale in the Old World."
    },
    {
      id: "wine",
      difficulty: "average",
      name: "Wine",
      strength: "Test (+20) per glass",
      tests: 1,
      description: "Wine is a luxury, and the quality of the wine is often a sign of the wealth of the host."
    },
    {
      id: "spirit",
      difficulty: "challenging",
      name: "Spirit",
      strength: "Test (+0) per shot",
      tests: 1,
      description: "Spirits are distilled alcoholic beverages, much stronger than beer or wine."
    }
  ];

  /** @return {object[] | void} */
  static selectTargets() {
    const targets = game.user.targets.size ? game.user.targets : canvas.tokens.controlled;
    let actors = targets.map((t) => t.actor).filter((t) => t.type === "character" || t.type === "npc");
    if (!actors.length && game.user.character) actors = [game.user.character];
    actors = actors.filter((a) => a.type === "character" || a.type === "npc");
    return actors.length ? actors : null;
  }

  static async run() {
    let targets = ConsumeAlcohol.selectTargets();
    if (!targets) return ui.notifications.error("Select one or more characters on which you want to run this macro");
    new ConsumeAlcohol(
      {
        title: "Consume Alcohol Helper",
        targets,
        content: `<div class="directory">
            <ol class="directory-list">
              ${ConsumeAlcohol.BEVERAGES.map((item) => {
                return `<a><li style="align-items: center;justify-content: center;display: flex" class="document flexrow" data-id="${item.id}">
                    <h4 style="flex: 3"><b>${item.name}</b></h4>
                    <h4 style="flex: 3"><i>${item.strength}</i></h4>
                    <h4 style="flex: 5">${item.description}</h4>
                  </li></a>`;
              }).join("")}
            </ol>
            <hr>
            <ol class="directory-list">
              <a><li style="align-items: center;justify-content: center;display: flex" class="document flexrow" data-id="increase">
                <h4 style="flex: 3"><b>Increase modifier</b></h4>
                <h4 style="flex: 3"></h4>
                <h4 style="flex: 5">Increase level of 'Consume Alcohol' modfier.</h4>
              </li></a>
              <a><li style="align-items: center;justify-content: center;display: flex" class="document flexrow" data-id="reduce">
                <h4 style="flex: 3"><b>Reduce modifier</b></h4>
                <h4 style="flex: 3"></h4>
                <h4 style="flex: 5">Reduces level of 'Consume Alcohol' modfier.</h4>
              </li></a>
              <a><li style="align-items: center;justify-content: center;display: flex" class="document flexrow" data-id="remove_all">
                <h4 style="flex: 3"><b>Remove all modifiers</b></h4>
                <h4 style="flex: 3"></h4>
                <h4 style="flex: 5">Removes all 'Consume Alcohol' modifiers.</h4>
              </li></a>
          </div>`,
        buttons: [],
        close: () => null
      },
      {
        width: 600
      }
    ).render(true);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", ".document", async (ev) => {
      await this.close();
      await this.consumeAlcohol(ev.currentTarget.dataset.id);
    });
  }
}

ConsumeAlcohol.run();
