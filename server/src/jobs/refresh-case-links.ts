/**
 * Replan case↔case links into day JSON and vault notes.
 * Does not open SQLite (safe while news-hub holds the database).
 */
import { refreshCaseLinks } from "../brain/files.js";

const summary = refreshCaseLinks();
console.log(JSON.stringify(summary, null, 2));
