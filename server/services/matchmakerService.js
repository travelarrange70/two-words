/**
 * matchmakerService.js - Two Words Proximity & Matchmaker Service
 */
const chatMessages = [];
const ambitionsStore = [];

function getChatMessages() {
  return chatMessages;
}

function addChatMessage(msg) {
  const item = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2,6),
    sender: msg.sender || 'Anonymous',
    text: msg.text || '',
    timestamp: new Date().toISOString()
  };
  chatMessages.push(item);
  if (chatMessages.length > 200) chatMessages.shift();
  return item;
}

function getAmbitions() {
  return ambitionsStore;
}

function addAmbition(ambition) {
  ambitionsStore.push({ ...ambition, createdAt: new Date().toISOString() });
  return ambition;
}

module.exports = {
  getChatMessages,
  addChatMessage,
  getAmbitions,
  addAmbition
};