Meteor.publish('quests', function () {
  if (!this.userId) return undefined;

  const { entitySubscriptionIds } = Meteor.user();
  return Quests.find(
    {
      $or: [
        { origin: { $in: entitySubscriptionIds } },
        { targets: this.userId },
        { createdBy: Meteor.userId() },
      ],
    },
    { sort: { completed: 1, createdAt: 1 } },
  );
});
