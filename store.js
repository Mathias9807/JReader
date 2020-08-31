/* Store.js
 *
 * Handles storing the user dictionaries and indexes.
 *
 * When starting up, this will read indexes from both storage.sync and storage.local
 * and merge the results.
 */

var uDict, oDict, dayDict;

async function loadUserDicts() {
  // var syncStorage = await browser.storage.sync.get(["uDict", "oDict"]);
  var localStorage = await browser.storage.local.get(["uDict", "oDict",
      "dayDict", "dayDate"]);

  // Fetch user dictionary
  uDict = new Set();
  // var uDictStorage = syncStorage["uDict"];
  // if ($.isArray(uDictStorage) && uDictStorage.length > 0)
  //   uDict = new Set(uDictStorage);
  if ($.isArray(localStorage["uDict"]))
    uDict = new Set(localStorage["uDict"]);

  // Fetch unknown words dictionary
  oDict = new Set();
  // var oDictStorage = syncStorage["oDict"];
  // if ($.isArray(oDictStorage) && oDictStorage.length > 0)
  //   oDict = new Set(oDictStorage);
  if ($.isArray(localStorage["oDict"]))
    oDict = new Set(localStorage["oDict"]);

  // Fetch today's words dictionary
  dayDict = new Set();
  if ($.isArray(localStorage["dayDict"]))
    dayDict = new Set(localStorage["dayDict"]);

  await updateDayDict();
}

async function updateDayDict() {
  var localStorage = await browser.storage.local.get(["dayDict", "dayDate"]);

  // Check if it's been a new day, if so, set dayDict to uDict
  var lastDate = new Date(1970, 1, 0);
  if (localStorage["dayDate"])
    lastDate = new Date(JSON.parse(localStorage["dayDate"]));
  var now = new Date();
  if (10000*now.getFullYear() + 100*now.getMonth() + now.getDate() >
      10000*lastDate.getFullYear() + 100*lastDate.getMonth() + lastDate.getDate()) {

    console.log("New day, setting dayDict to uDict");
    dayDict = new Set([...uDict]);
    await writeDayDict();
  }else {
    console.log("Same day, fetching old dayDict");
    // Fetch today's words dictionary
    dayDict = new Set();
    if ($.isArray(localStorage["dayDict"]))
      dayDict = new Set(localStorage["dayDict"]);
  }

  await browser.storage.local.set({"dayDate": JSON.stringify(new Date())});

  console.log("New words today:", ([...uDict].filter(i => !dayDict.has(i)).length));
}

async function writeUDict() {
  await browser.storage.local.set({"uDict": [...uDict]});
}
async function writeODict() {
  await browser.storage.local.set({"oDict": [...oDict]});
}
async function writeDayDict() {
  await browser.storage.local.set({"dayDict": [...dayDict]});
}

