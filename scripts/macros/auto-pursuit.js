/* ==========
* MACRO: Auto-Pursuit
* AUTHOR: Robak132
* DESCRIPTION: Allows for creating pursuits (Core & UiA rules)
========== */

// Preset Obstacles
const PRESET_OBSTACLES = {
  large_log: {
    name: "Large Log",
    perceived: "Automatically",
    navigatePerceived: "Average (+20) Athletics Test",
    consequences: "Gain Prone.",
    stopping: true
  },
  haystack: {
    name: "Haystack",
    perceived: "Automatically",
    navigatePerceived: "Hard (-20) Climb Test",
    consequences: "Gain Entangled (S 2D10+20).",
    stopping: true
  },
  puddle: {
    name: "Filthy Puddle",
    perceived: "Average (+20) Perception Test",
    navigatePerceived: "Average (+20) Athletics Test",
    navigateNotPerceived: "Hard (-20) Athletics Test",
    consequences: "-2 SL to all Fellowship Tests until you clean yourself."
  },
  crates: {
    name: "Crates of Merchandise",
    perceived: "Automatically",
    navigatePerceived: "Challenging (+0) Athletics Test",
    consequences: "Gain Prone, 2D10 pieces of merchandise are broken.",
    stopping: true
  },
  gate: {
    name: "Closed Gate",
    perceived: "Automatically",
    navigatePerceived: "Hard (-20) Climb Test",
    consequences: "Cannot move; fall 2 yds on Impressive Failure (-6 SL).",
    stopping: true
  },
  pothole: {
    name: "Pothole",
    perceived: "Challenging (+0) Perception Test",
    navigatePerceived: "Easy (+40) Athletics Test",
    navigateNotPerceived: "Hard (-20) Athletics Test",
    consequences: "Gain Twisted Ankle Critical Injury."
  },
  quicksand: {
    name: "Quicksand",
    perceived: "Challenging (+0) Perception Test",
    navigatePerceived: "Easy (+40) Athletics Test",
    navigateNotPerceived: "Hard (-20) Athletics Test",
    consequences:
      "Gain Entangled (S 2D10+20), each Round S increase by D10, after 6 Rounds pass Challenging (+0) Cool Test or start Drowning.",
    stopping: true
  },
  goat_herd: {
    name: "Passing Goat Herd",
    perceived: "Automatically",
    navigatePerceived: "Hard (-20) Athletics Test",
    consequences: "Weapon (Horns) +6 hit."
  },
  fish_guts_bucket: {
    name: "Bucket full of Fish Guts",
    perceived: "Automatically",
    navigatePerceived: "Easy (+40) Athletics Test",
    consequences: "Gain Prone.",
    stopping: true
  },
  fish_guts_slick: {
    name: "Slick of Fish Guts",
    perceived: "Automatically",
    navigatePerceived: "Hard (-20) Athletics Test",
    consequences:
      "Gain Prone, -2 SL to all Fellowship Tests until they clean themselves, test for Festering Wounds if they have untreated wounds.",
    stopping: true
  },
  rotten_Floorboards: {
    name: "Rotten Floorboards",
    perceived: "Hard (-20) Perception Test",
    navigatePerceived: "Average (+20) Athletics Test",
    navigateNotPerceived: "Very Hard (-30) Athletics Test",
    consequences: "Fall from 3 yds."
  },
  workman: {
    name: "Workman on Ladder",
    perceived: "Automatically",
    navigatePerceived: "Easy (+40) Athletics Test",
    consequences: "Gain Prone Condition, workman must pass Hard (-20) Athletics Test or fall D10 yds.",
    stopping: true
  },
  cart: {
    name: "Unattended Cart",
    perceived: "Automatically",
    navigatePerceived: "Average (+20) Climb Test",
    consequences: "Lose Round",
    stopping: true
  },
  cart_cabbage: {
    name: "Unattended Cart Full of Cabbages",
    perceived: "Automatically",
    navigatePerceived: "Challenging (+0) Climb Test",
    consequences:
      "Average (+20) Initiative Test or gain Surprised. Replace with Unattended Cart and Scattered Mound of Cabbages obstacles.",
    stopping: true
  },
  mound_cabbage: {
    name: "Scattered Mound of Cabbages",
    perceived: "Automatically",
    navigatePerceived: "Hard (-20) Athletics Test",
    consequences: "Suffer fall from 1 yd and gain Prone.",
    stopping: true
  }
};

