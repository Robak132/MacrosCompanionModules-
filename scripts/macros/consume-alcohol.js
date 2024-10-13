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
  async addModifiers(actor) {
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
   * Consumes the specified beverage for the selected characters.
   * @param {Beverage} beverage - The beverage being consumed.
   */
  async consumeAlcohol(beverage) {
    let characters = [];
    if (game.user.character) {
      // Get player's main character
      characters.push(game.user.character);
    } else if (canvas.tokens.controlled.length) {
      // Get selected characters
      characters = canvas.tokens.controlled.map((t) => t.actor);
    } else {
      return ui.notifications.error("Select one or more characters on which you want to run this macro");
    }

    for (const actor of characters) {
      if (beverage.id === "no_roll") return await this.addModifiers(actor);
      for (let i = 0; i < beverage.tests; i++) {
        const test = await actor.setupSkill(game.i18n.localize("NAME.ConsumeAlcohol"), {
          fields: {
            difficulty: beverage.strength
          }
        });
        await test.roll();
        if (test.result.outcome === "failure") {
          await this.addModifiers(actor);
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
    },
    {
      id: "no_roll",
      name: "No Roll",
      strength: "",
      description: "Just adds the modifiers without rolling."
    }
  ];

  static async run() {
    return await this.wait(
      {
        title: "Determine Beverage",
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
          </div>`,
        buttons: [],
        close: () => null
      },
      {
        width: 600
      }
    );
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.on("click", ".document", async (ev) => {
      let beverage = ConsumeAlcohol.BEVERAGES.find((b) => b.id === ev.currentTarget.dataset.id);
      await this.consumeAlcohol(beverage);
    });
  }
}

await ConsumeAlcohol.run();
