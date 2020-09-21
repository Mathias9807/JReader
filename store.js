/* Store.js
 *
 * Handles storing the user dictionaries and indexes.
 *
 * When starting up, this will read indexes, dicts and day info from storage.local.
 */

var uDict, oDict, dayDict, syncIP, syncConnected = false;

async function loadUserDicts() {
  var localStorage = await browser.storage.local.get(["uDict", "oDict",
      "dayDict", "dayDate", "sync"]);

  // Fetch user dictionary
  uDict = new Set();
  if ($.isArray(localStorage["uDict"]))
    uDict = new Set(localStorage["uDict"]);

  // Fetch unknown words dictionary
  oDict = new Set();
  if ($.isArray(localStorage["oDict"]))
    oDict = new Set(localStorage["oDict"]);

  // Fetch today's words dictionary
  dayDict = new Set();
  if ($.isArray(localStorage["dayDict"]))
    dayDict = new Set(localStorage["dayDict"]);

  syncIP = "";
  if (localStorage["sync"])
    syncIP = localStorage["sync"];

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

async function resetDay() {
  dayDict = new Set([...uDict]);
  await writeDayDict();
  await browser.storage.local.set({"dayDate": JSON.stringify(new Date())});
}

async function connect(ip) {
  if (!ip) return false;
  syncConnected = false;

  console.log("Connecting to", ip);
  try {
    // POST our current dictionary
    console.log("Sending", JSON.stringify({uDict: uDict, oDict: oDict}));
    await fetch(ip, {method: 'POST', headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({uDict: Array.from(uDict), oDict: Array.from(oDict)})});

    // and GET the servers dictionary
    var response = await fetch(ip);
    var data = await response.json();
    console.log("Retrieved:", data);

    syncIP = ip;
    syncConnected = true;

    for (let w of data.uDict) uDict.add(w);
    for (let w of data.oDict) oDict.add(w);

    await writeUDict();
    await writeODict();
    await writeSync();

    console.log("\tSucceeded");
    return true;
  }catch (err) {
    console.log(err);
    return false;
  }
}

async function sync() {
  if (!syncConnected) return;
  console.log("Synchronizing with server");

  try {
    // POST our current dictionary
    console.log("Sending", JSON.stringify({uDict: uDict, oDict: oDict}));
    await fetch(syncIP, {method: 'POST', headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify({uDict: Array.from(uDict), oDict: Array.from(oDict)})});

    // and GET the servers dictionary
    var response = await fetch(syncIP);
    var data = await response.json();
    for (let w of data.uDict) uDict.add(w);
    for (let w of data.oDict) oDict.add(w);
    writeUDict();
    writeODict();
    console.log("Retrieved:", data);
  }catch (err) {
    console.log(err);
  }
}
let syncThrottled = throttle(sync, 20000);

async function deleteFromSync(delDict) {
  if (!syncConnected) return;
  console.log("Removing words from sync", delDict);

  try {
    // DELETE the words from sync dictionaries
    await fetch(syncIP, {method: 'DELETE', headers: {'Content-Type': 'text/plain'},
        body: JSON.stringify(delDict)});
  }catch (err) {
    console.log(err);
  }
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
async function writeSync() {
  await browser.storage.local.set({"sync": syncIP});
}

function throttle(callback, limit) {
  var wait = false;                   // Initially, we're not waiting
  var queued = false;                 // If a call was stopped
  return function() {                 // We return a throttled function
    if (!wait) {                      // If we're not waiting
      callback.call();                // Execute users function
      wait = true;                    // Prevent future invocations
      setTimeout(function () {        // After a period of time
        wait = false;                 // And allow future invocations
        if (queued) callback.call();
        queued = false;
      }, limit);
    }else {
      queued = true;                  // A call was blocked
    }
  }
}