class SimplePursuit {
  MAIN_STYLE = "text-align: center;font-family: CaslonPro;font-weight: 600;font-variant: small-caps";
  DIALOG_WIDTH = 500;
  POST_TO_CHAT = true;

  constructor() {
    this.objectsInPursuit = this.initObjectList();
    this.maxDistance = 10;
    this.turn = 0;
    this.initialDialogHeader = "";
    this.initialDialogFooter = `
      <h2 style="${this.MAIN_STYLE}"><b>Escaping from combat</b></h2>
      <h4><b>Advantage: </b>1 Distance per spent Advantage.</h4>
      <h4><b>Dodge: </b>1 Distance.</h4>
      <h4><b>Fleeing: </b>3 Distance, if opponent attacks, 1 Distance if not.</h4>`;
    this.nextTurnFooter = `
      <h2 style="${this.MAIN_STYLE}"><b>Distance Update Rules</b></h2>
      <h4 style="text-align: center">Distance Moved = SL</h4>`;
  }

  initObjectList() {
    const objectsInPursuitSet = new Set();
    if (canvas.tokens.controlled.length) {
      canvas.tokens.controlled.forEach((t) => {
        objectsInPursuitSet.add(this.getPursuitObjectFromActor(t.actor));
      });
    } else {
      game.actors
        .filter((a) => a.hasPlayerOwner && a.type !== "vehicle")
        .forEach((a) => {
          objectsInPursuitSet.add(this.getPursuitObjectFromActor(a));
        });
    }
    return [...objectsInPursuitSet];
  }

  sortObjects(objects) {
    return objects
      .sort((a, b) => a.name.localeCompare(b.name, "pl"))
      .sort((a, b) => (a.move < b.move ? -1 : 1))
      .sort((a, b) => Number(a.quarry) - Number(b.quarry))
      .sort((a, b) => Number(a.type === "obstacle") - Number(b.type === "obstacle"))
      .sort((a, b) => (a.distance < b.distance ? -1 : 1));
  }

  // -------------//

  getPursuitObjectFromActor(actor) {
    return {
      actor,
      active: true,
      name: actor.name,
      move: actor.system.details.move.value,
      run: actor.system.details.move.run,
      type: "character",
      distance: 0,
      testSL: this.getDefaultTestSL(),
      quarry: false
    };
  }

  getCharacterMoveFormatted(character) {
    return `${character.move}`;
  }

  getDefaultTestSL() {
    return 0;
  }

  getDistanceMoved(character) {
    if (character.testSL !== undefined) {
      return character.testSL;
    } else {
      return 0;
    }
  }

  getObstacleNavigateTest(object) {
    if (object.navigateNotPerceived != null) {
      return object.navigatePerceived + "/" + object.navigateNotPerceived;
    } else {
      return object.navigatePerceived;
    }
  }

  // -------------//

  getChatTable() {
    let content = `
      <table>
        <tr>
          <td style="text-align:center"><b>Q</b></td>
          <td style="text-align:center"><b>Name</b></td>
          <td style="text-align:center"><b>Move</b></td>
          <td style="text-align:center"><b>Distance</b></td>
        </tr>`;
    this.getActive().forEach((object) => {
      if (object.type === "character") {
        content += `
          <td style="text-align:center">${object.quarry ? "<i class='fas fa-check' />" : ""}</td>
          <td style="text-align:center">${object.name}</td>
          <td style='text-align:center'>${object.move}</td>
          <td style="text-align:center">${object.distance}</td>
        </tr>`;
      } else {
        content += `
          <td style="text-align:center" colspan=3"><i><b>${
            object.perceived === "Automatically" ? object.name : "Unknown Obstacle"
          }</b></i></td>
          <td style="text-align:center">${object.distance}</td>
        </tr>`;
      }
    });
    content += "</table>";
    return content;
  }

