/* Store.js
 *
 * Handles storing the user dictionaries and indexes.
 *
 * When starting up, this will read indexes from both storage.sync and storage.local
 * and merge the results.
 */

var uDict, oDict;

async function loadUserDicts() {
  var syncStorage = await browser.storage.sync.get(["uDict", "oDict"]);
  var localStorage = await browser.storage.local.get(["uDict", "oDict"]);

  // Fetch user dictionary
  uDict = new Set();
  var uDictStorage = syncStorage["uDict"];
  if ($.isArray(uDictStorage) && uDictStorage.length > 0)
    uDict = new Set(uDictStorage);
  for (var l in localStorage["uDict"]) {
    uDict.add(l);
  }

  // Fetch unknown words dictionary
  oDict = new Set();
  var oDictStorage = syncStorage["oDict"];
  if ($.isArray(oDictStorage) && oDictStorage.length > 0)
    oDict = new Set(oDictStorage);
  for (var l in localStorage["oDict"]) {
    oDict.add(l);
  }
}

async function writeUDict() {
  await browser.storage.sync.set({"uDict": [...uDict]});
}
async function writeODict() {
  await browser.storage.sync.set({"oDict": [...oDict]});
}

