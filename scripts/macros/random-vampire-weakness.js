/* ==========
* MACRO: Random Vampire Weakness
* AUTHORS: @Reppumaru, @Robak132, @Tyka_f4ft
* DESCRIPTION: Generate random weakness for Vampires.
========== */

const WEAKNESS = [
  {
    min: 1,
    result: {
      value: "Barriers",
      description:
        "This Vampire cannot enter any other structure not owned by him unless he is first invited. Once the Vampire is invited, he may enter and exit freely. The Necrarchs typically have this vulnerability."
    }
  },
  {
    min: 6,
    result: {
      value: "Counting",
      description:
        "These Vampires have a curious obsession with counting. Whenever confronted with a number of small objects, such as poppy seeds, coins, or pieces of string, the Vampire must succeed on a Hard (–20) Cool Test or count the objects — an act that usually takes 1d10 minutes. If the Vampire succeeds on the test, he takes a –20 penalty to all tests whilst the uncounted objects remain in view."
    }
  },
  {
    min: 11,
    result: {
      value: "Daemonsroot and Witchbane",
      description:
        "Some Vampires are repelled by Daemonsroot and Witchbane. Vampires with this vulnerability must succeed on a psychology Fear (1) test originating from the plant or its holder."
    }
  },
  {
    min: 21,
    result: {
      value: "Fire",
      description:
        "A few Vampires are vulnerable to purifying flame. These Vampires cannot use their Toughness Bonus to reduce damage from fire (magical or otherwise)."
    }
  },
  {
    min: 26,
    result: {
      value: "Garlic",
      description:
        "Many Vampires have an unusual weakness for rare roots and plants, as can be see with Daemonsroot and Witchbane. A few are saddled with vulnerabilities to more common plants such as garlic. Such Vampires treat those plants as having Distracting Trait with AoE of 6 yards"
    }
  },
  {
    min: 31,
    result: {
      value: "Gromril",
      description:
        "The touch of Dwarfen Gromril is anathema to some Vampires. Whenever such Vampires are injured by Gromril weapons, they may not use their Toughness Bonus to reduce the damage."
    }
  },
  {
    min: 36,
    result: {
      value: "Ithilmar",
      description:
        "The silvery steel of the Elves is said to hold uncanny magical power. Whilst much of this material is used for armour and decorative items, the Elves are famed for their potent weapons wrought from this ore. Should the Vampire lose at least 1 Wound from an attack made with a weapon forged from Ithilmar, the Vampire must succeed on a Challenging (–20) Dodge Test or gain a number of Ablaze Conditions equal to Dodge test negative SL with a minimum of 1 Ablaze Condition."
    }
  },
  {
    min: 41,
    result: {
      value: "No Relfection",
      description:
        "Many Vampires are cursed, so they can never behold their visage in the surface of a mirror or in a shadow cast by the moonlight. Mirrors or other reflective surfaces do not show the appearance of these Vampires."
    }
  },
  {
    min: 51,
    result: {
      value: "Religious Symbols",
      description:
        "The power of belief is quite strong in the Old World, and mortals who present icons and symbols of their Gods can sometimes repel Vampires. A Vampire that is vulnerable to such items must succeed on a Psychology test to ignore Fear (3) trait of such Holy Symbol. As well a temple or grasping a religious icon is are treated as having Terror (1) / Fear (4). The GM may modify this test depending on the strength of faith of the temples believers or the icons wielder."
    }
  },
  {
    min: 56,
    result: {
      value: "Sawdust",
      description:
        "A few Vampires can be repelled by the accoutrements of those who handle corpses, such as sawdust, holly water or embalming fluid. A Vampire with this vulnerability must make a Psychology Terror (2) against this item when he comes in contact with these substances."
    }
  },
  {
    min: 61,
    result: {
      value: "Silver",
      description:
        "The mere touch of silver burns the flesh of Vampires with this weakness. If the Vampire loses at least 1 Wound from a silvered weapon, he additionally suffers 5 Wounds ignoring Armour and Toughness."
    }
  },
  {
    min: 66,
    result: {
      value: "Stakes",
      description:
        "Plunging a stake through the heart of any creature is traumatic enough, but when used against Vampires with this weakness, any attack with a stake is enough to drive these creatures away. The stake must be fashioned from a special wood, such as ash, hawthorn, or rosewood. If the Vampire is struck by such a stake and takes at least 1 Wound, the Vampire suffers 3 Entangle Conditions, cant speak and its Regenerate trait is suspended, until the stake is removed (a free action)."
    }
  },
  {
    min: 71,
    result: {
      value: "Sunlight",
      description:
        "A Vampire in direct sunlight halves all characteristics (rounded down) and suffers 1 Wound per minute of exposure, regardless of Toughness Bonus or armour. If a Vampire is reduced to 0 Wounds in this way, use the Sudden Death rules. (WFRP.173) This penalty does not occur if the day is significantly overcast (80% or more cloud cover), but a Vampire walking outside on such a day must roll 1d10 every hour. On a roll of 3 or lower, the sky clears enough to cause him damage. Each round a Vampire remains in direct sunlight, he must succeed on a Hard (-10) Endurance Test or gain ablaze condition."
    }
  },
  {
    min: 81,
    result: {
      value: "Taers",
      description:
        "A rare few Vampires cannot suffer the tears of a virtuous mortal, and therefore, they never feed on innocents, preferring instead to feed on the corrupt, the vicious, or criminal. These Vampires often pose a number of questions to their victims to assess the quality of their morals before attacking."
    }
  },
  {
    min: 86,
    result: {
      value: "Warpstone",
      description:
        "Warpstone is particularly loathsome to these Vampires. They cannot tolerate its presence, and if they come into contact with the substance, they experience dreadful changes. A Vampire must pass a Terror (2) test if it comes as close as 6 yards to warpstone. After each hour of contact, the Vampire must re-roll one of his Weaknesses and Optional Vampire Traits."
    }
  },
  {
    min: 91,
    result: {
      value: "Running Water",
      description:
        "Some Vampires are unable to cross running water, receiving grievous damage if they attempt it. For the purpose of this curse, the water must be at least a yard across, a foot deep, and have a current. Simply splashing a Vampire with water is not enough, nor is rain, or dumping a bucking of water on a Vampires head. Attempting to cross such a body of water deals 1d10 Wounds per round spent in or on the water, regardless of Toughness Bonus or armour. If the Vampire is reduced to 0 Wounds, use the Sudden Death rules. Flying, jumping, or riding or using a vehicle or vessel to cross negates these penalties, as does using a bridge."
    }
  }
];

async function submit(html) {
  const {weakness_val} = new FormDataExtended(html[0].querySelector("form")).object;

  const weaknesses = await game.robakMacros.utils.rollFromCodeObject({
    table: WEAKNESS,
    dice: "1d100",
    amount: weakness_val
  });
  let message = "<h1>Vampires Weaknesses</h1>";
  message += weaknesses
    .map((weakness, index) => `<p><b>Weakness ${index + 1}:</b> ${weakness.value}<br>${weakness.description}</p>`)
    .join("");
  ChatMessage.create({
    content: message,
    whisper: game.users.filter((u) => u.isGM).map((u) => u.id)
  });
}

new Dialog({
  title: "Random Vampire Weaknesses",
  content: `
    <form>
      <div class="form-group">
        <label>Weakness value:</label>
        <input style="text-align: center" id="weakness_val" name="weakness_val" value="5" />
    </form>
    `,
  buttons: {
    yes: {
      icon: "<i class='fas fa-check'></i>",
      label: "Submit",
      callback: async (html) => await submit(html)
    },
    no: {
      icon: "<i class='fas fa-times'></i>",
      label: "Cancel"
    }
  },
  default: "yes"
}).render(true);