  getChatLostCharacters() {
    const quarry = this.getQuarry();
    const pursuers = this.getPursuers();

    let messages = "";
    const characterDistance = [];
    const debugCharacterDistance = [];
    for (let i = 0; i < quarry.length; i++) {
      const row = [];
      const debugRow = [];
      let lastDistance = quarry[i].distance;
      let isLost = false;

      for (let j = pursuers.length - 1; j >= 0; j--) {
        debugRow.push(lastDistance - pursuers[j].distance);
        if (lastDistance - pursuers[j].distance < 0) {
          row.push(-1);
        } else if (isLost || lastDistance - pursuers[j].distance >= this.maxDistance) {
          row.push(0);
          isLost = true;
          lastDistance = pursuers[j].distance;
        } else {
          row.push(1);
          lastDistance = pursuers[j].distance;
        }
      }
      characterDistance.push(row.reverse());
      debugCharacterDistance.push(debugRow.reverse());
    }

    // Escapes
    for (let i = 0; i < quarry.length; i++) {
      for (let j = 0; j < pursuers.length; j++) {
        if (characterDistance[i][j] === 1) {
          break;
        } else if (characterDistance[i][j] === -1) {
          quarry[i].distance = 0;
          quarry[i].active = false;
          messages += `<h4><b>${quarry[i].name}</b> escapes.</h4>`;
          break;
        }
      }
    }

    // Lost track
    for (let i = 0; i < pursuers.length; i++) {
      let isLost = true;
      for (let j = 0; j < quarry.length; j++) {
        if (characterDistance[j][i] !== 0) {
          isLost = false;
          break;
        }
      }
      if (isLost) {
        pursuers[i].distance = 0;
        pursuers[i].active = false;
        messages += `<h4><b>${pursuers[i].name}</b> lost sight with rest of Pursuit.</h4>`;
      }
    }

    return messages;
  }

  getChatPursuitTests() {
    const characters = this.getCharacters();
    const slowestCharacter = characters.reduce((a, b) => (a.move < b.move ? a : b)).move;
    let pursuitTests = "";
    characters.forEach((character) => {
      pursuitTests += `<h4><b>${character.name}</b> rolls with +${character.move - slowestCharacter} SL.</h4>`;
    });
    return pursuitTests;
  }

  // -------------//

  getActive() {
    return this.objectsInPursuit.filter((o) => o.active);
  }

  getInactive() {
    return this.objectsInPursuit.filter((o) => !o.active);
  }

  getCharacters() {
    return this.objectsInPursuit.filter((o) => o.type === "character" && o.active);
  }

  getObstacles() {
    return this.objectsInPursuit.filter((o) => o.type === "obstacle" && o.active);
  }

  getQuarry() {
    return this.getCharacters().filter((o) => o.quarry);
  }

  getPursuers() {
    return this.getCharacters().filter((o) => !o.quarry);
  }

  // -------------//

