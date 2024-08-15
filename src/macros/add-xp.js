/* ==========
* MACRO: Add XP
* AUTHOR: Robak132
* DESCRIPTION: Adds a set amount of XP to all or targeted player character(s). Adds half XP to companion(s). Modified macro from GM Toolkit by Jagusti.
========== */

const Utility = game.robakMacros.utils;
const ConfigurableDialog = game.robakMacros.configurableDialog;

function getCurrentDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = ("0" + (currentDate.getMonth() + 1)).slice(-2);
  const day = ("0" + currentDate.getDate()).slice(-2);
  return year + "-" + month + "-" + day;
}

function updateActorXP(pc, XP, reason) {
  const recipient = pc?.actor?.name || pc.name;
  const XPTotal = pc?.details?.experience?.total;
  const newXPTotal = Math.max(XPTotal + XP, 0);
  const XPCurrent = pc?.details?.experience?.current || 0;
  const newXPCurrent = Math.max(XPCurrent + XP, 0);

  pc?.actor ? pc.actor.awardExp(XP, reason) : pc.awardExp(XP, reason);

  return game.i18n.format("GMTOOLKIT.AddXP.Success", {
    recipient,
    XPTotal,
    newXPTotal,
    XPCurrent,
    newXPCurrent
  });
}

let characterActors = game.users.filter((u) => u.character).map((u) => u.character);
let otherActors = game.actors.filter((a) => a.hasPlayerOwner && a.type === "character" && !characterActors.includes(a));

const XP = Number(game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultAmount"));
let reason =
  game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultReason") !== "null"
    ? game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultReason")
    : "";
if (reason) {
  reason = game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultReason");
  const session = game.gmtoolkit.utility.getSession();
  reason = session.date ? reason.replace("(%date%)", `(${getCurrentDate()})`) : reason.replace(" (%date%)", "");
  reason = session.id !== "null" ? reason.replace("%session%", session.id) : (reason = reason.replace("%session%", ""));
}

const options = game.user.getFlag("world", "add-exp-options") ?? {};
let data = [
  [{value: "Players' Characters"}],
  ...game.users
    .filter((u) => u.character)
    .sort((a, b) => a.character.name.localeCompare(b.character.name))
    .map((u, i) => {
      return [
        {id: "charactersEnabled", type: "checkbox", value: options.charactersEnabled[i] !== 0},
        {value: `${u.character.name}<br>(${u.name})`},
        {
          id: "charactersMod",
          type: "select",
          style: "style='max-width: 40%'",
          selected: options.charactersMod[i] ?? 1,
          value: [
            {name: "Character (Full Exp)", value: 1},
            {name: "Companion (Half Exp)", value: 0.5}
          ]
        }
      ];
    })
];
if (otherActors.length) {
  data = data.concat([
    [{value: "Other Actors"}],
    ...otherActors
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a, i) => {
        return [
          {id: "othersEnabled", type: "checkbox", value: options.othersEnabled[i] !== 0},
          {value: a.name},
          {
            id: "othersMod",
            type: "select",
            style: "style='max-width: 40%'",
            selected: options.othersMod[i] ?? 0.5,
            value: [
              {name: "Companion (Half Exp)", value: 0.5},
              {name: "Character (Full Exp)", value: 1}
            ]
          }
        ];
      })
  ]);
}
data = data.concat([
  [{value: "Options"}],
  [
    {value: game.i18n.localize("GMTOOLKIT.Dialog.AddXP.Prompt")},
    {id: "xpNumber", type: "input", value: XP, inputType: "number"}
  ],
  [
    {value: game.i18n.localize("GMTOOLKIT.Dialog.AddXP.Reason")},
    {id: "xpReason", type: "input", value: reason, inputType: "text"}
  ]
]);

let result = await ConfigurableDialog.create({
  title: game.i18n.localize("GMTOOLKIT.Dialog.AddXP.Title"),
  data,
  options: {width: 450}
});
if (result) {
  await game.user.setFlag("world", "add-exp-options", result);
  let chatContent = characterActors.reduce((acc, actor, i) => {
    if (!result.charactersEnabled[i]) return acc;
    return acc + updateActorXP(actor, Utility.round(result.xpNumber * result.charactersMod[i], 0), result.xpReason);
  }, "");
  chatContent = otherActors.reduce((acc, actor, i) => {
    if (!result.othersEnabled[i]) return acc;
    return acc + updateActorXP(actor, Utility.round(result.xpNumber * result.othersMod[i], 0), result.xpReason);
  }, chatContent);

  const chatData = game.wfrp4e.utility.chatDataSetup(chatContent, "selfroll", false);
  chatData.flavor = game.i18n.format("GMTOOLKIT.AddXP.Flavor", {XP, reason});
  await ChatMessage.create(chatData, {});
}