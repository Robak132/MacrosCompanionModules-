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

function updateActorXP(actor, XP, reason) {
  const recipient = actor.name;
  const XPTotal = actor?.details?.experience?.total;
  const newXPTotal = Math.max(XPTotal + XP, 0);
  const XPCurrent = actor?.details?.experience?.current || 0;
  const newXPCurrent = Math.max(XPCurrent + XP, 0);

  actor.system.awardExp(XP, reason);
  return game.i18n.format("GMTOOLKIT.AddXP.Success", {
    recipient,
    XPTotal,
    newXPTotal,
    XPCurrent,
    newXPCurrent
  });
}

const XP = Number(game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultAmount"));
const defaultReason = game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultReason");
let reason = defaultReason !== "null" ? defaultReason : "";
if (reason) {
  const session = game.gmtoolkit.utility.getSession();
  reason = game.settings.get("wfrp4e-gm-toolkit", "addXPDefaultReason");
  reason = session.date ? reason.replace("(%date%)", `(${getCurrentDate()})`) : reason.replace(" (%date%)", "");
  reason = session.id !== "null" ? reason.replace("%session%", session.id) : (reason = reason.replace("%session%", ""));
}

let characterActors = game.users
  .filter((u) => u.character)
  .map((u) => {
    return {user: u, character: u.character};
  })
  .sort((a, b) => a.character.name.localeCompare(b.character.name));

let otherActors = game.actors
  .filter((a) => a.hasPlayerOwner && a.type === "character" && !characterActors.find((ca) => ca.character === a))
  .map((a) => ({character: a}))
  .sort((a, b) => a.character.name.localeCompare(b.character.name));

const options = game.user.getFlag("world", "add-exp-options") ?? {};

if (canvas.tokens.controlled.length) {
  characterActors.forEach((u, i) => {
    options.charactersEnabled[i] = canvas.tokens.controlled.some((t) => t.actor._id === u.character._id) ? 1 : 0;
  });
  otherActors.forEach((u, i) => {
    options.othersEnabled[i] = canvas.tokens.controlled.some((t) => t.actor._id === u.character._id) ? 1 : 0;
  });
}

let data = [
  [{value: "Players' Characters"}],
  ...characterActors.map((u, i) => {
    return [
      {
        id: "charactersEnabled",
        type: "checkbox",
        value: options?.charactersEnabled?.[i] !== 0,
        style: "style='max-width: 10%'"
      },
      {value: `${u.character.name}<br>(${u.user.name})`, style: "style='max-width: 50%'"},
      {
        id: "charactersMod",
        type: "select",
        style: "style='max-width: 40%'",
        selected: options?.charactersMod?.[i] ?? 1,
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
    ...otherActors.map((a, i) => {
      return [
        {
          id: "othersEnabled",
          type: "checkbox",
          value: options?.othersEnabled?.[i] !== 0,
          style: "style='max-width: 10%'"
        },
        {value: a.character.name, style: "style='max-width: 50%'"},
        {
          id: "othersMod",
          type: "select",
          style: "style='max-width: 40%'",
          selected: options?.othersMod?.[i] ?? 0.5,
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
  options: {width: 450, forceList: ["charactersEnabled", "charactersMod", "othersEnabled", "othersMod"]}
});
if (result) {
  await game.user.setFlag("world", "add-exp-options", result);
  let chatContent = characterActors.reduce((acc, actor, i) => {
    if (!result.charactersEnabled[i]) return acc;
    let exp = Utility.round(result.xpNumber * result.charactersMod[i], 0);
    return acc + updateActorXP(actor.character, exp, result.xpReason);
  }, "");
  chatContent = otherActors.reduce((acc, actor, i) => {
    if (!result.othersEnabled[i]) return acc;
    let exp = Utility.round(result.xpNumber * result.othersMod[i], 0);
    return acc + updateActorXP(actor.character, exp, result.xpReason);
  }, chatContent);

  const chatData = game.wfrp4e.utility.chatDataSetup(chatContent, "selfroll", false);
  chatData.flavor = game.i18n.format("GMTOOLKIT.AddXP.Flavor", {XP: result.xpNumber, reason: result.xpReason});
  await ChatMessage.create(chatData, {});
}
