export const CYCLE_MS = 18_000; // default headline swap interval per tile
export const SWAP_MS = 340; // fade-out duration before content commits
export const REFRESH_MS = 5 * 60 * 1000; // poll the server every 5 minutes
export const STALE_MS = 15 * 60 * 1000; // "updated" dot turns yellow after this
export const PRELOAD_CAP_MS = 1500; // max wait for a photo before swapping anyway
export const FRESH_MS = 30 * 60 * 1000; // stories younger than this get a NEW badge
export const PALETTE = [
  '#4f8cff', '#3fc1a9', '#b07cf5', '#ff9a62', '#5cc8ff',
  '#f2c94c', '#f472b6', '#7ee787'
];
