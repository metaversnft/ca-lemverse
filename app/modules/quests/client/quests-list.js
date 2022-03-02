const sortFilters = { completed: 1, createdAt: -1 };

const closeInterface = () => Session.set('quests', undefined);

const onKeyPressed = e => {
  if (e.key === 'Escape') closeInterface();
};

const toggleQuestState = questId => {
  if (!questId) throw new Error(`questId is missing`);

  const newQuestState = !Quests.findOne(questId).completed;
  Quests.update(questId, { $set: { completed: newQuestState } });

  const message = `${!newQuestState ? 'reopened' : 'closed'} the quest`;
  messagesModule.sendMessage(questId, message);
};

const selectQuest = (questId, template) => {
  template.selectedQuest.set(questId);
  messagesModule.changeMessagesChannel(questId);

  // mark linked notification as read
  const notification = Notifications.findOne({ questId, userId: Meteor.userId() });
  if (notification && !notification.read) Notifications.update(notification._id, { $set: { read: true } });
};

const autoSelectQuest = template => {
  const questId = Session.get('quests')?.questId || '';
  if (questId.includes('qst_')) selectQuest(questId, template);
  else {
    const firstQuest = Quests.findOne({}, { sort: sortFilters, limit: 1 });
    if (firstQuest) selectQuest(firstQuest._id, template);
  }
};

const draftQuestId = () => {
  const questId = Session.get('quests')?.questId;
  if (!questId) return undefined;

  const isNewQuest = !Quests.findOne(questId);
  if (!isNewQuest) return undefined;

  return questId;
};

const beforeSendingMessage = e => {
  const { channel } = e.detail;
  if (!channel.includes('qst_')) return;

  const quest = Quests.findOne(channel);
  if (quest) return;

  Quests.insert({
    _id: channel,
    origin: Session.get('quests').origin,
    targets: Session.get('quests').targets || [],
    createdAt: new Date(),
    createdBy: Meteor.userId(),
  });
};

Template.questsList.events({
  'click .js-quest'(e, template) {
    e.preventDefault();
    e.stopPropagation();
    selectQuest(e.currentTarget.dataset.questId, template);
  },
  'click .js-toggle-state'(e, template) {
    e.preventDefault();
    e.stopPropagation();
    toggleQuestState(template.selectedQuest.get());
  },
});

Template.questsList.onCreated(function () {
  Session.set('quests', undefined);
  this.selectedQuest = new ReactiveVar(undefined);

  this.autorun(() => {
    if (!Session.get('quests')) return;

    Tracker.nonreactive(() => {
      Session.set('console', true);
      this.subscribe('quests', () => {
        const quests = Quests.find().fetch();
        const userIds = quests.flatMap(quest => [quest.createdBy, ...(quest.targets || [])]).filter(Boolean);
        if (userIds?.length) this.subscribe('usernames', [...new Set(userIds)]);

        autoSelectQuest(this);
      });
    });
  });

  document.addEventListener('keydown', onKeyPressed);
  window.addEventListener(eventTypes.beforeSendingMessage, beforeSendingMessage);
});

Template.questsList.onDestroyed(() => {
  Session.set('quests', undefined);
  document.removeEventListener('keydown', onKeyPressed);
  window.removeEventListener(eventTypes.beforeSendingMessage, beforeSendingMessage);
});

Template.questsList.helpers({
  show() { return Session.get('quests'); },
  quests() { return Quests.find({}, { sort: sortFilters }).fetch(); },
  title(quest) {
    const isEntityOrigin = quest.origin.includes('ent_');
    if (quest.createdBy !== Meteor.userId()) {
      if (isEntityOrigin) return 'Entity';
      else return Meteor.users.findOne(quest.createdBy)?.profile.name || '[deleted]';
    }

    if (isEntityOrigin) return '> Entity';
    else if (quest.targets?.length === 1) return `> ${Meteor.users.findOne(quest.targets[0])?.profile.name || '[deleted]'}`;
    else return `> ${quest.targets.length} users`;
  },
  isQuestSelected(id) { return Template.instance().selectedQuest.get() === id; },
  newQuest() {
    const questId = draftQuestId();
    if (!questId) return undefined;

    const { targets, origin } = Session.get('quests');
    if (!targets || targets.length === 0) return Entities.findOne(origin)?.name || 'Entity';

    if (!targets.length) return undefined;

    const userId = targets[0];
    if (!userId?.includes('usr_')) return undefined;

    return Meteor.users.findOne(userId)?.profile.name || 'New quest';
  },
  draftQuestId() { return draftQuestId(); },
});
