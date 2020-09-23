var uDict, oDict;

browser.runtime.sendMessage({request: 'isActive'}).then(active => {
  if (active) {
    $("#on").addClass('currentButton');
    init(); /* eslint-disable-line */
  }else
    $("#off").addClass('currentButton');
});

async function on() {
  $("#off").removeClass('currentButton');
  $("#on").addClass('currentButton');
  let active = await browser.runtime.sendMessage({request: 'isActive'});
  if (!active) {
    await browser.runtime.sendMessage({request: 'start'});
    await init();
  }
}
$("#on").click(on);

async function off() {
  $("#off").addClass('currentButton');
  $("#on").removeClass('currentButton');
  let active = await browser.runtime.sendMessage({request: 'isActive'});
  if (active)
    await browser.runtime.sendMessage({request: 'stop'});
}
$("#off").click(off);

async function resetClock() {
  console.log("Reset daily count");
  let active = await browser.runtime.sendMessage({request: 'isActive'});
  if (!active) {
    await browser.runtime.sendMessage({request: 'start'});
  }
  await browser.runtime.sendMessage({request: 'resetDay'});
  await init();
}
$("#clockReset").click(resetClock);

function syncMenu() {
  $("body").toggleClass('sync-menu');
}
$("#sync").click(syncMenu);
$("#shadow").click(syncMenu);

function importJSON(e) {
  var jsonValue = JSON.parse($('#text').val());

  for (var u of jsonValue['uDict']) {
    uDict.add(u);
  }

  for (var o of jsonValue['oDict']) {
    oDict.add(o);
  }
  writeUDict();
  writeODict();
  $("#known-words").html([...uDict].length + " words");
  writeJapNumber();
}
$("#import").click(importJSON);

function exportJSON() {
  var jsonObj = {
    uDict: [...uDict],
    oDict: [...oDict]
  };
  var blob = new Blob([JSON.stringify(jsonObj)], { type: "text/plain;charset=utf-8" });
  var url = window.URL || window.webkitURL;
  var link = url.createObjectURL(blob);
  var a = document.createElement("a");
  a.download = "userDict.json";
  a.href = link;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
$("#export").click(exportJSON);

function deleteDicts() {
  exportJSON();

  browser.runtime.sendMessage({request: 'dropAll'});
}
$("#delete").click(deleteDicts);

async function init() {
  await browser.runtime.sendMessage({request: 'sync'});
  uDict = new Set(await browser.runtime.sendMessage({request: 'getUDict'}));
  oDict = new Set(await browser.runtime.sendMessage({request: 'getODict'}));
  let dayWords = await browser.runtime.sendMessage({request: 'newToday'});
  let ip = await browser.runtime.sendMessage({request: 'syncIP'});
  let sync = await browser.runtime.sendMessage({request: 'isSynced'});

  browser.runtime.sendMessage({request: 'isActive'}).then(active => {
    $("#on").removeClass('currentButton');
    $("#off").removeClass('currentButton');
    if (active) $("#on").addClass('currentButton');
    else $("#off").addClass('currentButton');
  });

  console.log(sync, ip);
  if (sync && ip) {
    $("#status").html(`Connected to <a href="${ip}">${ip}</a>`);
  }else {
    $("#status").html("Failed to connect");
  }

  if (!uDict || !oDict) return;
  $("#known-words").html([...uDict].length + " words (Today: " + dayWords + ")");
  writeJapNumber();
}

function writeUDict() {
  return browser.runtime.sendMessage({request: 'writeUDict', dict: [...uDict]}); }
function writeODict() {
  return browser.runtime.sendMessage({request: 'writeODict', dict: [...oDict]}); }

function getDigit(digit, ones=true) {
  digit = Math.floor(digit) % 10;
  if (!digit) return '';
  if (!ones && digit == 1) return '';
  return '一二三四五六七八九'.charAt(digit - 1);
}
function writeJapNumber() {
  var number = [...uDict].length;
  var numberStr = '' + number;
  var numLen = numberStr.length;

  var str = '語';
  if (numberStr.charAt(numLen-1) > 0) str = getDigit(number) + str;
  if (numberStr.charAt(numLen-2) > 0) str = getDigit(number/10, false) + '十' + str;
  if (numberStr.charAt(numLen-3) > 0) str = getDigit(number/100, false) + '百' + str;
  if (numberStr.charAt(numLen-4) > 0) str = getDigit(number/1000, false) + '千' + str;
  if (numberStr.charAt(numLen-5) > 0) str = getDigit(number/10000) + '万' + str;

  if (str.length == 1) str = '0' + str;
  $("#jap").html(str);
}

async function submit() {
  await on();
  $("#off").removeClass('currentButton');
  $("#on").addClass('currentButton');

  $("#status").html("Connecting...");
  let ip = $("#ip").val();
  let resp = await browser.runtime.sendMessage({request: 'connect',
      ip: ip});

  await init();

  return false;
}
$("input:eq(1)").click(submit);

