import fs from 'fs';
import path from 'path';

export const events = fs.readFileSync(path.join(__dirname, 'events.gql'), 'utf8');
export const eventsInRange = fs.readFileSync(path.join(__dirname, 'eventsInRange.gql'), 'utf8');
export const producer = fs.readFileSync(path.join(__dirname, 'producer.gql'), 'utf8');
export const producerSet = fs.readFileSync(path.join(__dirname, 'producerSet.gql'), 'utf8');
export const producerSetChange = fs.readFileSync(path.join(__dirname, 'producerSetChange.gql'), 'utf8');
export const producerRewardCollectorChange = fs.readFileSync(path.join(__dirname, 'producerRewardCollectorChange.gql'), 'utf8');
export const rewardScheduleEntry = fs.readFileSync(path.join(__dirname, 'rewardScheduleEntry.gql'), 'utf8');
export const rewardSchedule = fs.readFileSync(path.join(__dirname, 'rewardSchedule.gql'), 'utf8');
export const producerEpoch = fs.readFileSync(path.join(__dirname, 'producerEpoch.gql'), 'utf8');
export const epoch = fs.readFileSync(path.join(__dirname, 'epoch.gql'), 'utf8');
export const slotClaim = fs.readFileSync(path.join(__dirname, 'slotClaim.gql'), 'utf8');
export const slot = fs.readFileSync(path.join(__dirname, 'slot.gql'), 'utf8');
export const staker = fs.readFileSync(path.join(__dirname, 'staker.gql'), 'utf8');
export const network = fs.readFileSync(path.join(__dirname, 'network.gql'), 'utf8');
export const distributor = fs.readFileSync(path.join(__dirname, 'distributor.gql'), 'utf8');
export const distribution = fs.readFileSync(path.join(__dirname, 'distribution.gql'), 'utf8');
export const claim = fs.readFileSync(path.join(__dirname, 'claim.gql'), 'utf8');
export const slash = fs.readFileSync(path.join(__dirname, 'slash.gql'), 'utf8');
export const account = fs.readFileSync(path.join(__dirname, 'account.gql'), 'utf8');
export const getStateByCID = fs.readFileSync(path.join(__dirname, 'getStateByCID.gql'), 'utf8');
export const getState = fs.readFileSync(path.join(__dirname, 'getState.gql'), 'utf8');
