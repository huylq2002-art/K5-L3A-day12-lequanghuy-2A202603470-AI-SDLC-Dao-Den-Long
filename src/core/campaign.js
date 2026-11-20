import { createGame } from './game.js';

export function createCampaign(seed) {
  return { seed, night: 1, total: 0, game: null, lastCreditedNight: 0 };
}

export function startNight(campaign) {
  campaign.game = createGame(campaign.seed, {}, campaign.night);
  return campaign.game;
}

export function recordResult(campaign) {
  if (campaign.game?.state === 'won' && campaign.lastCreditedNight < campaign.night) {
    campaign.lastCreditedNight = campaign.night;
    campaign.total += campaign.game.score;
  }
}

export function advanceNight(campaign) {
  if (campaign.game?.state !== 'won' || campaign.night === 3) return false;
  recordResult(campaign);
  campaign.night++;
  campaign.game = null;
  return true;
}
