if (!game.user.isUniqueGM) return;

effectsToCreate = [];
effectsToDelete = [];
for (let weapon of this.actor.itemTypes.weapon ?? []) {
  const effect = this.actor.effects.find((v) => v.name === weapon.name && v.description === `<p>${weapon.id}</p>`);
  if (weapon?.equipped?.value && effect === undefined) {
    effectsToCreate.push({
      name: weapon.name,
      description: `<p>${weapon.id}</p>`,
      icon: weapon.img,
      statuses: ["show-item"]
    });
  } else if (!weapon?.equipped?.value && effect !== undefined) {
    effectsToDelete.push(effect._id);
  }
}
await this.actor.createEmbeddedDocuments("ActiveEffect", effectsToCreate);
if (effectsToDelete.length) {
  await this.actor.deleteEmbeddedDocuments("ActiveEffect", effectsToDelete);
}
