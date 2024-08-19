if (!game.user.isUniqueGM) return;

effectsToCreate = [];
effectsToDelete = [];
for (let weapon of this.actor.itemTypes.weapon ?? []) {
  const effect = this.actor.effects.find((v) => v.name === weapon.name && v.description === `<p>${weapon.id}</p>`);
  if (weapon.equipped && effect === undefined) {
    effectsToCreate.push({
      name: weapon.name,
      description: `<p>${weapon.id}</p>`,
      icon: weapon.img,
      statuses: ["show-item"]
    });
  } else if (!weapon.equipped && effect !== undefined) {
    effectsToDelete.push(effect._id);
  }
}
this.actor.createEmbeddedDocuments("ActiveEffect", effectsToCreate);
if (effectsToDelete.length) {
  this.actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
}