  renderCreatePursuitDialog() {
    let content = `<form>
      ${this.initialDialogHeader}
      <h2 style="${this.MAIN_STYLE}">
        <b>Choose Quarry and Initial Distance</b>
      </h2>
      <div class="form-group">
        <span style="flex: 2;${this.MAIN_STYLE}">In Pursuit</span>
        <span style="flex: 4;${this.MAIN_STYLE}">Name</span>
        <span style="flex: 1;${this.MAIN_STYLE}">Initial Distance</span>
        <span style="flex: 1;${this.MAIN_STYLE}">Quarry</span>
      </div>`;
    this.getCharacters().forEach((character) => {
      content += `
        <div class="form-group">
          <div style="flex: 2;${this.MAIN_STYLE}">
            <input name="active" style="text-align: center" type="checkbox" ${character.active ? "checked" : ""}>
          </div>
          <span style="flex: 4;${this.MAIN_STYLE}">
            ${character.actor ? "<i class='fas fa-user'></i> " : ""}${character.name}
          </span>
          <span style="flex: 1;${this.MAIN_STYLE}">
            <input name="distance" type="number" value="${character.distance}" min="0" step="1">
          </span>
          <div style="flex: 1;${this.MAIN_STYLE}">
            <input name="quarry" style="text-align: center" type="checkbox" ${character.quarry ? "checked" : ""}>
          </div>
        </div>`;
    });
    content += `
      ${this.initialDialogFooter}
    </form>`;

    new Dialog(
      {
        title: "Pursuit",
        content,
        buttons: {
          yes: {
            icon: "<i class='fas fa-check'></i>",
            label: "Start",
            callback: async (html) => {
              this.processCreatePursuitDialog(html);
              if (this.getQuarry().length) {
                await this.nextTurn();
              }
            }
          },
          addActor: {
            icon: "<i class='fas fa-user'></i>",
            label: "Add Actor",
            callback: (html) => {
              this.processCreatePursuitDialog(html);
              this.renderAddActorDialog(this.renderCreatePursuitDialog);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: "Cancel"
          }
        },
        default: "yes"
      },
      {width: this.DIALOG_WIDTH}
    ).render(true);
  }

  processCreatePursuitDialog(html) {
    const characters = this.getCharacters();
    const form = new FormDataExtended(html[0].querySelector("form")).object;
    for (let i = 0; i < characters.length; i++) {
      characters[i].active = form.active[i];
      characters[i].distance = form.quarry[i] ? Math.max(form.distance[i], 1) : form.distance[i];
      characters[i].quarry = form.quarry[i];
    }
    this.objectsInPursuit = this.objectsInPursuit.filter((o) => o.active);
  }

  renderNextTurnDialog() {
    let content = `
      <form>
        <div class="form-group">
          <span style="flex: 1;${this.MAIN_STYLE}">In Pursuit?</span>
          <span style="flex: 1;${this.MAIN_STYLE}">Quarry</span>
          <span style="flex: 3;${this.MAIN_STYLE}">Name</span>
          <span style="flex: 1;${this.MAIN_STYLE}">Move</span>
          <span style="flex: 1;${this.MAIN_STYLE}">Test SLs</span>
          <span style="flex: 1;${this.MAIN_STYLE}">Distance</span>
        </div>`;
    this.getActive().forEach((character) => {
      content += this.getNextTurnRow(character);
    });
    const inactiveObjects = this.getInactive();
    if (inactiveObjects.length) {
      content += '<p style="text-align: center;font-variant: small-caps;font-weight: bold;">Inactive</p>';
      inactiveObjects.forEach((character) => {
        content += this.getNextTurnRow(character);
      });
    }
    content += `</form>${this.nextTurnFooter}`;

    new Dialog(
      {
        title: `Pursuit: Turn ${this.turn}`,
        content,
        buttons: {
          nextTurn: {
            icon: "<i class='fas fa-check'></i>",
            label: "Next Turn",
            callback: async (html) => {
              this.processNextTurnDialog(html);
              await this.nextTurn();
            }
          },
          addActor: {
            icon: "<i class='fas fa-user'></i>",
            label: "Add Actor",
            callback: async (html) => {
              this.processNextTurnDialog(html);
              this.renderAddActorDialog(this.renderNextTurnDialog);
            }
          },
          addObstacle: {
            icon: "<i class='fas fa-mountains'></i>",
            label: "Add Obstacle",
            callback: (html) => {
              this.processNextTurnDialog(html);
              this.renderAddObstacle(this.renderNextTurnDialog);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: "Cancel"
          }
        },
        default: "nextTurn"
      },
      {width: this.DIALOG_WIDTH + 150}
    ).render(true);
  }

  getNextTurnRow(object) {
    if (object.type === "character") {
      return `
        <div class="form-group"">
          <div style="flex: 1;${this.MAIN_STYLE}">
            <input tabindex="-1" name="active" type="checkbox" ${object.active ? "checked" : ""}>
          </div>
          <div style="flex: 1;${this.MAIN_STYLE}">
            ${object.quarry ? "<i class='fa-solid fa-check'></i>" : ""}
          </div>
          <span style="flex: 3;${this.MAIN_STYLE}">
            ${object.actor ? "<i class='fas fa-user'></i> " : ""}${object.name}
          </span>
          <span style="flex: 1;${this.MAIN_STYLE}">
            ${this.getCharacterMoveFormatted(object)}
          </span>
          <span style="flex: 1;${this.MAIN_STYLE}">
            <input name="SL" type="number" value="${object.testSL}" step="1">
          </span>
          <span style="flex: 1;${this.MAIN_STYLE}">
            <input tabindex="-1" name="distance" type="number" value="${object.distance}" min="0" step="1">
          </span>
        </div>`;
    } else {
      return `
      <div class="form-group"">
        <div style="flex: 1;${this.MAIN_STYLE}">
          <input tabindex="-1" name="active" type="checkbox" ${object.active ? "checked" : ""}>
        </div>
        <p style="flex: 6;${this.MAIN_STYLE}" 
        title="Perceived: ${object.perceived}&#10;Test: ${this.getObstacleNavigateTest(
          object
        )}&#10;Consequences: ${object.consequences}">
          <i class='fas fa-road-barrier'></i> ${object.name}
        </p>
        <input name="SL" type="hidden" value="${object.testSL}" step="1">
        <span style="flex: 1;${this.MAIN_STYLE}">
          <input tabindex="-1" name="distance" type="number" value="${object.distance}" min="0" step="1">
        </span>
      </div>`;
    }
  }

  processNextTurnDialog(html) {
    const form = new FormDataExtended(html[0].querySelector("form")).object;
    const active = this.getActive();
    for (let i = 0; i < active.length; i++) {
      const object = active[i];
      object.active = form.active[i];
      object.distance = Number(form.distance[i]);
      object.testSL = Number(form.SL[i]);
    }

    // Limit distance if pursuer run past query
    const maxQueryDistance = this.getQuarry().reduce((a, b) => (a.distance > b.distance ? a : b)).distance;
    for (const pursuer of this.getPursuers()) {
      pursuer.distance = pursuer.distance > maxQueryDistance ? maxQueryDistance : pursuer.distance;
    }
  }

  renderAddActorDialog(backFunc) {
    const content = `
      <form>
        <h2 style="${this.MAIN_STYLE}">
          <b>Insert Values or Select Actor's Token</b>
        </h2>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">Name</span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">
            <input name="name" type="text">
          </span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">Move</span>
          <span style="${this.MAIN_STYLE}">Run</span>
          <span style="${this.MAIN_STYLE}">Flee!</span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">
            <input name="move" type="number" min="0" step="1">
          </span>
          <span style="${this.MAIN_STYLE}">
            <input name="run" type="number" min="0" step="1">
          </span>
          <div style="${this.MAIN_STYLE}">
            <input name="flee" type="checkbox">
          </div>
        </div>
      </form>`;

    new Dialog(
      {
        title: "Add Actor",
        content,
        buttons: {
          add: {
            icon: "<i class='fas fa-check'></i>",
            label: "Add",
            callback: (html) => {
              this.processAddActorDialog(html);
              this.objectsInPursuit = this.sortObjects(this.objectsInPursuit);
              backFunc.call(this);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: "Cancel",
            callback: () => backFunc.call(this)
          }
        },
        default: "add"
      },
      {width: this.DIALOG_WIDTH}
    ).render(true);
  }

  processAddActorDialog(html) {
    const form = new FormDataExtended(html[0].querySelector("form")).object;
    if (form.name !== "" && form.move !== null && form.run !== null) {
      this.objectsInPursuit.push({
        active: true,
        name: form.name,
        move: form.move,
        run: form.run,
        type: "character",
        testSL: 0,
        distance: 0,
        quarry: false
      });
    } else if (canvas.tokens.controlled.length > 0) {
      canvas.tokens.controlled.forEach((t) => this.objectsInPursuit.push(this.getPursuitObjectFromActor(t.actor)));
    } else {
      return ui.notifications.error("Insert correct values or select Actor's Token");
    }
  }

  renderAddObstacle(backFunc) {
    let content = `
      <form>
        <h2 style="${this.MAIN_STYLE}">
          <b>Create Obstacle</b>
        </h2>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">Name</span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">
            <input name="name" type="text">
          </span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">Perceived Test</span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">
            <input name="name" type="text">
          </span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">Test to Navigate</span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">
            <input name="name" type="text">
          </span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">Consequences</span>
        </div>
        <div class="form-group">
          <span style="${this.MAIN_STYLE}">
            <input name="name" type="text">
          </span>
        </div>
        <h2 style="${this.MAIN_STYLE}">
          <b>Select Obstacle From Presets</b>
        </h2>
        <div class="form-group">
          <select style="text-align: center" id="preset" name="preset">
            <option value="" selected></option>`;
    for (const [key, value] of Object.entries(PRESET_OBSTACLES)) {
      content += `
        <option value="${key}" title="Perceived: ${value.perceived}&#10;Test: ${this.getObstacleNavigateTest(
          value
        )}&#10;Consequences: ${value.consequences}">
          ${value.name}
        </option>`;
    }
    content += `
        </select>
      </div>
    </form>`;
    new Dialog(
      {
        title: "New Obstacle",
        content,
        buttons: {
          yes: {
            icon: "<i class='fas fa-check'></i>",
            label: "Add",
            callback: (html) => {
              this.processAddObstacleDialog(html);
              this.objectsInPursuit = this.sortObjects(this.objectsInPursuit);
              backFunc.call(this);
            }
          },
          cancel: {
            icon: "<i class='fas fa-times'></i>",
            label: "Cancel",
            callback: () => backFunc.call(this)
          }
        },
        default: "yes"
      },
      {width: this.DIALOG_WIDTH}
    ).render(true);
  }

  processAddObstacleDialog(html) {
    const form = new FormDataExtended(html[0].querySelector("form")).object;
    if (form.preset) {
      const obstacle = PRESET_OBSTACLES[form.preset];
      this.objectsInPursuit.push({
        ...obstacle,
        active: true,
        move: 0,
        run: 0,
        type: "obstacle",
        testSL: 0,
        distance: this.getQuarry().reduce((a, b) => (a.distance > b.distance ? a : b)).distance,
        quarry: false
      });
    }
  }

  // -------------//

  async nextTurn() {
    this.turn += 1;

    await this.calculateDistanceMoved();
    this.objectsInPursuit = this.sortObjects(this.objectsInPursuit);

    const lostCharactersMsg = this.getChatLostCharacters();
    this.normaliseDistance();

    // Create chat message
    let content = `<h1 style="text-align: center">Pursuit: Turn ${this.turn}</h1>`;
    content += this.getChatTable();
    content += lostCharactersMsg;

    // Check end
    if (this.getQuarry().length !== 0 && this.getPursuers().length !== 0) {
      content += "<h2 style='text-align: center'>Pursuit Tests</h2>";
      content += this.getChatPursuitTests();
      this.renderNextTurnDialog();
    }
    if (this.POST_TO_CHAT) {
      await ChatMessage.create({content});
    }
  }

  async calculateDistanceMoved() {
    const characters = this.getCharacters();
    for (const character of characters) {
      character.distanceMoved = this.getDistanceMoved(character);
      character.distance += character.distanceMoved;
      character.testSL = this.getDefaultTestSL();
    }

    // Catching Quarry
    const maxQuarryDistance = this.getQuarry().reduce((a, b) => (a.distance > b.distance ? a : b)).distance;
    for (const pursuer of this.getPursuers()) {
      for (const quarry of this.getQuarry()) {
        if (
          pursuer.distance > quarry.distance &&
          pursuer.distance - pursuer.distanceMoved <= quarry.distance - quarry.distanceMoved
        ) {
          if (
            maxQuarryDistance === quarry.distance ||
            (await PursuitDialogHelper.createPursuitDialogFormatted({
              title: `${pursuer.name} can caught ${quarry.name}`,
              content: "Do you want to charge into combat, or run past and pursue another quarry?",
              buttons: {
                yes: {
                  label: "Charge into Combat",
                  callback: () => true
                },
                no: {
                  label: "Continue Pursuit",
                  callback: () => false
                }
              },
              defaultButton: "yes"
            }))
          ) {
            pursuer.distance = quarry.distance;
          }
        }
      }
    }

    // Encountering Obstacles
    for (const obstacle of this.getObstacles().reverse()) {
      for (const character of this.getCharacters().reverse()) {
        if (
          character.distance > obstacle.distance &&
          character.distance - character.distanceMoved <= obstacle.distance
        ) {
          const content =
            obstacle.perceived === "Automatically"
              ? `
            <h3 style="${this.MAIN_STYLE}">Navigate Test</h3>
            <div class="delete-item-dialog selection">
              <label>${obstacle.navigatePerceived}</label>
            </div>
            <h3 style="${this.MAIN_STYLE}">Consequences</h3>
            <div class="delete-item-dialog selection">
              <label>${obstacle.consequences}</label>
            </div>
          `
              : `
            <h3 style="${this.MAIN_STYLE}">Perceive Test</h3>
            <div class="delete-item-dialog selection">
              <label>${obstacle.perceived}</label>
            </div>
            <h3 style="${this.MAIN_STYLE}">Navigate Test</h3>
            <div class="delete-item-dialog selection">
              <label>${obstacle.navigatePerceived}/${obstacle.navigateNotPerceived}</label>
            </div>
            <h3 style="${this.MAIN_STYLE}">Consequences</h3>
            <div class="delete-item-dialog selection">
              <label>${obstacle.consequences}</label>
            </div>
          `;
          const result = await PursuitDialogHelper.createPursuitDialog(
            {
              title: `${character.name} encounters ${obstacle.name}`,
              content,
              buttons: {
                tackle: {
                  label: "Tackle Obstacle",
                  callback: () => 0
                },
                fail: {
                  label: "Suffer Consequences",
                  callback: () => 1
                },
                stop: {
                  label: "Stop before Obstacle",
                  callback: () => 2
                }
              },
              defaultButton: "tackle"
            },
            {width: this.DIALOG_WIDTH + 50}
          );
          if ((result === 1 && obstacle.stopping === true) || result === 2) {
            character.distance = obstacle.distance;
          }
        }
      }
    }
  }

  normaliseDistance() {
    const characters = this.getCharacters();
    const minDistance = characters.reduce((a, b) => (a.distance < b.distance ? a : b)).distance;
    for (const object of this.getActive()) {
      object.distance -= minDistance;
      if (object.type === "obstacle" && object.distance < 0) {
        object.active = false;
      }
    }

    // Remove inactive obstacles
    this.objectsInPursuit = this.objectsInPursuit.filter((o) => o.type !== "obstacle" || o.active);
  }
}

class ComplexPursuit extends SimplePursuit {
  constructor() {
    super();
    this.initialDialogHeader = `<h2 style="${this.MAIN_STYLE}"><b>Environment</b></h2>
      <div class="form-group flexcol">
        <select style="text-align: center" id="maxDistance" name="maxDistance">
          <option value="3">Busy city streets, labyrinthine sewers, hedge maze (3)</option>
          <option value="5">Craggy mountains, dense woodland, foggy fenland (5)</option>
          <option value="7">Sleepy village, light woodland, swamp (7)</option>
          <option value="10" selected>Shrubby meadow, gently rolling hills, rocky beach (10)</option>
          <option value="13">Featureless desert, grassy steppe, limestone pavement (13)</option>
        </select>
      </div>`;
    this.initialDialogFooter = `<h2 style="${this.MAIN_STYLE}"><b>Escaping from combat</b></h2>
      <h4><b>Advantage: </b>1 Distance, 3 Distance if spent 3 or more Advantage.</h4>
      <h4><b>Dodge: </b>1 Distance.</h4>
      <h4><b>Fleeing: </b>Free Pursuit Test, +2 SL if opponent attacks.</h4>`;
    this.nextTurnFooter = `
      <h2 style="${this.MAIN_STYLE}"><b>Distance Update Rules</b></h2>
      <div style="text-align: center">
        <h4><b>Roll Pursuit Test:</b></h4>
        <h4><b>4 SL or more: </b>Distance Moved = (Run / 10) + 1</h4>
        <h4><b>0 to 3 SL: </b>Distance Moved = (Run / 10)</h4>
        <h4><b>-2 to -1 SL: </b>Distance Moved = (Run / 10) - 1</h4>
        <h4><b>-3 to -4 SL: </b>Distance Moved = 0</h4>
        <h4><b>-5 SL or less: </b>Gain Prone Condition</h4>
      </div>`;
  }

  // -------------//

  getCharacterMoveFormatted(character) {
    return `${character.move} (${character.run})`;
  }

  getDistanceMoved(character) {
    if (character.testSL >= 4) {
      return Math.max(Math.floor(character.run / 10), 1) + 1;
    } else if (character.testSL >= 0) {
      return Math.max(Math.floor(character.run / 10), 1);
    } else if (character.testSL >= -2) {
      return Math.max(Math.floor(character.run / 10), 1) - 1;
    } else {
      return 0;
    }
  }

  getDefaultTestSL() {
    return -4;
  }

  // -------------//

  getChatPursuitTests() {
    return this.getCharacters()
      .map((character) => {
        let content = `<h4><b>${character.name}</b> rolls with `;
        switch (character.move) {
          case 1:
            content += "-30 modifier.</h4>";
            break;
          case 2:
            content += "-20 modifier.</h4>.";
            break;
          case 3:
            content += "+0 modifier.</h4>";
            break;
          default:
            content += "+20 modifier.</h4>";
            break;
        }
        return content;
      })
      .join("");
  }

  // -------------//

  processCreatePursuitDialog(html) {
    super.processCreatePursuitDialog(html);

    const form = new FormDataExtended(html[0].querySelector("form")).object;
    this.maxDistance = form.maxDistance;
  }
}

class PursuitDialogHelper extends Dialog {
  static async createPursuitDialog({title, content, buttons, defaultButton}, options = {}) {
    return this.wait(
      {
        title,
        content,
        focus: true,
        default: defaultButton,
        buttons
      },
      options
    );
  }

  static createPursuitDialogFormatted({title, content, buttons, defaultButton}, options = {}) {
    return this.createPursuitDialog(
      {
        title,
        content: `
        <div class="delete-item-dialog selection">
          <label>${content}</label>
        </div>`,
        focus: true,
        default: defaultButton,
        buttons
      },
      options
    );
  }
}

// Main code
PursuitDialogHelper.createPursuitDialogFormatted({
  title: "Choose Pursuit Mode",
  content: "Choose in which mode you want to run this tool.",
  buttons: {
    yes: {
      label: "Simple (Core)",
      callback: () => new SimplePursuit().renderCreatePursuitDialog()
    },
    no: {
      label: "Complex (UiA)",
      callback: () => new ComplexPursuit().renderCreatePursuitDialog()
    }
  },
  defaultButton: "yes"
});
