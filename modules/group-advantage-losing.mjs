export function handleLosingGroupAdvantage (combatants) {
  const DISPOSITION_LABELS = {
    "-1": game.i18n.localize("MACROS-AND-MORE.Enemies"),
    0: game.i18n.localize("MACROS-AND-MORE.Neutral"),
    1: game.i18n.localize("MACROS-AND-MORE.Allies")
  };

  const content = {};
  for (const combatant of combatants.filter((c) => c.actor.details.size)) {
    const disposition = combatant.token.disposition;
    const sizeValue = Math.pow(2, combatant.actor.sizeNum - 3);
    const drilled = combatant.actor.itemTypes.talent.some((t) => t.name === game.i18n.localize("NAME.Drilled"));
    const lst = content[disposition] ?? [];
    lst.push({
      name: combatant.name,
      size: sizeValue * (drilled ? 2 : 1),
      drilled,
      defeated: combatant.defeated
    });
    content[disposition] = lst;
  }
  let chatMsg = `<h1>${game.i18n.localize("MACROS-AND-MORE.LosingAdvantage")}</h1>`;
  for (let i = 1; i >= -1; i--) {
    if (content[i]) {
      chatMsg += `<h2>${DISPOSITION_LABELS[i]} [${content[i]
        .filter((a) => !a.defeated)
        .reduce((a, c) => a + c.size, 0)}]</h2>`;
      const sortedActors = content[i]
        .sort((a, b) => a.name.localeCompare(b.name, "pl"))
        .sort((a, b) => (a.size > b.size ? -1 : 1));
      for (const actor of sortedActors) {
        chatMsg += actor.defeated ? "<p><s>" : "<p>";
        chatMsg += `${actor.name} `;
        chatMsg += actor.drilled ? `<abbr title="${game.i18n.localize("NAME.Drilled")}">` : "";
        chatMsg += `[${actor.size}]`;
        chatMsg += actor.drilled ? "</abbr>" : "";
        chatMsg += actor.defeated ? "</s></p>" : "</p>";
      }
    }
  }
  ChatMessage.create({content: chatMsg});
}