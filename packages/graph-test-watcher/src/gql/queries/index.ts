import fs from 'fs';
import path from 'path';

export const events = fs.readFileSync(path.join(__dirname, 'events.gql'), 'utf8');
export const eventsInRange = fs.readFileSync(path.join(__dirname, 'eventsInRange.gql'), 'utf8');
export const getMethod = fs.readFileSync(path.join(__dirname, 'getMethod.gql'), 'utf8');
export const _test = fs.readFileSync(path.join(__dirname, '_test.gql'), 'utf8');
